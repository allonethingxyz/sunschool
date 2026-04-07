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
# Parent guidelines stub endpoints
# ---------------------------------------------------------------------------
_guidelines_store: dict[str, str] = {}


@app.get("/api/parent/guidelines")
async def get_guidelines() -> dict:
    """Get the parent-set content guidelines."""
    return {"guidelines": _guidelines_store.get("default", "")}


@app.put("/api/parent/guidelines")
async def update_guidelines(body: dict) -> dict:
    """Update the parent-set content guidelines."""
    _guidelines_store["default"] = body.get("guidelines", "")
    return {"ok": True, "guidelines": _guidelines_store["default"]}


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
