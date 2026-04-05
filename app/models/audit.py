"""Prompt audit models for parent transparency.

Every LLM call is logged so parents can see exactly what prompts
were sent to the AI when teaching their child.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PromptAuditEntry(BaseModel):
    """A single prompt audit log entry."""

    id: str
    learner_id: str
    conversation_id: str
    prompt_type: str  # lesson_gen | quiz_gen | assessment | character_dialog | summary
    system_message: str
    user_message: str
    model: str
    response_preview: str  # first 500 chars of response
    tokens_used: int = 0
    cost_estimate: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=__import__('datetime').timezone.utc))


class PromptAuditCreate(BaseModel):
    """Data needed to create an audit entry."""

    learner_id: str
    conversation_id: str
    prompt_type: str
    system_message: str
    user_message: str
    model: str
    response_text: str
    tokens_used: int = 0
    cost_estimate: float = 0.0

    def to_entry(self) -> dict[str, Any]:
        """Convert to dict for SQL insertion."""
        import uuid

        return {
            "id": str(uuid.uuid4()),
            "learner_id": self.learner_id,
            "conversation_id": self.conversation_id,
            "prompt_type": self.prompt_type,
            "system_message": self.system_message,
            "user_message": self.user_message,
            "model": self.model,
            "response_preview": self.response_text[:500],
            "tokens_used": self.tokens_used,
            "cost_estimate": self.cost_estimate,
        }
