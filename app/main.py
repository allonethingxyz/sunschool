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
    version="0.2.0",
)


# ---------------------------------------------------------------------------
# Health check (used by Railway healthcheckPath)
# ---------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint for Railway deployment."""
    return {"status": "ok", "version": "0.2.0"}


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
# Admin endpoints (dev bypass only)
# ---------------------------------------------------------------------------
@app.post("/api/admin/migrate")
async def run_migrations() -> dict:
    """Run database migrations (conversation_messages table)."""
    from app.db import get_connection

    async with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS conversation_messages (
                    id UUID PRIMARY KEY,
                    conversation_id UUID NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                    content TEXT NOT NULL,
                    metadata JSONB,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_conv_msg_conversation "
                "ON conversation_messages (conversation_id);"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_conv_msg_created "
                "ON conversation_messages (conversation_id, created_at DESC);"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_conv_msg_role "
                "ON conversation_messages (conversation_id, role);"
            )
        conn.commit()
    return {"ok": True, "message": "Migrations complete"}


@app.post("/api/admin/seed")
async def seed_test_data() -> dict:
    """Seed test data for smoke testing."""
    import uuid
    from datetime import datetime, timezone

    from app.db import get_connection

    GRAPH_NAME = "sunschool_graph"
    learner_id = "test-learner-001"
    parent_uid = "dev-user-001"
    conv_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    async with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MERGE (u:User {{uid: '{parent_uid}'}})
                    SET u.email = 'dev@sunschool.test', u.name = 'Dev Parent'
                    RETURN u.uid
                $$) AS (uid agtype);
            """)
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MERGE (l:Learner {{id: '{learner_id}'}})
                    SET l.name = 'Test Learner', l.grade_level = 5, l.points = 0
                    RETURN l.id
                $$) AS (id agtype);
            """)
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (u:User {{uid: '{parent_uid}'}}), (l:Learner {{id: '{learner_id}'}})
                    MERGE (u)-[:HAS_CHILD]->(l)
                    RETURN u.uid
                $$) AS (uid agtype);
            """)
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    CREATE (c:Conversation {{
                        id: '{conv_id}',
                        learner_id: '{learner_id}',
                        subject: 'Science',
                        current_concept: 'Photosynthesis',
                        character_name: 'Professor Oak',
                        character_personality: 'Wise and patient nature expert',
                        summary: '',
                        status: 'active',
                        started_at: '{now_iso}',
                        last_active: '{now_iso}',
                        message_count: 0
                    }})
                    RETURN c.id
                $$) AS (id agtype);
            """)
        conn.commit()
    return {
        "ok": True,
        "parent_uid": parent_uid,
        "learner_id": learner_id,
        "conversation_id": conv_id,
    }


@app.get("/api/admin/db-check")
async def db_check() -> dict:
    """Check database connectivity and AGE status."""
    from app.db import get_connection

    result: dict = {"database": "unknown", "age": "unknown", "graph": "unknown"}
    try:
        async with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version()")
                result["database"] = cur.fetchone()[0]
                cur.execute(
                    "SELECT extname FROM pg_extension WHERE extname = 'age'"
                )
                row = cur.fetchone()
                result["age"] = "installed" if row else "not installed"
                cur.execute("""
                    SELECT * FROM cypher('sunschool_graph', $$
                        MATCH (n) RETURN count(n)
                    $$) AS (count agtype);
                """)
                count = cur.fetchone()[0]
                result["graph"] = f"sunschool_graph ({count} nodes)"
    except Exception as e:
        result["error"] = str(e)
    return result


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
