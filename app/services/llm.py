"""OpenRouter LLM service for Sunschool AI tutoring.

Handles model routing, fallback chains, structured response parsing,
and token/cost tracking for prompt audit logging.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_CHAT_ENDPOINT = f"{OPENROUTER_BASE_URL}/chat/completions"


class Tier(str, Enum):
    FREE = "free"
    PAID = "paid"


# Model definitions with cost-per-token estimates (USD)
@dataclass(frozen=True)
class ModelConfig:
    model_id: str
    input_cost_per_token: float = 0.0
    output_cost_per_token: float = 0.0


# Free tier: gemini-2.0-flash is free via OpenRouter
FREE_TIER_MODELS = [
    ModelConfig("google/gemini-2.0-flash-001", 0.0, 0.0),
    ModelConfig("google/gemini-2.0-flash-lite-001", 0.0, 0.0),
    ModelConfig("google/gemini-2.0-flash-thinking-exp:free", 0.0, 0.0),
]

PAID_TIER_MODELS = [
    ModelConfig("anthropic/claude-sonnet-4", 0.000003, 0.000015),
    ModelConfig("google/gemini-2.0-flash-001", 0.0, 0.0),
    ModelConfig("google/gemini-2.0-flash-lite-001", 0.0, 0.0),
]

# Status codes that indicate billing/auth issues -- abort, don't retry
ABORT_STATUS_CODES = {402, 403}


@dataclass
class LLMResponse:
    """Structured response from an LLM call."""

    content: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_estimate: float = 0.0
    latency_ms: float = 0.0
    raw_response: dict[str, Any] = field(default_factory=dict)

    @property
    def response_preview(self) -> str:
        """First 500 chars of response for audit logging."""
        return self.content[:500]


@dataclass
class ParsedLesson:
    """Parsed lesson content from LLM response."""

    title: str
    content: str
    key_concepts: list[str]
    vocabulary: list[str]
    suggested_activities: list[str]


@dataclass
class ParsedQuiz:
    """Parsed quiz from LLM response."""

    questions: list[QuizQuestion]


@dataclass
class QuizQuestion:
    """A single quiz question."""

    question: str
    options: list[str]
    correct_index: int
    explanation: str


@dataclass
class AnswerScore:
    """Scored answer from LLM."""

    score: float  # 0.0 to 1.0
    feedback: str
    concepts_demonstrated: list[str]
    points_awarded: int


@dataclass
class ContentValidation:
    """Content validation result."""

    is_safe: bool
    is_grade_appropriate: bool
    readability_score: float  # 0.0 to 1.0
    issues: list[str]


class LLMService:
    """OpenRouter API integration with model routing and fallback chains."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.openrouter_api_key
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(60.0, connect=10.0),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://sunschool.xyz",
                    "X-Title": "Sunschool",
                },
            )
        return self._client

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _get_model_chain(self, tier: Tier) -> list[ModelConfig]:
        """Get the fallback chain for the given tier."""
        if tier == Tier.PAID:
            return PAID_TIER_MODELS
        return FREE_TIER_MODELS

    def _estimate_cost(
        self, model: ModelConfig, prompt_tokens: int, completion_tokens: int
    ) -> float:
        """Estimate cost for a call based on token counts."""
        return (
            model.input_cost_per_token * prompt_tokens
            + model.output_cost_per_token * completion_tokens
        )

    async def chat(
        self,
        system_message: str,
        user_message: str,
        tier: Tier = Tier.FREE,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> LLMResponse:
        """Send a chat completion request with automatic fallback.

        Tries each model in the fallback chain. On 402/403, aborts immediately
        (billing/auth issue). On other errors, falls back to next model.

        Args:
            system_message: System prompt for the model.
            user_message: User message content.
            tier: FREE or PAID tier for model selection.
            temperature: Sampling temperature (0.0-2.0).
            max_tokens: Maximum tokens in response.
            response_format: Optional JSON schema for structured output.

        Returns:
            LLMResponse with content, token counts, and cost estimate.

        Raises:
            LLMError: If all models in the chain fail.
        """
        chain = self._get_model_chain(tier)
        last_error: Exception | None = None

        for model_config in chain:
            try:
                return await self._call_model(
                    model_config=model_config,
                    system_message=system_message,
                    user_message=user_message,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format=response_format,
                )
            except LLMAbortError:
                # 402/403 -- billing/auth issue, don't try other models
                raise
            except LLMError as e:
                last_error = e
                logger.warning(
                    "Model %s failed, trying next in chain: %s",
                    model_config.model_id,
                    e,
                )
                continue

        raise LLMError(
            f"All models in {tier.value} chain failed. Last error: {last_error}"
        )

    async def _call_model(
        self,
        model_config: ModelConfig,
        system_message: str,
        user_message: str,
        temperature: float,
        max_tokens: int,
        response_format: dict[str, Any] | None = None,
    ) -> LLMResponse:
        """Make a single API call to OpenRouter."""
        client = await self._get_client()

        payload: dict[str, Any] = {
            "model": model_config.model_id,
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_format:
            payload["response_format"] = response_format

        start_time = time.monotonic()

        try:
            response = await client.post(OPENROUTER_CHAT_ENDPOINT, json=payload)
        except httpx.RequestError as e:
            raise LLMError(f"HTTP request failed for {model_config.model_id}: {e}")

        latency_ms = (time.monotonic() - start_time) * 1000

        if response.status_code in ABORT_STATUS_CODES:
            raise LLMAbortError(
                f"Billing/auth error ({response.status_code}) for "
                f"{model_config.model_id}: {response.text}"
            )

        if response.status_code != 200:
            raise LLMError(
                f"API error ({response.status_code}) for "
                f"{model_config.model_id}: {response.text}"
            )

        try:
            data = response.json()
        except json.JSONDecodeError as e:
            raise LLMError(f"Invalid JSON response from {model_config.model_id}: {e}")

        # Extract content from OpenRouter response
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise LLMError(
                f"Unexpected response structure from {model_config.model_id}: {e}"
            )

        # Extract token usage
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

        cost = self._estimate_cost(model_config, prompt_tokens, completion_tokens)

        return LLMResponse(
            content=content,
            model=model_config.model_id,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost_estimate=cost,
            latency_ms=latency_ms,
            raw_response=data,
        )

    # --- Structured response parsing ---

    def parse_lesson(self, response: LLMResponse) -> ParsedLesson:
        """Parse a lesson generation response into structured data."""
        try:
            data = json.loads(response.content)
            return ParsedLesson(
                title=data.get("title", ""),
                content=data.get("content", ""),
                key_concepts=data.get("key_concepts", []),
                vocabulary=data.get("vocabulary", []),
                suggested_activities=data.get("suggested_activities", []),
            )
        except (json.JSONDecodeError, AttributeError):
            # If not JSON, treat entire content as the lesson
            return ParsedLesson(
                title="Lesson",
                content=response.content,
                key_concepts=[],
                vocabulary=[],
                suggested_activities=[],
            )

    def parse_quiz(self, response: LLMResponse) -> ParsedQuiz:
        """Parse a quiz generation response into structured data."""
        try:
            data = json.loads(response.content)
            questions = []
            for q in data.get("questions", []):
                questions.append(
                    QuizQuestion(
                        question=q["question"],
                        options=q.get("options", []),
                        correct_index=q.get("correct_index", 0),
                        explanation=q.get("explanation", ""),
                    )
                )
            return ParsedQuiz(questions=questions)
        except (json.JSONDecodeError, KeyError, AttributeError) as e:
            raise LLMParseError(f"Failed to parse quiz response: {e}")

    def parse_score(self, response: LLMResponse) -> AnswerScore:
        """Parse an answer scoring response into structured data."""
        try:
            data = json.loads(response.content)
            return AnswerScore(
                score=float(data.get("score", 0.0)),
                feedback=data.get("feedback", ""),
                concepts_demonstrated=data.get("concepts_demonstrated", []),
                points_awarded=int(data.get("points_awarded", 0)),
            )
        except (json.JSONDecodeError, KeyError, AttributeError) as e:
            raise LLMParseError(f"Failed to parse score response: {e}")

    def parse_validation(self, response: LLMResponse) -> ContentValidation:
        """Parse a content validation response into structured data."""
        try:
            data = json.loads(response.content)
            return ContentValidation(
                is_safe=bool(data.get("is_safe", True)),
                is_grade_appropriate=bool(data.get("is_grade_appropriate", True)),
                readability_score=float(data.get("readability_score", 1.0)),
                issues=data.get("issues", []),
            )
        except (json.JSONDecodeError, KeyError, AttributeError) as e:
            raise LLMParseError(f"Failed to parse validation response: {e}")


# --- Exceptions ---


class LLMError(Exception):
    """Base exception for LLM service errors."""


class LLMAbortError(LLMError):
    """Raised on 402/403 -- billing/auth issue, do not retry."""


class LLMParseError(LLMError):
    """Raised when response parsing fails."""
