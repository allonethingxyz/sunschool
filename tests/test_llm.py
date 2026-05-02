"""Tests for the LLM service.

No mocks — tests exercise real parsing logic, type validation, and cost estimation.
Integration tests that require a live OpenRouter key are marked with
``pytest.mark.integration`` and skipped when SUNSCHOOL_OPENROUTER_API_KEY is unset.
"""

from __future__ import annotations

import os

import httpx
import pytest

from app.services.llm import (
    LLMError,
    LLMResponse,
    LLMService,
    Tier,
    _estimate_cost,
    _TIER_MODELS,
)


# ---------------------------------------------------------------------------
# Tier enum
# ---------------------------------------------------------------------------


class TestTier:
    def test_free_value(self):
        assert Tier.FREE.value == "free"

    def test_paid_value(self):
        assert Tier.PAID.value == "paid"

    def test_is_str(self):
        assert isinstance(Tier.FREE, str)
        assert Tier.FREE == "free"

    def test_model_mapping(self):
        assert "gemini" in _TIER_MODELS[Tier.FREE].lower()
        assert "claude" in _TIER_MODELS[Tier.PAID].lower()


# ---------------------------------------------------------------------------
# LLMResponse dataclass
# ---------------------------------------------------------------------------


class TestLLMResponse:
    def test_fields(self):
        resp = LLMResponse(
            content="Hello!",
            model="test/model",
            tokens_used=42,
            cost_estimate=0.001,
        )
        assert resp.content == "Hello!"
        assert resp.model == "test/model"
        assert resp.tokens_used == 42
        assert resp.cost_estimate == 0.001

    def test_frozen(self):
        resp = LLMResponse(content="x", model="m", tokens_used=1, cost_estimate=0.0)
        with pytest.raises(AttributeError):
            resp.content = "changed"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# LLMError
# ---------------------------------------------------------------------------


class TestLLMError:
    def test_is_exception(self):
        assert issubclass(LLMError, Exception)

    def test_message(self):
        err = LLMError("something went wrong")
        assert str(err) == "something went wrong"


# ---------------------------------------------------------------------------
# Cost estimation
# ---------------------------------------------------------------------------


class TestCostEstimation:
    def test_total_cost_from_response(self):
        """When OpenRouter returns total_cost, use it directly."""
        cost = _estimate_cost(
            data={"total_cost": 0.0042},
            usage={},
            model="unknown/model",
        )
        assert cost == pytest.approx(0.0042)

    def test_free_tier_is_zero(self):
        cost = _estimate_cost(
            data={},
            usage={"prompt_tokens": 1000, "completion_tokens": 500},
            model="google/gemini-2.0-flash-exp:free",
        )
        assert cost == 0.0

    def test_paid_tier_estimation(self):
        cost = _estimate_cost(
            data={},
            usage={"prompt_tokens": 1_000_000, "completion_tokens": 0},
            model="anthropic/claude-sonnet-4-20250514",
        )
        # 1M input tokens * $3/1M = $3.00
        assert cost == pytest.approx(3.0)

    def test_unknown_model_uses_defaults(self):
        cost = _estimate_cost(
            data={},
            usage={"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000},
            model="some/unknown-model",
        )
        # Default: $1/1M input + $3/1M output = $4.00
        assert cost == pytest.approx(4.0)

    def test_no_usage_data(self):
        cost = _estimate_cost(data={}, usage={}, model="anthropic/claude-sonnet-4-20250514")
        assert cost == 0.0


# ---------------------------------------------------------------------------
# Response parsing (via LLMService._parse_response)
# ---------------------------------------------------------------------------


class TestParseResponse:
    def _make_response(self, json_data: dict, status_code: int = 200) -> httpx.Response:
        """Build a real httpx.Response with the given JSON body."""
        return httpx.Response(
            status_code=status_code,
            json=json_data,
            request=httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions"),
        )

    def test_valid_response(self):
        data = {
            "choices": [{"message": {"content": "Photosynthesis is..."}}],
            "model": "google/gemini-2.0-flash-exp:free",
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150,
            },
        }
        resp = LLMService._parse_response(self._make_response(data), "google/gemini-2.0-flash-exp:free")
        assert resp.content == "Photosynthesis is..."
        assert resp.model == "google/gemini-2.0-flash-exp:free"
        assert resp.tokens_used == 150
        assert isinstance(resp.cost_estimate, float)

    def test_missing_choices_raises(self):
        data = {"model": "x", "usage": {}}
        with pytest.raises(LLMError, match="Unexpected"):
            LLMService._parse_response(self._make_response(data), "x")

    def test_empty_choices_raises(self):
        data = {"choices": [], "model": "x", "usage": {}}
        with pytest.raises(LLMError, match="Unexpected"):
            LLMService._parse_response(self._make_response(data), "x")

    def test_model_fallback_to_requested(self):
        data = {
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"total_tokens": 10},
        }
        resp = LLMService._parse_response(self._make_response(data), "my/requested-model")
        assert resp.model == "my/requested-model"

    def test_total_cost_used_when_present(self):
        data = {
            "choices": [{"message": {"content": "ok"}}],
            "model": "x",
            "usage": {"total_tokens": 10},
            "total_cost": 0.007,
        }
        resp = LLMService._parse_response(self._make_response(data), "x")
        assert resp.cost_estimate == pytest.approx(0.007)


# ---------------------------------------------------------------------------
# Integration tests (require live API key)
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.skipif(
    not os.environ.get("SUNSCHOOL_OPENROUTER_API_KEY"),
    reason="SUNSCHOOL_OPENROUTER_API_KEY not set",
)
class TestLLMServiceIntegration:
    """Live integration tests against OpenRouter."""

    @pytest.fixture
    async def svc(self):
        service = LLMService()
        yield service
        await service.close()

    @pytest.mark.asyncio
    async def test_free_tier_chat(self, svc):
        resp = await svc.chat(
            system_message="Reply with exactly: PONG",
            user_message="PING",
            tier=Tier.FREE,
            max_tokens=16,
        )
        assert isinstance(resp, LLMResponse)
        assert len(resp.content) > 0
        assert resp.tokens_used > 0

    @pytest.mark.asyncio
    async def test_paid_tier_chat(self, svc):
        resp = await svc.chat(
            system_message="Reply with exactly: PONG",
            user_message="PING",
            tier=Tier.PAID,
            max_tokens=16,
        )
        assert isinstance(resp, LLMResponse)
        assert "claude" in resp.model.lower() or "anthropic" in resp.model.lower()
