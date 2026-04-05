"""Pydantic models for AGE graph nodes, edges, and API payloads."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# --- Enums ---

class SEIARPhase(str, Enum):
    STORYTELLING = "storytelling"
    EXAMPLES = "examples"
    INTERACTION = "interaction"
    ASSESSMENT = "assessment"
    REFINEMENT = "refinement"


class ConversationStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"


class GateType(str, Enum):
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    TOPIC_BLOCKED = "TOPIC_BLOCKED"
    MODEL_RESTRICTED = "MODEL_RESTRICTED"
    TIME_LIMITED = "TIME_LIMITED"
    CONCEPT_GATE = "CONCEPT_GATE"


class GateStatus(str, Enum):
    ACTIVE = "active"
    APPROVED = "approved"
    EXPIRED = "expired"


class QuizType(str, Enum):
    MULTIPLE_CHOICE = "multiple_choice"
    OPEN_ENDED = "open_ended"


# --- Graph Node Models ---

class Learner(BaseModel):
    id: str
    grade_level: int
    subjects: list[str] = []
    mastery_json: dict[str, Any] = {}


class Concept(BaseModel):
    id: str
    name: str
    subject: str
    grade_band: str
    prerequisites: list[str] = []
    common_core_refs: list[str] = []


class MasteryEdge(BaseModel):
    """Learner -[:MASTERY]-> Concept edge data."""
    concept_id: str
    concept_name: str
    level: float = 0.0  # 0.0 to 1.0 confidence
    correct: int = 0
    total: int = 0
    last_tested: datetime | None = None


class Gate(BaseModel):
    id: str
    gate_type: GateType
    predicate_json: dict[str, Any] = {}
    status: GateStatus = GateStatus.ACTIVE
    parent_id: str


# --- Conversation State ---

class PendingQuiz(BaseModel):
    """A quiz question waiting for the learner's answer."""
    question: str
    quiz_type: QuizType
    options: list[str] = []  # For multiple choice
    correct_answer: str
    concept_id: str | None = None
    concept_name: str | None = None
    asked_at: datetime = Field(default_factory=lambda: datetime.now(tz=__import__('datetime').timezone.utc))


class ConversationState(BaseModel):
    """In-memory state for an active conversation, stored in AGE as state_json."""
    conversation_id: str
    learner_id: str
    seiar_phase: SEIARPhase = SEIARPhase.STORYTELLING
    current_topic: str = ""
    current_concepts: list[str] = []
    pending_quiz: PendingQuiz | None = None
    points_earned: int = 0
    message_count: int = 0
    summary: str = ""
    last_summary_at: int = 0  # message_count when last summarized


class Message(BaseModel):
    """A single message in a conversation."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(tz=__import__('datetime').timezone.utc))
    metadata: dict[str, Any] = {}


# --- API Request/Response Models ---

class SendMessageRequest(BaseModel):
    content: str = Field(..., max_length=2000)


class SendMessageResponse(BaseModel):
    response: str
    seiar_phase: str
    points_earned: int = 0
    quiz_pending: bool = False
    concepts_discussed: list[str] = []


class ConversationInfo(BaseModel):
    id: str
    learner_id: str
    status: ConversationStatus
    message_count: int
    started_at: datetime
    last_active: datetime
    current_topic: str = ""
