"""OpenRouter LLM client for Sunschool AI tutoring.

Provides an async interface to OpenRouter's chat completions API with
tier-based model selection, retry logic, and cost tracking.

Exports:
    LLMService  — async client; call .chat() for completions, .close() to teardown
    LLMResponse — dataclass returned by .chat()
    LLMError    — raised on non-retryable failures
    Tier        — FREE / PAID enum controlling model selection
"""

from __future__ import annotations

import enum
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("sunschool.llm")

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

# Retry-eligible HTTP status codes
_RETRYABLE_STATUSES = {429, 500, 502, 503, 504}

# Maximum number of retry attempts for retryable errors
_MAX_RETRIES = 1


class Tier(str, enum.Enum):
    """Billing tier that determines which model is used."""

    FREE = "free"
    PAID = "paid"


# Model slugs per tier
_TIER_MODELS: dict[Tier, str] = {
    Tier.FREE: "anthropic/claude-sonnet-4-20250514",
    Tier.PAID: "anthropic/claude-sonnet-4-20250514",
}


@dataclass(frozen=True, slots=True)
class LLMResponse:
    """Structured response from an LLM call."""

    content: str
    model: str
    tokens_used: int
    cost_estimate: float


class LLMError(Exception):
    """Raised when an LLM call fails in a non-retryable way."""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class LLMService:
    """Async OpenRouter LLM client.

    Usage::

        svc = LLMService()
        resp = await svc.chat(
            system_message="You are a helpful tutor.",
            user_message="What is photosynthesis?",
            tier=Tier.FREE,
        )
        print(resp.content)
        await svc.close()
    """

    def __init__(self) -> None:
        api_key = settings.openrouter_api_key
        if not api_key:
            raise LLMError(
                "SUNSCHOOL_OPENROUTER_API_KEY is not set. "
                "Configure it in the environment or .env file."
            )
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=10.0),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://sunschool.xyz",
                "X-Title": "Sunschool",
            },
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def chat(
        self,
        *,
        system_message: str,
        user_message: str,
        tier: Tier = Tier.FREE,
        model_override: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> LLMResponse:
        """Send a chat completion request via OpenRouter.

        Args:
            system_message: The system/instruction prompt.
            user_message: The user/learner prompt.
            tier: Billing tier (FREE or PAID) — determines the model.
            model_override: Explicit model slug; overrides tier-based selection.
            temperature: Sampling temperature (0.0–2.0).
            max_tokens: Maximum tokens in the completion.
            response_format: Optional response format spec (e.g. ``{"type": "json_object"}``).

        Returns:
            An :class:`LLMResponse` with the completion text and metadata.

        Raises:
            LLMError: On non-retryable HTTP or API errors.
        """
        model = model_override or _TIER_MODELS[tier]

        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format is not None:
            payload["response_format"] = response_format

        return await self._request_with_retry(payload, model)

    async def close(self) -> None:
        """Shut down the underlying HTTP client."""
        await self._client.aclose()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _request_with_retry(
        self,
        payload: dict[str, Any],
        model: str,
    ) -> LLMResponse:
        """Execute the HTTP request with a single retry on transient errors."""
        last_exc: Exception | None = None

        for attempt in range(_MAX_RETRIES + 1):
            try:
                response = await self._client.post(OPENROUTER_BASE_URL, json=payload)

                if response.status_code in _RETRYABLE_STATUSES and attempt < _MAX_RETRIES:
                    logger.warning(
                        "Retryable status %d from OpenRouter (attempt %d/%d, model=%s)",
                        response.status_code,
                        attempt + 1,
                        _MAX_RETRIES + 1,
                        model,
                    )
                    continue

                if response.status_code != 200:
                    body = response.text
                    raise LLMError(
                        f"OpenRouter API error {response.status_code}: {body[:500]}"
                    )

                return self._parse_response(response, model)

            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in _RETRYABLE_STATUSES and attempt < _MAX_RETRIES:
                    logger.warning(
                        "Retryable HTTP error (attempt %d/%d, model=%s): %s",
                        attempt + 1,
                        _MAX_RETRIES + 1,
                        model,
                        exc,
                    )
                    last_exc = exc
                    continue
                raise LLMError(f"OpenRouter HTTP error: {exc}") from exc

            except httpx.TimeoutException as exc:
                if attempt < _MAX_RETRIES:
                    logger.warning(
                        "Timeout on OpenRouter call (attempt %d/%d, model=%s)",
                        attempt + 1,
                        _MAX_RETRIES + 1,
                        model,
                    )
                    last_exc = exc
                    continue
                raise LLMError(f"OpenRouter request timed out: {exc}") from exc

            except httpx.RequestError as exc:
                raise LLMError(f"OpenRouter request failed: {exc}") from exc

        # Should not reach here, but safety net
        raise LLMError(f"OpenRouter request failed after retries: {last_exc}")

    @staticmethod
    def _parse_response(response: httpx.Response, requested_model: str) -> LLMResponse:
        """Extract content and usage metadata from an OpenRouter JSON response."""
        try:
            data = response.json()
        except Exception as exc:
            raise LLMError(f"Failed to parse OpenRouter response JSON: {exc}") from exc

        # Extract content
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError(
                f"Unexpected OpenRouter response structure: {exc}. "
                f"Response: {str(data)[:500]}"
            ) from exc

        # Extract model actually used (may differ from requested)
        model = data.get("model", requested_model)

        # Extract token usage
        usage = data.get("usage", {})
        tokens_used = usage.get("total_tokens", 0)

        # Cost estimate — OpenRouter may include generation cost in response
        # Fall back to a rough estimate based on token counts
        cost_estimate = _estimate_cost(data, usage, model)

        return LLMResponse(
            content=content,
            model=model,
            tokens_used=tokens_used,
            cost_estimate=cost_estimate,
        )


# ---------------------------------------------------------------------------
# Cost estimation helper
# ---------------------------------------------------------------------------

# Rough per-1M-token pricing for cost estimation when OpenRouter
# does not include explicit cost data in the response.
_COST_PER_1M_INPUT: dict[str, float] = {
    "google/gemini-2.0-flash-001": 0.1,
    "anthropic/claude-sonnet-4-20250514": 3.0,
}
_COST_PER_1M_OUTPUT: dict[str, float] = {
    "google/gemini-2.0-flash-001": 0.4,
    "anthropic/claude-sonnet-4-20250514": 15.0,
}


def _estimate_cost(
    data: dict[str, Any],
    usage: dict[str, Any],
    model: str,
) -> float:
    """Return a dollar cost estimate for the LLM call.

    Prefers the ``total_cost`` field that OpenRouter may include. Falls back
    to computing from token counts and known pricing tables.
    """
    # OpenRouter sometimes returns cost directly
    if "total_cost" in data:
        try:
            return float(data["total_cost"])
        except (ValueError, TypeError):
            pass

    # Estimate from token counts
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)

    input_rate = _COST_PER_1M_INPUT.get(model, 1.0)
    output_rate = _COST_PER_1M_OUTPUT.get(model, 3.0)

    return (prompt_tokens * input_rate + completion_tokens * output_rate) / 1_000_000
