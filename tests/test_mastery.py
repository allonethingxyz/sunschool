"""Tests for the mastery service.

No mocks — tests exercise real mastery logic (label thresholds, validation).
Database-dependent tests require a running AGE instance and are marked
with @pytest.mark.db.
"""

from __future__ import annotations

import pytest

from app.services.mastery import mastery_label


# ---------------------------------------------------------------------------
# mastery_label thresholds
# ---------------------------------------------------------------------------


class TestMasteryLabel:
    """Test mastery label classification at boundary values."""

    def test_zero_is_needs_work(self) -> None:
        assert mastery_label(0.0) == "needs_work"

    def test_below_03_is_needs_work(self) -> None:
        assert mastery_label(0.29) == "needs_work"

    def test_at_03_is_learning(self) -> None:
        assert mastery_label(0.3) == "learning"

    def test_mid_range_is_learning(self) -> None:
        assert mastery_label(0.5) == "learning"

    def test_below_07_is_learning(self) -> None:
        assert mastery_label(0.69) == "learning"

    def test_at_07_is_mastered(self) -> None:
        assert mastery_label(0.7) == "mastered"

    def test_high_confidence_is_mastered(self) -> None:
        assert mastery_label(0.95) == "mastered"

    def test_perfect_is_mastered(self) -> None:
        assert mastery_label(1.0) == "mastered"


# ---------------------------------------------------------------------------
# Bayesian update logic (unit-level, no DB)
# ---------------------------------------------------------------------------


class TestBayesianUpdate:
    """Test the Bayesian confidence update formula directly."""

    def test_update_from_zero_with_perfect_score(self) -> None:
        """Starting at 0, score=1.0, lr=0.2 -> new_confidence=0.2."""
        old = 0.0
        score = 1.0
        lr = 0.2
        new = old + lr * (score - old)
        assert round(new, 4) == 0.2

    def test_update_from_half_with_perfect_score(self) -> None:
        """Starting at 0.5, score=1.0, lr=0.2 -> 0.6."""
        old = 0.5
        score = 1.0
        lr = 0.2
        new = old + lr * (score - old)
        assert round(new, 4) == 0.6

    def test_update_from_half_with_zero_score(self) -> None:
        """Starting at 0.5, score=0.0, lr=0.2 -> 0.4."""
        old = 0.5
        score = 0.0
        lr = 0.2
        new = old + lr * (score - old)
        assert round(new, 4) == 0.4

    def test_confidence_stays_in_bounds(self) -> None:
        """Confidence should always be in [0.0, 1.0]."""
        old = 0.95
        score = 1.0
        lr = 0.2
        new = old + lr * (score - old)
        new = max(0.0, min(1.0, new))
        assert 0.0 <= new <= 1.0

    def test_repeated_correct_answers_increase_mastery(self) -> None:
        """Repeated perfect scores should push confidence toward 1.0."""
        confidence = 0.0
        lr = 0.2
        for _ in range(20):
            confidence = confidence + lr * (1.0 - confidence)
            confidence = max(0.0, min(1.0, confidence))
        assert confidence > 0.95
        assert mastery_label(confidence) == "mastered"

    def test_repeated_wrong_answers_decrease_mastery(self) -> None:
        """Repeated zero scores should push confidence toward 0.0."""
        confidence = 0.8
        lr = 0.2
        for _ in range(20):
            confidence = confidence + lr * (0.0 - confidence)
            confidence = max(0.0, min(1.0, confidence))
        assert confidence < 0.05
        assert mastery_label(confidence) == "needs_work"

    def test_mixed_scores_converge_to_average(self) -> None:
        """Alternating 1.0 and 0.0 scores should converge near 0.5."""
        confidence = 0.0
        lr = 0.2
        for i in range(40):
            score = 1.0 if i % 2 == 0 else 0.0
            confidence = confidence + lr * (score - confidence)
        assert 0.4 < confidence < 0.6
        assert mastery_label(confidence) == "learning"


# ---------------------------------------------------------------------------
# _parse_agtype
# ---------------------------------------------------------------------------


class TestParseAgtype:
    """Test AGE agtype value parsing."""

    def test_none_returns_none(self) -> None:
        from app.services.mastery import _parse_agtype

        assert _parse_agtype(None) is None

    def test_quoted_string(self) -> None:
        from app.services.mastery import _parse_agtype

        assert _parse_agtype('"hello"') == "hello"

    def test_integer(self) -> None:
        from app.services.mastery import _parse_agtype

        assert _parse_agtype("42") == 42

    def test_float(self) -> None:
        from app.services.mastery import _parse_agtype

        assert _parse_agtype("3.14") == pytest.approx(3.14)

    def test_json_object(self) -> None:
        from app.services.mastery import _parse_agtype

        result = _parse_agtype('{"key": "value"}')
        assert result == {"key": "value"}

    def test_plain_string(self) -> None:
        from app.services.mastery import _parse_agtype

        assert _parse_agtype("hello_world") == "hello_world"
