"""Points and mastery tracking API routes.

GET /api/learners/{learner_id}/points  — Get point balance for a learner
GET /api/learners/{learner_id}/mastery — Get mastery data for a learner
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.db import get_connection
from app.services.mastery import GRAPH_NAME, _parse_agtype

logger = logging.getLogger("sunschool.routes.mastery")

router = APIRouter(prefix="/api/learners", tags=["mastery"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class PointsResponse(BaseModel):
    """Response for GET /api/learners/{id}/points."""

    learner_id: str
    name: str = ""
    points: int = 0


class ConceptMasteryItem(BaseModel):
    """A single concept's mastery data."""

    concept: str
    confidence: float
    level: str
    attempts: int = 0
    correct_count: int = 0
    last_updated: str | None = None


class MasterySummary(BaseModel):
    """Summary counts by mastery level."""

    mastered: int = 0
    learning: int = 0
    needs_work: int = 0


class MasteryResponse(BaseModel):
    """Response for GET /api/learners/{id}/mastery."""

    learner_id: str
    learner_name: str = ""
    overall_mastery: float = 0.0
    overall_level: str = "needs_work"
    total_concepts: int = 0
    summary: MasterySummary = Field(default_factory=MasterySummary)
    concepts: list[ConceptMasteryItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helper: verify learner exists
# ---------------------------------------------------------------------------


async def _verify_learner_exists(learner_id: str) -> bool:
    """Check that a learner node exists in the AGE graph."""
    async with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM cypher(%s, $$
                    MATCH (l:Learner {id: %s})
                    RETURN l.id
                $$) AS (id agtype);
                """,
                (GRAPH_NAME, learner_id),
            )
            return cur.fetchone() is not None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{learner_id}/points", response_model=PointsResponse)
async def get_learner_points(learner_id: str) -> PointsResponse:
    """Get the current point balance for a learner.

    Points are awarded for correct answers during tutoring sessions.
    The balance is stored on the Learner node in the AGE graph.
    """
    from app.services.mastery import get_points

    try:
        data = await get_points(learner_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Learner {learner_id} not found",
        )
    except Exception:
        logger.exception("Error fetching points for learner %s", learner_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch points",
        )

    return PointsResponse(
        learner_id=data["learner_id"],
        name=data["name"],
        points=data["points"],
    )


@router.get("/{learner_id}/mastery", response_model=MasteryResponse)
async def get_learner_mastery(learner_id: str) -> MasteryResponse:
    """Get mastery data for a learner.

    Returns all concepts the learner has been assessed on, with Bayesian
    confidence scores, mastery levels, attempt counts, and an overall summary.

    Mastery thresholds:
    - 0.0-0.3: needs_work
    - 0.3-0.7: learning
    - 0.7-1.0: mastered
    """
    from app.services.mastery import get_mastery

    try:
        data = await get_mastery(learner_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Learner {learner_id} not found",
        )
    except Exception:
        logger.exception("Error fetching mastery for learner %s", learner_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch mastery data",
        )

    return MasteryResponse(
        learner_id=data["learner_id"],
        learner_name=data["learner_name"],
        overall_mastery=data["overall_mastery"],
        overall_level=data["overall_level"],
        total_concepts=data["total_concepts"],
        summary=MasterySummary(**data["summary"]),
        concepts=[ConceptMasteryItem(**c) for c in data["concepts"]],
    )
