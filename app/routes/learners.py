"""Learner management endpoints — parent-facing API for child learners.

POST  /api/learners  — Create a child learner (parent auth required)
GET   /api/learners  — List parent's children

All routes require authentication.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.db import get_connection
from app.middleware.auth import CurrentUser

logger = logging.getLogger("sunschool.routes.learners")

router = APIRouter(prefix="/api/learners", tags=["learners"])

GRAPH_NAME = "sunschool_graph"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _escape_cypher_string(value: str) -> str:
    """Escape a string for safe inclusion in AGE cypher literals."""
    return value.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class CreateLearnerRequest(BaseModel):
    """Request body for POST /api/learners."""

    name: str = Field(..., min_length=1, max_length=100)
    grade_level: int = Field(..., ge=0, le=12)


class LearnerResponse(BaseModel):
    """Single learner object."""

    learner_id: str
    name: str
    grade_level: int


class LearnerListResponse(BaseModel):
    """Response for GET /api/learners."""

    learners: list[LearnerResponse]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=LearnerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_learner(
    body: CreateLearnerRequest,
    user: CurrentUser,
) -> LearnerResponse:
    """Create a child learner linked to the authenticated parent.

    Creates a Learner node in the AGE graph with a new UUID,
    and creates a HAS_CHILD edge from the parent User node.
    """
    learner_id = str(uuid.uuid4())
    uid = _escape_cypher_string(user.uid)
    name = _escape_cypher_string(body.name)
    grade_level = body.grade_level
    email = _escape_cypher_string(user.email or "")
    display_name = _escape_cypher_string(user.display_name or user.email or "Parent")

    async with get_connection() as conn:
        with conn.cursor() as cur:
            # Ensure User node exists
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MERGE (u:User {{uid: '{uid}'}})
                    SET u.email = '{email}', u.name = '{display_name}'
                    RETURN u.uid
                $$) AS (uid agtype);
            """)

            # Create Learner node with parent_uid for quick lookup
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    CREATE (l:Learner {{
                        id: '{_escape_cypher_string(learner_id)}',
                        name: '{name}',
                        grade_level: {grade_level},
                        points: 0,
                        parent_uid: '{uid}'
                    }})
                    RETURN l.id
                $$) AS (id agtype);
            """)

            # Create HAS_CHILD edge from User to Learner
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (u:User {{uid: '{uid}'}}), (l:Learner {{id: '{_escape_cypher_string(learner_id)}'}})
                    CREATE (u)-[:HAS_CHILD]->(l)
                    RETURN u.uid
                $$) AS (uid agtype);
            """)

        conn.commit()

    logger.info(
        "Created learner %s (name=%s, grade=%d) for parent %s",
        learner_id,
        body.name,
        grade_level,
        user.uid,
    )

    return LearnerResponse(
        learner_id=learner_id,
        name=body.name,
        grade_level=grade_level,
    )


@router.get(
    "",
    response_model=LearnerListResponse,
)
async def list_learners(
    user: CurrentUser,
) -> LearnerListResponse:
    """List all child learners for the authenticated parent.

    Returns learners connected to the parent User via HAS_CHILD edges.
    """
    uid = _escape_cypher_string(user.uid)

    async with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (u:User {{uid: '{uid}'}})-[:HAS_CHILD]->(l:Learner)
                    RETURN l.id, l.name, l.grade_level
                    ORDER BY l.name
                $$) AS (id agtype, name agtype, grade_level agtype);
            """)
            rows = cur.fetchall()

    learners: list[LearnerResponse] = []
    for row in rows:
        lid = str(row[0]).strip('"') if row[0] else ""
        lname = str(row[1]).strip('"') if row[1] else ""
        grade = 0
        if row[2] is not None:
            try:
                grade = int(str(row[2]).strip('"'))
            except (ValueError, TypeError):
                grade = 0

        learners.append(LearnerResponse(
            learner_id=lid,
            name=lname,
            grade_level=grade,
        ))

    return LearnerListResponse(learners=learners)
