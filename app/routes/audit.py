"""Prompt audit endpoints — parent-facing API for viewing LLM call history.

GET /api/audit/prompts — Paginated list of prompt audit entries for a learner

All routes require authentication. Parents can only see audit entries
for their own children.
"""

from __future__ import annotations

import logging
import math
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.db import get_connection
from app.middleware.auth import CurrentUser

logger = logging.getLogger("sunschool.audit")

GRAPH_NAME = "sunschool_graph"

router = APIRouter(prefix="/api/audit", tags=["audit"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class PromptAuditEntry(BaseModel):
    """A single prompt audit log entry."""

    id: str
    learner_id: str
    conversation_id: str | None = None
    prompt_type: str | None = None
    system_message: str | None = None
    user_message: str | None = None
    model: str | None = None
    response_preview: str | None = None
    tokens_used: int | None = None
    cost_estimate: float | None = None
    created_at: str | None = None


class PaginatedAuditResponse(BaseModel):
    """Paginated prompt audit list."""

    entries: list[PromptAuditEntry]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _escape_cypher_string(value: str) -> str:
    """Escape a string for safe inclusion in AGE cypher literals."""
    return value.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


async def _verify_parent_owns_learner(user_uid: str, learner_id: str) -> None:
    """Verify the authenticated user is the parent of the given learner.

    Checks:
    1. Parent→Learner HAS_CHILD edge in the graph, OR
    2. User's own uid matches the learner_id (self-learner).

    Raises 403 if not authorised.
    """
    async with get_connection() as conn:
        with conn.cursor() as cur:
            # Check parent->learner ownership via HAS_CHILD edge
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (p:User {{uid: '{_escape_cypher_string(user_uid)}'}})-[:HAS_CHILD]->(l:Learner {{id: '{_escape_cypher_string(learner_id)}'}})
                    RETURN l.id
                $$) AS (lid agtype);
                """
            )
            if cur.fetchone():
                return

            # Check direct learner access (user IS the learner)
            if user_uid == learner_id:
                return

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorised to view this learner's audit data",
            )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/prompts", response_model=PaginatedAuditResponse)
async def list_prompt_audits(
    user: CurrentUser,
    learner_id: str = Query(..., description="Learner ID to fetch audit entries for"),
    prompt_type: str | None = Query(
        default=None, description="Filter by prompt type (e.g. conversation, quiz_gen)"
    ),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Entries per page"),
) -> PaginatedAuditResponse:
    """List prompt audit entries for a learner.

    Requires authentication. The authenticated user must be the parent
    of the specified learner (verified via HAS_CHILD edge in the graph).
    """
    # Verify the parent owns this learner
    await _verify_parent_owns_learner(user.uid, learner_id)

    offset = (page - 1) * page_size
    entries: list[PromptAuditEntry] = []
    total = 0

    async with get_connection() as conn:
        with conn.cursor() as cur:
            # Build WHERE clause
            where_clauses = ["learner_id = %s"]
            params: list[Any] = [learner_id]

            if prompt_type:
                where_clauses.append("prompt_type = %s")
                params.append(prompt_type)

            where_sql = " AND ".join(where_clauses)

            # Get total count
            cur.execute(
                f"SELECT COUNT(*) FROM prompt_audit WHERE {where_sql};",
                params,
            )
            count_row = cur.fetchone()
            total = int(count_row[0]) if count_row else 0

            # Get page of entries (newest first)
            cur.execute(
                f"""
                SELECT id, learner_id, conversation_id, prompt_type,
                       system_message, user_message, model,
                       response_preview, tokens_used, cost_estimate,
                       created_at
                FROM prompt_audit
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s;
                """,
                [*params, page_size, offset],
            )
            rows = cur.fetchall()

            for row in rows:
                cost = row[9]
                if isinstance(cost, Decimal):
                    cost = float(cost)

                entries.append(
                    PromptAuditEntry(
                        id=str(row[0]),
                        learner_id=str(row[1]),
                        conversation_id=str(row[2]) if row[2] else None,
                        prompt_type=row[3],
                        system_message=row[4],
                        user_message=row[5],
                        model=row[6],
                        response_preview=row[7],
                        tokens_used=row[8],
                        cost_estimate=cost,
                        created_at=str(row[10]) if row[10] else None,
                    )
                )

    total_pages = max(1, math.ceil(total / page_size))

    return PaginatedAuditResponse(
        entries=entries,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )
