"""End-to-end smoke test: send a message and get an AI response.

Proves the full message flow works against a live deployment:
  seed data → send message → get AI response → verify storage → check points/mastery

NO MOCKS. Real HTTP calls to the deployed (or local) Sunschool instance.

Requires:
  - A running Sunschool instance (default: https://sunschool.xyz)
  - Dev auth bypass active (Firebase not configured)
  - OpenRouter API key with credits configured on the instance

Override the base URL with the SUNSCHOOL_BASE_URL env var for local testing:
  SUNSCHOOL_BASE_URL=http://localhost:8000 pytest tests/test_e2e_smoke.py -v
"""

from __future__ import annotations

import os

import httpx
import pytest

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get("SUNSCHOOL_BASE_URL", "https://sunschool.xyz")

# Dev bypass auth headers (works when Firebase is not configured)
DEV_HEADERS = {
    "X-Dev-User-Id": "dev-user-001",
    "X-Dev-User-Email": "dev@sunschool.test",
    "X-Dev-User-Name": "Dev User",
    "X-Dev-User-Role": "parent",
}

# Generous timeout — LLM calls can be slow
HTTP_TIMEOUT = 60.0


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> httpx.Client:
    """Shared HTTP client for the entire test module."""
    with httpx.Client(base_url=BASE_URL, headers=DEV_HEADERS, timeout=HTTP_TIMEOUT) as c:
        yield c


@pytest.fixture(scope="module")
def seed_data(client: httpx.Client) -> dict:
    """Seed test data (parent, learner, conversation) via admin endpoint.

    Returns dict with parent_uid, learner_id, conversation_id.
    """
    resp = client.post("/api/admin/seed")
    assert resp.status_code == 200, f"Seed failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data.get("ok"), f"Seed returned ok=false: {data}"
    return data


# ---------------------------------------------------------------------------
# Tests — ordered to build on each other
# ---------------------------------------------------------------------------


class TestE2ESmoke:
    """Full end-to-end smoke test of the message flow."""

    def test_01_health(self, client: httpx.Client):
        """Verify the instance is reachable and healthy."""
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("status") == "ok", f"Unexpected health response: {body}"

    def test_02_seed_data_exists(self, seed_data: dict):
        """Verify seed endpoint returned expected fields."""
        assert "parent_uid" in seed_data
        assert "learner_id" in seed_data
        assert "conversation_id" in seed_data

    def test_03_list_conversations(self, client: httpx.Client, seed_data: dict):
        """GET /api/conversations — verify the seeded conversation appears."""
        learner_id = seed_data["learner_id"]
        resp = client.get("/api/conversations", params={"learner_id": learner_id})
        assert resp.status_code == 200
        conversations = resp.json()
        assert isinstance(conversations, list)
        assert len(conversations) > 0, "No conversations found for seeded learner"

        conv_ids = [c["id"] for c in conversations]
        assert seed_data["conversation_id"] in conv_ids, (
            f"Seeded conversation {seed_data['conversation_id']} not in list: {conv_ids}"
        )

    def test_04_send_message_and_get_ai_response(
        self, client: httpx.Client, seed_data: dict
    ):
        """POST /api/conversations/{id}/message — send a message, get AI response.

        This is the core test: proves the full LLM pipeline works end-to-end.
        """
        conversation_id = seed_data["conversation_id"]
        resp = client.post(
            f"/api/conversations/{conversation_id}/message",
            json={"message": "Teach me about photosynthesis", "tier": "free"},
        )

        # If we get a 502, check if it's an OpenRouter credits issue
        if resp.status_code == 502:
            body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            detail = body.get("detail", "")
            pytest.fail(
                f"AI tutor returned 502. This may indicate OpenRouter API key needs "
                f"credits — see task el-4xy. Detail: {detail}\n"
                f"Full response: {resp.text}"
            )

        assert resp.status_code == 200, (
            f"Send message failed: {resp.status_code} {resp.text}"
        )

        data = resp.json()

        # Assert: response has content (non-empty string from LLM)
        assert "message" in data, f"Response missing 'message' field: {data}"
        content = data["message"].get("content", "")
        assert isinstance(content, str) and len(content) > 0, (
            f"AI response content is empty: {data['message']}"
        )

        # Assert: response has model field (should be a gemini model for free tier)
        model = data.get("model", "")
        assert isinstance(model, str) and len(model) > 0, (
            f"Response missing or empty 'model' field: {data}"
        )
        assert "gemini" in model.lower(), (
            f"Free tier should use a Gemini model, got: {model}"
        )

        # Assert: quiz_detected is boolean
        assert "quiz_detected" in data, f"Response missing 'quiz_detected': {data}"
        assert isinstance(data["quiz_detected"], bool), (
            f"quiz_detected should be bool, got: {type(data['quiz_detected'])}"
        )

    def test_05_message_history_stored(
        self, client: httpx.Client, seed_data: dict
    ):
        """GET /api/conversations/{id}/messages — verify messages are persisted.

        After sending a message in test_04, we should have at least a user+assistant
        message pair stored.
        """
        conversation_id = seed_data["conversation_id"]
        resp = client.get(f"/api/conversations/{conversation_id}/messages")
        assert resp.status_code == 200

        data = resp.json()
        assert "messages" in data, f"Response missing 'messages': {data}"
        messages = data["messages"]
        assert isinstance(messages, list)
        assert len(messages) >= 2, (
            f"Expected at least 2 messages (user + assistant), got {len(messages)}: "
            f"{[m.get('role') for m in messages]}"
        )

        # Verify we have both a user and an assistant message
        roles = [m["role"] for m in messages]
        assert "user" in roles, f"No user message found. Roles: {roles}"
        assert "assistant" in roles, f"No assistant message found. Roles: {roles}"

        # Verify assistant message has non-empty content
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]
        for msg in assistant_msgs:
            assert msg.get("content"), f"Assistant message has empty content: {msg}"

    def test_06_points_endpoint(self, client: httpx.Client, seed_data: dict):
        """GET /api/learners/{id}/points — verify endpoint works."""
        learner_id = seed_data["learner_id"]
        resp = client.get(f"/api/learners/{learner_id}/points")
        assert resp.status_code == 200

        data = resp.json()
        assert "learner_id" in data, f"Response missing 'learner_id': {data}"
        assert data["learner_id"] == learner_id
        assert "points" in data, f"Response missing 'points': {data}"
        assert isinstance(data["points"], int), (
            f"Points should be int, got: {type(data['points'])}"
        )

    def test_07_mastery_endpoint(self, client: httpx.Client, seed_data: dict):
        """GET /api/learners/{id}/mastery — verify endpoint works."""
        learner_id = seed_data["learner_id"]
        resp = client.get(f"/api/learners/{learner_id}/mastery")
        assert resp.status_code == 200

        data = resp.json()
        assert "learner_id" in data, f"Response missing 'learner_id': {data}"
        assert data["learner_id"] == learner_id
        assert "overall_mastery" in data, f"Response missing 'overall_mastery': {data}"
        assert isinstance(data["overall_mastery"], (int, float)), (
            f"overall_mastery should be numeric, got: {type(data['overall_mastery'])}"
        )
        assert "overall_level" in data, f"Response missing 'overall_level': {data}"
        assert "concepts" in data, f"Response missing 'concepts': {data}"
        assert isinstance(data["concepts"], list)
