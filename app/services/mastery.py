"""Mastery and points tracking service for learner progress in AGE graph.

Tracks two dimensions of learner progress:
- **Points**: Award for correct answers, track balance on Learner node.
- **Mastery**: MASTERY edges between Learner and Concept nodes with Bayesian
  confidence updates.

Mastery thresholds:
- 0.0-0.3: needs_work
- 0.3-0.7: learning
- 0.7-1.0: mastered

Exports:
- update_mastery()  — Bayesian confidence update on a MASTERY edge
- get_mastery_context() — formatted mastery string for LLM context
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.db import get_connection

logger = logging.getLogger("sunschool.mastery")

GRAPH_NAME = "sunschool_graph"


# ---------------------------------------------------------------------------
# Mastery labels
# ---------------------------------------------------------------------------


def mastery_label(confidence: float) -> str:
    """Convert a mastery confidence score to a human-readable label.

    Thresholds:
    - 0.0-0.3: needs_work
    - 0.3-0.7: learning
    - 0.7-1.0: mastered
    """
    if confidence >= 0.7:
        return "mastered"
    elif confidence >= 0.3:
        return "learning"
    else:
        return "needs_work"


# ---------------------------------------------------------------------------
# AGE helpers
# ---------------------------------------------------------------------------


def _parse_agtype(value: Any) -> Any:
    """Parse an AGE agtype value to a Python type.

    AGE returns agtype values that may be wrapped in quotes or have
    special formatting. This normalizes them.
    """
    if value is None:
        return None
    s = str(value).strip()
    # Remove surrounding quotes
    if s.startswith('"') and s.endswith('"'):
        s = s[1:-1]
    # Try to parse as JSON (handles nested objects, arrays, numbers)
    try:
        return json.loads(s)
    except (json.JSONDecodeError, ValueError):
        pass
    # Try numeric
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        pass
    return s


# ---------------------------------------------------------------------------
# Points operations
# ---------------------------------------------------------------------------


async def award_points(learner_id: str, points: int) -> int:
    """Award points to a learner by updating their point balance in the graph.

    Args:
        learner_id: The learner's node ID in the graph.
        points: Number of points to award (positive integer).

    Returns:
        New total point balance.

    Raises:
        ValueError: If points is negative.
    """
    if points < 0:
        raise ValueError("Points to award must be non-negative")

    async with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    SELECT * FROM cypher(%s, $$
                        MATCH (l:Learner {id: %s})
                        RETURN l.points AS points
                    $$) AS (points agtype);
                    """,
                    (GRAPH_NAME, learner_id),
                )
                row = cur.fetchone()
                if row is None:
                    raise ValueError(f"Learner {learner_id} not found")

                current_points = int(_parse_agtype(row[0]) or 0)
                new_points = current_points + points

                cur.execute(
                    """
                    SELECT * FROM cypher(%s, $$
                        MATCH (l:Learner {id: %s})
                        SET l.points = %s
                        RETURN l
                    $$) AS (learner agtype);
                    """,
                    (GRAPH_NAME, learner_id, new_points),
                )
                conn.commit()
                logger.info(
                    "Awarded %d points to learner %s (total: %d)",
                    points,
                    learner_id,
                    new_points,
                )
                return new_points
            except ValueError:
                raise
            except Exception:
                conn.rollback()
                logger.exception(
                    "Failed to award points to learner %s", learner_id
                )
                raise


async def get_points(learner_id: str) -> dict[str, Any]:
    """Get the current point balance for a learner.

    Args:
        learner_id: The learner's node ID in the graph.

    Returns:
        Dict with learner_id, points balance, and learner name.

    Raises:
        ValueError: If learner not found.
    """
    async with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """
                    SELECT * FROM cypher(%s, $$
                        MATCH (l:Learner {id: %s})
                        RETURN l.points AS points, l.name AS name
                    $$) AS (points agtype, name agtype);
                    """,
                    (GRAPH_NAME, learner_id),
                )
                row = cur.fetchone()
                if row is None:
                    raise ValueError(f"Learner {learner_id} not found")

                return {
                    "learner_id": learner_id,
                    "points": int(_parse_agtype(row[0]) or 0),
                    "name": _parse_agtype(row[1]) or "",
                }
            except ValueError:
                raise
            except Exception:
                logger.exception(
                    "Failed to get points for learner %s", learner_id
                )
                raise


# ---------------------------------------------------------------------------
# Mastery operations
# ---------------------------------------------------------------------------


async def update_mastery(
    learner_id: str,
    concept_name: str,
    score: float,
    is_correct: bool,
    learning_rate: float = 0.2,
) -> dict[str, Any]:
    """Update mastery edge between learner and concept using Bayesian confidence.

    Creates the Concept node and MASTERY edge if they don't exist yet.
    Uses exponential moving average (Bayesian-style) update:
        new_confidence = old + learning_rate * (score - old)

    Args:
        learner_id: The learner's node ID in the graph.
        concept_name: Name of the concept being assessed.
        score: Score from 0.0 to 1.0.
        is_correct: Whether the answer was correct.
        learning_rate: Update rate for the Bayesian update (default 0.2).

    Returns:
        Dict with update details including old/new confidence, level, attempts.

    Raises:
        ValueError: If learner not found or score out of range.
    """
    if not 0.0 <= score <= 1.0:
        raise ValueError(f"Score must be between 0.0 and 1.0, got {score}")

    async with get_connection() as conn:
        with conn.cursor() as cur:
            try:
                # Ensure concept node exists
                cur.execute(
                    """
                    SELECT * FROM cypher(%s, $$
                        MERGE (c:Concept {name: %s})
                        RETURN c
                    $$) AS (concept agtype);
                    """,
                    (GRAPH_NAME, concept_name),
                )

                # Check existing mastery edge
                cur.execute(
                    """
                    SELECT * FROM cypher(%s, $$
                        MATCH (l:Learner {id: %s})-[m:MASTERY]->(c:Concept {name: %s})
                        RETURN m.confidence AS confidence, m.attempts AS attempts,
                               m.correct_count AS correct_count
                    $$) AS (confidence agtype, attempts agtype, correct_count agtype);
                    """,
                    (GRAPH_NAME, learner_id, concept_name),
                )
                row = cur.fetchone()

                if row:
                    old_confidence = float(_parse_agtype(row[0]) or 0.0)
                    old_attempts = int(_parse_agtype(row[1]) or 0)
                    old_correct = int(_parse_agtype(row[2]) or 0)
                else:
                    old_confidence = 0.0
                    old_attempts = 0
                    old_correct = 0

                # Bayesian update
                new_confidence = old_confidence + learning_rate * (
                    score - old_confidence
                )
                new_confidence = max(0.0, min(1.0, new_confidence))
                new_attempts = old_attempts + 1
                new_correct = old_correct + (1 if is_correct else 0)
                new_level = mastery_label(new_confidence)
                now_iso = datetime.now(timezone.utc).isoformat()

                if row:
                    # Update existing edge
                    cur.execute(
                        """
                        SELECT * FROM cypher(%s, $$
                            MATCH (l:Learner {id: %s})-[m:MASTERY]->(c:Concept {name: %s})
                            SET m.confidence = %s, m.attempts = %s,
                                m.correct_count = %s, m.level = %s,
                                m.last_updated = %s
                            RETURN m
                        $$) AS (mastery agtype);
                        """,
                        (
                            GRAPH_NAME,
                            learner_id,
                            concept_name,
                            new_confidence,
                            new_attempts,
                            new_correct,
                            new_level,
                            now_iso,
                        ),
                    )
                else:
                    # Create new mastery edge
                    cur.execute(
                        """
                        SELECT * FROM cypher(%s, $$
                            MATCH (l:Learner {id: %s}), (c:Concept {name: %s})
                            CREATE (l)-[m:MASTERY {
                                confidence: %s, attempts: %s,
                                correct_count: %s, level: %s,
                                last_updated: %s
                            }]->(c)
                            RETURN m
                        $$) AS (mastery agtype);
                        """,
                        (
                            GRAPH_NAME,
                            learner_id,
                            concept_name,
                            new_confidence,
                            new_attempts,
                            new_correct,
                            new_level,
                            now_iso,
                        ),
                    )

                conn.commit()

                update = {
                    "concept": concept_name,
                    "old_confidence": old_confidence,
                    "new_confidence": new_confidence,
                    "level": new_level,
                    "attempts": new_attempts,
                    "correct_count": new_correct,
                    "is_correct": is_correct,
                }
                logger.info(
                    "Mastery update: learner=%s concept=%s %.1f%% -> %.1f%% (%s)",
                    learner_id,
                    concept_name,
                    old_confidence * 100,
                    new_confidence * 100,
                    new_level,
                )
                return update

            except ValueError:
                raise
            except Exception:
                conn.rollback()
                logger.exception(
                    "Failed to update mastery for learner=%s concept=%s",
                    learner_id,
                    concept_name,
                )
                raise


async def get_mastery(learner_id: str) -> dict[str, Any]:
    """Get all mastery data for a learner.

    Queries all MASTERY edges from the learner to Concept nodes and returns
    structured data grouped by mastery level.

    Args:
        learner_id: The learner's node ID in the graph.

    Returns:
        Dict with learner_id, concepts list, summary counts, and overall score.

    Raises:
        ValueError: If learner not found.
    """
    async with get_connection() as conn:
        with conn.cursor() as cur:
            # Verify learner exists
            cur.execute(
                """
                SELECT * FROM cypher(%s, $$
                    MATCH (l:Learner {id: %s})
                    RETURN l.name AS name
                $$) AS (name agtype);
                """,
                (GRAPH_NAME, learner_id),
            )
            learner_row = cur.fetchone()
            if learner_row is None:
                raise ValueError(f"Learner {learner_id} not found")

            learner_name = _parse_agtype(learner_row[0]) or ""

            # Query all mastery edges
            cur.execute(
                """
                SELECT * FROM cypher(%s, $$
                    MATCH (l:Learner {id: %s})-[m:MASTERY]->(c:Concept)
                    RETURN c.name AS concept, m.confidence AS confidence,
                           m.level AS level, m.attempts AS attempts,
                           m.correct_count AS correct_count,
                           m.last_updated AS last_updated
                $$) AS (concept agtype, confidence agtype, level agtype,
                        attempts agtype, correct_count agtype, last_updated agtype);
                """,
                (GRAPH_NAME, learner_id),
            )
            rows = cur.fetchall()

    concepts = []
    total_confidence = 0.0
    level_counts = {"mastered": 0, "learning": 0, "needs_work": 0}

    for row in rows:
        confidence = float(_parse_agtype(row[1]) or 0.0)
        level = _parse_agtype(row[2]) or mastery_label(confidence)
        attempts = int(_parse_agtype(row[3]) or 0)
        correct_count = int(_parse_agtype(row[4]) or 0)
        last_updated = _parse_agtype(row[5])

        concept_data = {
            "concept": _parse_agtype(row[0]),
            "confidence": round(confidence, 4),
            "level": level,
            "attempts": attempts,
            "correct_count": correct_count,
            "last_updated": last_updated,
        }
        concepts.append(concept_data)
        total_confidence += confidence
        if level in level_counts:
            level_counts[level] += 1

    overall = round(total_confidence / len(concepts), 4) if concepts else 0.0

    return {
        "learner_id": learner_id,
        "learner_name": learner_name,
        "overall_mastery": overall,
        "overall_level": mastery_label(overall),
        "total_concepts": len(concepts),
        "summary": level_counts,
        "concepts": concepts,
    }


def get_mastery_context(cur: Any, learner_id: str, subject: str = "") -> str:
    """Get mastery context string for a learner (synchronous, cursor-based).

    Designed for use inside existing database transactions, e.g. from the
    conductor service when building LLM context.

    Args:
        cur: Database cursor with AGE initialized.
        learner_id: The learner's node ID.
        subject: Optional subject filter (currently unused, reserved).

    Returns:
        Formatted mastery context string for LLM prompts, or empty string
        if no mastery data exists.
    """
    mastery_items = []
    try:
        cur.execute(
            """
            SELECT * FROM cypher(%s, $$
                MATCH (l:Learner {id: %s})-[m:MASTERY]->(c:Concept)
                RETURN c.name AS concept, m.confidence AS confidence, m.level AS level
            $$) AS (concept agtype, confidence agtype, level agtype);
            """,
            (GRAPH_NAME, learner_id),
        )
        rows = cur.fetchall()
        for row in rows:
            concept_name = _parse_agtype(row[0])
            confidence = _parse_agtype(row[1])
            if confidence is None:
                confidence = 0.0
            label = mastery_label(float(confidence))
            mastery_items.append(
                f"- {concept_name}: {label} ({float(confidence):.1%})"
            )
    except Exception:
        logger.exception(
            "Failed to get mastery context for learner %s", learner_id
        )

    if not mastery_items:
        return ""
    return "Current mastery levels:\n" + "\n".join(mastery_items)
