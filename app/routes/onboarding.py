"""Onboarding endpoints — guided first experience for new parents.

POST  /api/onboarding/setup   — Create children + default conversations with Sunny greeting
GET   /api/onboarding/status  — Check whether the parent still needs onboarding

All routes require authentication.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.db import get_connection
from app.middleware.auth import CurrentUser
from app.services.prompt_templates import GradeBand, grade_to_band

logger = logging.getLogger("sunschool.routes.onboarding")

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

GRAPH_NAME = "sunschool_graph"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _escape_cypher_string(value: str) -> str:
    """Escape a string for safe inclusion in AGE cypher literals."""
    return value.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


def _parse_agtype(value: Any) -> str | None:
    """Parse an agtype value returned by AGE into a Python string."""
    if value is None:
        return None
    s = str(value).strip('"')
    return s if s and s != "null" else None


def _sunny_greeting(name: str, grade_level: int) -> str:
    """Generate Sunny's initial greeting message, adapted to grade level.

    This is a static template — no LLM call needed.  The first *real* LLM
    interaction happens when the learner replies.
    """
    band = grade_to_band(grade_level)

    if band == GradeBand.K_2:
        return (
            f"Hi {name}! 🌟 I'm Sunny!\n\n"
            f"I LOVE learning new things. Do you want to learn about "
            f"animals 🐶, space 🚀, or something else? Pick one!"
        )
    elif band == GradeBand.GRADE_3_5:
        return (
            f"Hey {name}! 👋 I'm Sunny, your learning buddy!\n\n"
            f"I'm here to help you explore cool topics and have fun while we learn. "
            f"What sounds interesting to you — science, history, math, or something else entirely?"
        )
    elif band == GradeBand.GRADE_6_8:
        return (
            f"Hey {name}! I'm Sunny — think of me as your personal tutor "
            f"who actually makes learning interesting. 😄\n\n"
            f"What subject or topic are you curious about right now? "
            f"We can dive into anything — science, history, math, literature, coding — you name it."
        )
    else:  # 9-12
        return (
            f"Hi {name}! I'm Sunny, your AI tutor.\n\n"
            f"I'm here to help you explore topics in depth and think critically about what you're learning. "
            f"What would you like to work on? Whether it's a school subject, a project, "
            f"or something you're just curious about — let's get started."
        )


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ChildInput(BaseModel):
    """A single child to create during onboarding."""

    name: str = Field(..., min_length=1, max_length=100)
    grade_level: int = Field(..., ge=0, le=12)


class OnboardingSetupRequest(BaseModel):
    """Request body for POST /api/onboarding/setup."""

    children: list[ChildInput] = Field(..., min_length=1, max_length=10)


class LearnerResult(BaseModel):
    """Result for a single learner created during onboarding."""

    id: str
    name: str
    grade_level: int
    conversation_id: str


class OnboardingSetupResponse(BaseModel):
    """Response from POST /api/onboarding/setup."""

    learners: list[LearnerResult]


class LearnerInfo(BaseModel):
    """Learner summary for status endpoint."""

    id: str
    name: str
    grade_level: int


class OnboardingStatusResponse(BaseModel):
    """Response from GET /api/onboarding/status."""

    needs_onboarding: bool
    learners: list[LearnerInfo]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get(
    "/status",
    response_model=OnboardingStatusResponse,
)
async def onboarding_status(user: CurrentUser) -> OnboardingStatusResponse:
    """Check whether the authenticated parent needs onboarding.

    Returns needs_onboarding=true if the user has no HAS_CHILD edges
    (i.e. no children have been added yet).
    """
    uid = _escape_cypher_string(user.uid)

    async with get_connection() as conn:
        with conn.cursor() as cur:
            # Ensure User node exists
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MERGE (u:User {{uid: '{uid}'}})
                    SET u.email = '{_escape_cypher_string(user.email or "")}',
                        u.name = '{_escape_cypher_string(user.display_name or user.email or "Parent")}'
                    RETURN u.uid
                $$) AS (uid agtype);
            """)

            # Check for children
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (u:User {{uid: '{uid}'}})-[:HAS_CHILD]->(l:Learner)
                    RETURN l.id, l.name, l.grade_level
                    ORDER BY l.name
                $$) AS (id agtype, name agtype, grade_level agtype);
            """)
            rows = cur.fetchall()
        conn.commit()

    learners: list[LearnerInfo] = []
    for row in rows:
        lid = _parse_agtype(row[0]) or ""
        lname = _parse_agtype(row[1]) or ""
        grade = 0
        if row[2] is not None:
            try:
                grade = int(str(row[2]).strip('"'))
            except (ValueError, TypeError):
                grade = 0
        learners.append(LearnerInfo(id=lid, name=lname, grade_level=grade))

    return OnboardingStatusResponse(
        needs_onboarding=len(learners) == 0,
        learners=learners,
    )


@router.post(
    "/setup",
    response_model=OnboardingSetupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def onboarding_setup(
    body: OnboardingSetupRequest,
    user: CurrentUser,
) -> OnboardingSetupResponse:
    """Complete onboarding: create children, conversations, and Sunny's greeting.

    For each child in the request:
    1. Creates/updates User node for the parent
    2. Creates Learner node with name + grade_level
    3. Creates HAS_CHILD edge from parent → learner
    4. Creates a default Conversation for the learner with Sunny
    5. Stores an initial assistant message: Sunny's grade-appropriate greeting

    Returns the list of created learners with their conversation IDs.
    """
    uid = _escape_cypher_string(user.uid)
    email = _escape_cypher_string(user.email or "")
    display_name = _escape_cypher_string(
        user.display_name or user.email or "Parent"
    )

    results: list[LearnerResult] = []

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

            for child in body.children:
                learner_id = str(uuid.uuid4())
                conv_id = str(uuid.uuid4())
                msg_id = str(uuid.uuid4())
                now_iso = datetime.now(timezone.utc).isoformat()
                esc_name = _escape_cypher_string(child.name)
                esc_lid = _escape_cypher_string(learner_id)
                esc_cid = _escape_cypher_string(conv_id)

                # Create Learner node
                cur.execute(f"""
                    SELECT * FROM cypher('{GRAPH_NAME}', $$
                        CREATE (l:Learner {{
                            id: '{esc_lid}',
                            name: '{esc_name}',
                            grade_level: {child.grade_level},
                            points: 0,
                            parent_uid: '{uid}'
                        }})
                        RETURN l.id
                    $$) AS (id agtype);
                """)

                # Create HAS_CHILD edge
                cur.execute(f"""
                    SELECT * FROM cypher('{GRAPH_NAME}', $$
                        MATCH (u:User {{uid: '{uid}'}}), (l:Learner {{id: '{esc_lid}'}})
                        CREATE (u)-[:HAS_CHILD]->(l)
                        RETURN u.uid
                    $$) AS (uid agtype);
                """)

                # Create default Conversation node for this learner
                cur.execute(f"""
                    SELECT * FROM cypher('{GRAPH_NAME}', $$
                        CREATE (c:Conversation {{
                            id: '{esc_cid}',
                            learner_id: '{esc_lid}',
                            subject: 'General',
                            current_concept: '',
                            character_name: 'Sunny',
                            character_personality: 'Friendly and encouraging AI tutor',
                            summary: '',
                            status: 'active',
                            started_at: '{now_iso}',
                            last_active: '{now_iso}',
                            message_count: 1
                        }})
                        RETURN c.id
                    $$) AS (id agtype);
                """)

                # Store Sunny's initial greeting in conversation_messages
                greeting = _sunny_greeting(child.name, child.grade_level)
                cur.execute(
                    """
                    INSERT INTO conversation_messages
                        (id, conversation_id, role, content, metadata, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s);
                    """,
                    (
                        msg_id,
                        conv_id,
                        "assistant",
                        greeting,
                        json.dumps({"onboarding_greeting": True}),
                        datetime.now(timezone.utc),
                    ),
                )

                results.append(
                    LearnerResult(
                        id=learner_id,
                        name=child.name,
                        grade_level=child.grade_level,
                        conversation_id=conv_id,
                    )
                )

        conn.commit()

    logger.info(
        "Onboarding completed for parent %s: created %d learner(s)",
        user.uid,
        len(results),
    )

    return OnboardingSetupResponse(learners=results)
