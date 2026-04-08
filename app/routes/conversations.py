"""Conversation endpoints — learner-facing API for tutoring sessions.

POST   /api/conversations/{id}/message  — Send message, get AI tutor response
GET    /api/conversations/{id}/messages  — Paginated message history with quiz states
GET    /api/conversations                — List conversations for a learner
POST   /api/conversations/{id}/answer    — Score a quiz answer via conductor

All routes require authentication.  Every AI response passes content validation
before being returned to the client.
"""

from __future__ import annotations

import json
import logging
import math
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.db import get_connection
from app.middleware.auth import CurrentUser
from app.services.conductor import ConductorService
from app.services.content_validator import content_validator

logger = logging.getLogger("sunschool.conversations")

router = APIRouter(prefix="/api/conversations", tags=["conversations"])

GRAPH_NAME = "sunschool_graph"

# ---------------------------------------------------------------------------
# Auto-provisioning: create User + Learner nodes on first access
# ---------------------------------------------------------------------------


async def _ensure_user_and_learner(user) -> str:
    """Ensure a User node and Learner node exist for the authenticated user.

    Creates them if they don't exist. Returns the learner_id (same as user.uid).
    AGE 1.5 does not support MERGE ... ON CREATE SET, so we use
    MATCH-then-CREATE logic instead.
    """
    uid = _escape_cypher_string(user.uid)
    email = _escape_cypher_string(user.email or "")
    name = _escape_cypher_string(user.display_name or user.email or "Learner")

    async with get_connection() as conn:
        with conn.cursor() as cur:
            # Ensure User node exists (MATCH or CREATE — AGE MERGE can be unreliable)
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (u:User {{uid: '{uid}'}})
                    RETURN u.uid
                $$) AS (uid agtype);
            """)
            if not cur.fetchone():
                cur.execute(f"""
                    SELECT * FROM cypher('{GRAPH_NAME}', $$
                        CREATE (u:User {{uid: '{uid}', email: '{email}', name: '{name}'}})
                        RETURN u.uid
                    $$) AS (uid agtype);
                """)
            else:
                cur.execute(f"""
                    SELECT * FROM cypher('{GRAPH_NAME}', $$
                        MATCH (u:User {{uid: '{uid}'}})
                        SET u.email = '{email}', u.name = '{name}'
                        RETURN u.uid
                    $$) AS (uid agtype);
                """)

            # Check if Learner exists
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (l:Learner {{id: '{uid}'}})
                    RETURN l.id
                $$) AS (id agtype);
            """)
            learner_row = cur.fetchone()

            if not learner_row:
                # Create Learner node with defaults
                cur.execute(f"""
                    SELECT * FROM cypher('{GRAPH_NAME}', $$
                        CREATE (l:Learner {{
                            id: '{uid}',
                            name: '{name}',
                            grade_level: 5,
                            points: 0
                        }})
                        RETURN l.id
                    $$) AS (id agtype);
                """)

            # Ensure parent→learner edge exists
            cur.execute(f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (u:User {{uid: '{uid}'}})-[r:HAS_CHILD]->(l:Learner {{id: '{uid}'}})
                    RETURN r
                $$) AS (rel agtype);
            """)
            edge_row = cur.fetchone()

            if not edge_row:
                cur.execute(f"""
                    SELECT * FROM cypher('{GRAPH_NAME}', $$
                        MATCH (u:User {{uid: '{uid}'}}), (l:Learner {{id: '{uid}'}})
                        CREATE (u)-[:HAS_CHILD]->(l)
                        RETURN u.uid
                    $$) AS (uid agtype);
                """)

        conn.commit()
    return user.uid


# ---------------------------------------------------------------------------
# Shared helpers
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


def _parse_agtype_number(value: Any, default: float | int = 0) -> float | int:
    """Parse an agtype numeric value."""
    if value is None:
        return default
    raw = str(value).strip('"')
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except (ValueError, TypeError):
        return default


def _parse_agtype_json(value: Any) -> dict | list | None:
    """Parse an agtype JSON value into a Python object."""
    if value is None:
        return None
    raw = str(value).strip('"')
    if not raw or raw == "null":
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def _verify_learner_access(user_uid: str, conversation_id: str) -> dict[str, Any]:
    """Verify the authenticated user has access to this conversation.

    A user can access a conversation if:
    - They are the parent of the learner who owns the conversation, OR
    - Their uid matches the learner_id on the conversation (learner role).

    Returns the conversation metadata dict on success.
    Raises 404 if not found or not authorised.
    """
    async with get_connection() as conn:
        with conn.cursor() as cur:
            # First try: parent owns the learner that owns the conversation
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (c:Conversation {{id: '{_escape_cypher_string(conversation_id)}'}})
                    RETURN c.id, c.learner_id, c.subject, c.current_concept,
                           c.character_name, c.character_personality,
                           c.summary, c.status, c.started_at, c.last_active,
                           c.message_count
                $$) AS (id agtype, learner_id agtype, subject agtype,
                        current_concept agtype, character_name agtype,
                        character_personality agtype, summary agtype,
                        conv_status agtype, started_at agtype,
                        last_active agtype, message_count agtype);
                """
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation not found",
                )

            conv = {
                "id": _parse_agtype(row[0]),
                "learner_id": _parse_agtype(row[1]),
                "subject": _parse_agtype(row[2]),
                "current_concept": _parse_agtype(row[3]),
                "character_name": _parse_agtype(row[4]),
                "character_personality": _parse_agtype(row[5]),
                "summary": _parse_agtype(row[6]),
                "status": _parse_agtype(row[7]),
                "started_at": _parse_agtype(row[8]),
                "last_active": _parse_agtype(row[9]),
                "message_count": _parse_agtype_number(row[10]),
            }

            learner_id = conv["learner_id"]
            if not learner_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation not found",
                )

            # Check parent->learner ownership
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (p:User {{uid: '{_escape_cypher_string(user_uid)}'}})-[:HAS_CHILD]->(l:Learner {{id: '{_escape_cypher_string(learner_id)}'}})
                    RETURN l.id
                $$) AS (lid agtype);
                """
            )
            parent_row = cur.fetchone()
            if parent_row:
                return conv

            # Check direct learner access (learner_id stored on User node)
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (u:User {{uid: '{_escape_cypher_string(user_uid)}'}})
                    RETURN u.learner_id
                $$) AS (learner_id agtype);
                """
            )
            user_row = cur.fetchone()
            if user_row and _parse_agtype(user_row[0]) == learner_id:
                return conv

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found",
            )


def _validate_ai_content(content: str, grade_level: int = 5) -> None:
    """Validate AI-generated content before returning to client.

    Runs safety and quality checks.  Raises 502 if content fails validation
    so the client gets a clear signal rather than unsafe/bad content.
    """
    safety = content_validator.check_safety(content)
    if not safety.safe:
        logger.error(
            "AI response failed safety validation: %s (content truncated: %.100s)",
            safety.reason,
            content,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI response failed content safety validation",
        )

    quality = content_validator.check_quality(content)
    if not quality.is_valid:
        logger.warning(
            "AI response quality issues: %s",
            "; ".join(quality.issues),
        )
        # Quality issues are warnings — we log but still serve the content
        # since the LLM may produce short follow-up messages legitimately.


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class SendMessageRequest(BaseModel):
    """Request body for POST /conversations/{id}/message."""

    message: str = Field(..., min_length=1, max_length=2000)
    tier: str = Field(default="free", pattern="^(free|paid)$")


class MessageResponse(BaseModel):
    """A single conversation message."""

    id: str
    role: str
    content: str
    created_at: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class SendMessageResponse(BaseModel):
    """Response from POST /conversations/{id}/message."""

    message: MessageResponse
    quiz_detected: bool = False
    quiz_data: dict[str, Any] | None = None
    mastery_updates: list[dict[str, Any]] = Field(default_factory=list)
    model: str = ""
    tokens_used: int = 0


class PaginatedMessagesResponse(BaseModel):
    """Paginated message list with quiz state annotations."""

    conversation_id: str
    messages: list[MessageResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool


class ConversationSummary(BaseModel):
    """Summary of a conversation for list views."""

    id: str
    learner_id: str
    subject: str | None = None
    current_concept: str | None = None
    character_name: str | None = None
    status: str | None = None
    started_at: str | None = None
    last_active: str | None = None
    message_count: int = 0
    summary: str | None = None


class AnswerRequest(BaseModel):
    """Request body for POST /conversations/{id}/answer."""

    question: str = Field(..., min_length=1, max_length=2000)
    expected_answer: str = Field(..., min_length=1, max_length=2000)
    student_answer: str = Field(..., min_length=1, max_length=2000)
    concepts: list[str] = Field(default_factory=list)
    tier: str = Field(default="free", pattern="^(free|paid)$")


class AnswerResponse(BaseModel):
    """Response from POST /conversations/{id}/answer."""

    is_correct: bool
    score: float
    feedback: str
    points_awarded: int
    concepts_demonstrated: list[str] = Field(default_factory=list)
    mastery_updates: list[dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Conductor singleton
# ---------------------------------------------------------------------------

_conductor: ConductorService | None = None


def _get_conductor() -> ConductorService:
    """Get or create the conductor service singleton."""
    global _conductor
    if _conductor is None:
        _conductor = ConductorService()
    return _conductor


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post(
    "/{conversation_id}/message",
    response_model=SendMessageResponse,
    status_code=status.HTTP_200_OK,
)
async def send_message(
    conversation_id: str,
    body: SendMessageRequest,
    user: CurrentUser,
) -> SendMessageResponse:
    """Send a message in a conversation and receive the AI tutor's response.

    Validates user input for safety, calls the conductor service to process
    the message through the SEIAR loop, validates the AI response, and
    returns the assistant message with metadata.
    """
    # Auto-provision user on first access
    await _ensure_user_and_learner(user)

    # Validate user input safety
    input_check = content_validator.validate_topic_input(body.message)
    if not input_check.safe:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Message failed safety check: {input_check.reason}",
        )

    # Verify access and get conversation metadata
    conv = await _verify_learner_access(user.uid, conversation_id)
    learner_id = conv["learner_id"]

    # Map tier string to enum
    from app.services.llm import Tier

    tier = Tier.PAID if body.tier == "paid" else Tier.FREE

    # Process message through conductor
    conductor = _get_conductor()
    try:
        result = await conductor.process_message(
            learner_id=learner_id,
            conversation_id=conversation_id,
            user_message=body.message,
            tier=tier,
        )
    except Exception:
        logger.exception(
            "Conductor failed for conversation=%s learner=%s",
            conversation_id,
            learner_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI tutor service temporarily unavailable",
        )

    # Validate AI response content
    grade_level = conv.get("grade_level") or 5
    if isinstance(grade_level, str):
        try:
            grade_level = int(grade_level)
        except ValueError:
            grade_level = 5
    _validate_ai_content(result.content, grade_level)

    return SendMessageResponse(
        message=MessageResponse(
            id=result.message_id,
            role=result.role,
            content=result.content,
            created_at="",  # Conductor doesn't return timestamp; client uses receipt time
            metadata={
                "quiz_detected": result.quiz_detected,
                **({"quiz": result.quiz_data} if result.quiz_data else {}),
            },
        ),
        quiz_detected=result.quiz_detected,
        quiz_data=result.quiz_data,
        mastery_updates=result.mastery_updates,
        model=result.model,
        tokens_used=result.tokens_used,
    )


@router.get(
    "/{conversation_id}/messages",
    response_model=PaginatedMessagesResponse,
)
async def get_messages(
    conversation_id: str,
    user: CurrentUser,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Messages per page"),
) -> PaginatedMessagesResponse:
    """Get paginated message history for a conversation.

    Returns messages in chronological order with quiz state metadata
    embedded in each message's metadata field.  Messages with
    quiz_detected=true include the quiz data in their metadata.
    """
    await _verify_learner_access(user.uid, conversation_id)

    offset = (page - 1) * page_size
    messages: list[MessageResponse] = []
    total = 0

    async with get_connection() as conn:
        with conn.cursor() as cur:
            # Get total count
            cur.execute(
                """
                SELECT COUNT(*) FROM conversation_messages
                WHERE conversation_id = %s;
                """,
                (conversation_id,),
            )
            count_row = cur.fetchone()
            total = int(count_row[0]) if count_row else 0

            # Get page of messages (chronological order)
            cur.execute(
                """
                SELECT id, role, content, created_at, metadata
                FROM conversation_messages
                WHERE conversation_id = %s
                ORDER BY created_at ASC
                LIMIT %s OFFSET %s;
                """,
                (conversation_id, page_size, offset),
            )
            rows = cur.fetchall()

            for row in rows:
                meta = row[4] if row[4] else {}
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except json.JSONDecodeError:
                        meta = {}

                # Annotate quiz state for messages that have quiz data
                if isinstance(meta, dict) and "quiz" in meta:
                    meta["quiz_detected"] = True

                msg = MessageResponse(
                    id=str(row[0]),
                    role=row[1],
                    content=row[2],
                    created_at=str(row[3]),
                    metadata=meta,
                )

                # Validate content of assistant messages before serving
                if msg.role == "assistant":
                    safety = content_validator.check_safety(msg.content)
                    if not safety.safe:
                        logger.warning(
                            "Stored message %s failed safety re-check, redacting",
                            msg.id,
                        )
                        msg.content = (
                            "[This message has been removed by our safety system.]"
                        )
                        msg.metadata = {"redacted": True}

                messages.append(msg)

    total_pages = max(1, math.ceil(total / page_size))

    return PaginatedMessagesResponse(
        conversation_id=conversation_id,
        messages=messages,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )


@router.get(
    "",
    response_model=list[ConversationSummary],
)
async def list_conversations(
    user: CurrentUser,
    learner_id: str = Query(..., description="Learner ID to list conversations for"),
) -> list[ConversationSummary]:
    """List all conversations for a specific learner.

    Auto-provisions User/Learner nodes on first access. Creates a default
    conversation if the learner has none.
    """
    # Auto-provision user and learner nodes
    await _ensure_user_and_learner(user)

    async with get_connection() as conn:
        with conn.cursor() as cur:
            # Fetch all conversations for the learner
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (c:Conversation {{learner_id: '{_escape_cypher_string(learner_id)}'}})
                    RETURN c.id, c.learner_id, c.subject, c.current_concept,
                           c.character_name, c.status, c.started_at,
                           c.last_active, c.message_count, c.summary
                    ORDER BY c.last_active DESC
                $$) AS (id agtype, learner_id agtype, subject agtype,
                        current_concept agtype, character_name agtype,
                        conv_status agtype, started_at agtype,
                        last_active agtype, message_count agtype,
                        summary agtype);
                """
            )
            rows = cur.fetchall()

    conversations: list[ConversationSummary] = []
    for row in rows:
        conversations.append(
            ConversationSummary(
                id=_parse_agtype(row[0]) or "",
                learner_id=_parse_agtype(row[1]) or learner_id,
                subject=_parse_agtype(row[2]),
                current_concept=_parse_agtype(row[3]),
                character_name=_parse_agtype(row[4]),
                status=_parse_agtype(row[5]),
                started_at=_parse_agtype(row[6]),
                last_active=_parse_agtype(row[7]),
                message_count=int(_parse_agtype_number(row[8])),
                summary=_parse_agtype(row[9]),
            )
        )

    # Auto-create a default conversation if the learner has none
    if not conversations:
        import uuid
        from datetime import datetime, timezone

        conv_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        esc_lid = _escape_cypher_string(learner_id)
        async with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT * FROM cypher('{GRAPH_NAME}', $$
                        CREATE (c:Conversation {{
                            id: '{conv_id}',
                            learner_id: '{esc_lid}',
                            subject: 'General',
                            current_concept: '',
                            character_name: 'Sunny',
                            character_personality: 'Friendly and encouraging AI tutor',
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
        conversations.append(ConversationSummary(
            id=conv_id,
            learner_id=learner_id,
            subject="General",
            current_concept=None,
            character_name="Sunny",
            status="active",
            started_at=now_iso,
            last_active=now_iso,
            message_count=0,
            summary=None,
        ))

    return conversations


@router.post(
    "/{conversation_id}/answer",
    response_model=AnswerResponse,
)
async def score_answer(
    conversation_id: str,
    body: AnswerRequest,
    user: CurrentUser,
) -> AnswerResponse:
    """Score a student's quiz answer via the conductor service.

    Validates input, calls conductor.score_answer which uses the LLM to
    evaluate the answer, updates mastery in the graph, and returns the
    score with feedback.  The feedback text is validated before serving.
    """
    # Validate inputs for safety
    for field_name, field_value in [
        ("question", body.question),
        ("student_answer", body.student_answer),
        ("expected_answer", body.expected_answer),
    ]:
        safety = content_validator.check_safety(field_value)
        if not safety.safe:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field_name} failed safety check: {safety.reason}",
            )

    # Verify access and get conversation metadata
    conv = await _verify_learner_access(user.uid, conversation_id)
    learner_id = conv["learner_id"]

    # Map tier string to enum
    from app.services.llm import Tier

    tier = Tier.PAID if body.tier == "paid" else Tier.FREE

    # Score via conductor
    conductor = _get_conductor()
    try:
        result = await conductor.score_answer(
            learner_id=learner_id,
            conversation_id=conversation_id,
            question=body.question,
            expected_answer=body.expected_answer,
            student_answer=body.student_answer,
            concepts=body.concepts if body.concepts else None,
            tier=tier,
        )
    except Exception:
        logger.exception(
            "Answer scoring failed for conversation=%s learner=%s",
            conversation_id,
            learner_id,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Answer scoring service temporarily unavailable",
        )

    # Validate feedback content before returning
    if result.feedback:
        _validate_ai_content(result.feedback)

    return AnswerResponse(
        is_correct=result.is_correct,
        score=result.score,
        feedback=result.feedback,
        points_awarded=result.points_awarded,
        concepts_demonstrated=result.concepts_demonstrated,
        mastery_updates=result.mastery_updates,
    )
