"""OpenRouter LLM integration service.

Handles all LLM calls through OpenRouter's API, supporting
model routing, token counting, and cost estimation.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass
class LLMResponse:
    """Response from an LLM call."""

    content: str
    model: str
    tokens_used: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_estimate: float = 0.0
    latency_ms: int = 0
    raw_response: dict = field(default_factory=dict)


async def call_llm(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    response_format: dict | None = None,
) -> LLMResponse:
    """Call an LLM via OpenRouter.

    Args:
        messages: List of {"role": "system"|"user"|"assistant", "content": "..."} dicts.
        model: Model identifier. Defaults to settings.DEFAULT_MODEL.
        temperature: Sampling temperature (0-2).
        max_tokens: Maximum tokens in the response.
        response_format: Optional response format spec (e.g., {"type": "json_object"}).

    Returns:
        LLMResponse with the model's output and metadata.

    Raises:
        httpx.HTTPStatusError: If the API returns an error status.
        ValueError: If the API key is not configured.
    """
    if not settings.OPENROUTER_API_KEY:
        raise ValueError(
            "SUNSCHOOL_OPENROUTER_API_KEY not configured. "
            "Set it in your environment or .env file."
        )

    model = model or settings.DEFAULT_MODEL

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sunschool.xyz",
        "X-Title": "Sunschool",
    }

    start = time.monotonic()

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(OPENROUTER_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    latency_ms = int((time.monotonic() - start) * 1000)

    # Parse response
    content = ""
    if data.get("choices"):
        content = data["choices"][0].get("message", {}).get("content", "")

    usage = data.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

    return LLMResponse(
        content=content,
        model=model,
        tokens_used=total_tokens,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cost_estimate=_estimate_cost(model, prompt_tokens, completion_tokens),
        latency_ms=latency_ms,
        raw_response=data,
    )


async def score_answer(
    question: str,
    correct_answer: str,
    learner_answer: str,
    grade_level: int,
) -> dict[str, Any]:
    """Use LLM to score an open-ended learner answer.

    Returns:
        Dict with keys: correct (bool), confidence (float 0-1),
        feedback (str), partial_credit (float 0-1).
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are a K-12 assessment scorer. Score the student's answer "
                f"for a grade {grade_level} student. Be encouraging but accurate. "
                "Respond in JSON with keys: correct (bool), confidence (float 0-1), "
                "feedback (str, 1-2 sentences), partial_credit (float 0-1)."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Question: {question}\n"
                f"Expected answer: {correct_answer}\n"
                f"Student's answer: {learner_answer}"
            ),
        },
    ]

    resp = await call_llm(
        messages,
        model=settings.SCORING_MODEL,
        temperature=0.1,
        max_tokens=256,
        response_format={"type": "json_object"},
    )

    import json

    try:
        result = json.loads(resp.content)
    except json.JSONDecodeError:
        logger.warning("Failed to parse scoring response: %s", resp.content)
        result = {
            "correct": False,
            "confidence": 0.0,
            "feedback": "I had trouble scoring that. Let's try again!",
            "partial_credit": 0.0,
        }

    result["tokens_used"] = resp.tokens_used
    result["cost_estimate"] = resp.cost_estimate
    return result


async def generate_summary(
    messages: list[dict[str, str]],
    existing_summary: str = "",
) -> str:
    """Generate a compressed summary of conversation messages.

    Used for context window management — summarizes older messages
    to keep the context window manageable.
    """
    prompt_messages = [
        {
            "role": "system",
            "content": (
                "Summarize the following conversation between a tutor and student. "
                "Focus on: topics covered, concepts the student understood or struggled with, "
                "questions asked, and any quiz results. Keep it under 300 words. "
                "Write in third person."
            ),
        },
    ]

    if existing_summary:
        prompt_messages.append(
            {
                "role": "user",
                "content": f"Previous summary:\n{existing_summary}\n\n"
                f"New messages to incorporate:\n"
                + _format_messages_for_summary(messages),
            }
        )
    else:
        prompt_messages.append(
            {
                "role": "user",
                "content": _format_messages_for_summary(messages),
            }
        )

    resp = await call_llm(
        prompt_messages,
        model=settings.SUMMARY_MODEL,
        temperature=0.3,
        max_tokens=512,
    )

    return resp.content


def _format_messages_for_summary(messages: list[dict[str, str]]) -> str:
    """Format messages for the summary prompt."""
    lines = []
    for msg in messages:
        role = "Tutor" if msg["role"] == "assistant" else "Student"
        lines.append(f"{role}: {msg['content']}")
    return "\n".join(lines)


def _estimate_cost(
    model: str, prompt_tokens: int, completion_tokens: int
) -> float:
    """Estimate cost in USD based on model and token counts."""
    # Free tier models
    if ":free" in model or "free" in model.lower():
        return 0.0

    # Approximate pricing per 1M tokens (input/output)
    pricing = {
        "google/gemini-2.0-flash": (0.0, 0.0),  # free
        "anthropic/claude-sonnet-4": (3.0, 15.0),
        "anthropic/claude-3-haiku": (0.25, 1.25),
        "openai/gpt-4o-mini": (0.15, 0.60),
    }

    input_rate, output_rate = pricing.get(model, (1.0, 2.0))
    cost = (prompt_tokens * input_rate + completion_tokens * output_rate) / 1_000_000
    return round(cost, 6)
