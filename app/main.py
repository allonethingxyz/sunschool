"""Sunschool FastAPI application entry point.

Mounts the API routers and serves the static frontend.
Run with: uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import get_connection
from app.middleware.auth import CurrentUser
from app.routes import conversations, mastery

logger = logging.getLogger("sunschool")

app = FastAPI(
    title="Sunschool",
    description="AI tutoring platform for kids",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API routers
# ---------------------------------------------------------------------------
app.include_router(conversations.router)
app.include_router(mastery.router)


# ---------------------------------------------------------------------------
# Auth config endpoint (so the frontend can initialize Google Sign-In)
# ---------------------------------------------------------------------------
@app.get("/api/config/auth")
async def auth_config() -> dict:
    """Return the auth config for the frontend."""
    return {
        "clientId": settings.google_oauth_client_id,
        "provider": "google",
    }


# ---------------------------------------------------------------------------
# Parent guidelines endpoints (persisted to DB, authenticated)
# ---------------------------------------------------------------------------


@app.get("/api/parent/guidelines")
async def get_guidelines(user: CurrentUser) -> dict:
    """Get the parent-set content guidelines for the authenticated user."""
    async with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT guidelines FROM parent_guidelines WHERE user_uid = %s",
                (user.uid,),
            )
            row = cur.fetchone()
    return {"guidelines": row[0] if row else ""}


@app.put("/api/parent/guidelines")
async def update_guidelines(body: dict, user: CurrentUser) -> dict:
    """Update the parent-set content guidelines for the authenticated user."""
    guidelines_text = body.get("guidelines", "")
    async with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO parent_guidelines (user_uid, guidelines, updated_at)
                VALUES (%s, %s, now())
                ON CONFLICT (user_uid)
                DO UPDATE SET guidelines = EXCLUDED.guidelines,
                              updated_at = now()
                """,
                (user.uid, guidelines_text),
            )
        conn.commit()
    return {"ok": True, "guidelines": guidelines_text}


# ---------------------------------------------------------------------------
# Admin: run migrations
# ---------------------------------------------------------------------------

PARENT_GUIDELINES_DDL = """
CREATE TABLE IF NOT EXISTS parent_guidelines (
    user_uid TEXT PRIMARY KEY,
    guidelines TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT now()
);
"""


@app.post("/api/admin/migrate")
async def run_migrations() -> dict:
    """Run all pending DDL migrations."""
    results: list[str] = []
    async with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(PARENT_GUIDELINES_DDL)
            results.append("parent_guidelines table ensured")
        conn.commit()
    return {"ok": True, "migrations": results}


# ---------------------------------------------------------------------------
# Static files — serve the frontend SPA
# ---------------------------------------------------------------------------
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def index():
    """Serve the SPA index.html for the root path."""
    return FileResponse("static/index.html")


# Catch-all for SPA client-side routing (non-API paths)
@app.get("/{path:path}")
async def spa_catchall(path: str):
    """Serve index.html for any non-API, non-static path to support SPA routing."""
    if path.startswith("api/") or path.startswith("static/"):
        # Let FastAPI handle these normally (will 404 if not found)
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse("static/index.html")
