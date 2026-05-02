"""Tests for SEIAR prompt builder — app/services/prompt_templates.py."""

from __future__ import annotations

import pytest

from app.services.prompt_templates import (
    GradeBand,
    PromptContext,
    build_system_prompt,
    grade_to_band,
)


# ---------------------------------------------------------------------------
# grade_to_band
# ---------------------------------------------------------------------------


class TestGradeToBand:
    """grade_to_band maps numeric grades to the correct GradeBand."""

    @pytest.mark.parametrize(
        "grade, expected",
        [
            (0, GradeBand.K_2),
            (1, GradeBand.K_2),
            (2, GradeBand.K_2),
            (3, GradeBand.GRADE_3_5),
            (5, GradeBand.GRADE_3_5),
            (6, GradeBand.GRADE_6_8),
            (8, GradeBand.GRADE_6_8),
            (9, GradeBand.GRADE_9_12),
            (12, GradeBand.GRADE_9_12),
        ],
    )
    def test_mapping(self, grade: int, expected: GradeBand) -> None:
        assert grade_to_band(grade) == expected


# ---------------------------------------------------------------------------
# GradeBand enum
# ---------------------------------------------------------------------------


class TestGradeBand:
    def test_values(self) -> None:
        assert GradeBand.K_2.value == "K-2"
        assert GradeBand.GRADE_3_5.value == "3-5"
        assert GradeBand.GRADE_6_8.value == "6-8"
        assert GradeBand.GRADE_9_12.value == "9-12"

    def test_is_str_enum(self) -> None:
        """GradeBand is a str enum — values are directly usable as strings."""
        assert isinstance(GradeBand.K_2, str)


# ---------------------------------------------------------------------------
# PromptContext defaults
# ---------------------------------------------------------------------------


class TestPromptContext:
    def test_defaults(self) -> None:
        ctx = PromptContext(grade_band=GradeBand.K_2)
        assert ctx.character_name == "Sunny"
        assert ctx.subject == ""
        assert ctx.concept == ""
        assert ctx.learner_name == ""
        assert ctx.mastery_context == ""
        assert ctx.parent_guidelines == ""
        assert ctx.conversation_summary == ""

    def test_full_construction(self) -> None:
        ctx = PromptContext(
            grade_band=GradeBand.GRADE_6_8,
            subject="Science",
            concept="Photosynthesis",
            character_name="Professor Oak",
            character_personality="a wise botanist",
            learner_name="Alex",
            mastery_context="Photosynthesis: needs work",
            parent_guidelines="No mention of evolution",
            conversation_summary="We just started talking about plants.",
        )
        assert ctx.grade_band == GradeBand.GRADE_6_8
        assert ctx.subject == "Science"
        assert ctx.learner_name == "Alex"


# ---------------------------------------------------------------------------
# build_system_prompt — structure & content
# ---------------------------------------------------------------------------


class TestBuildSystemPrompt:
    """Verify the assembled system prompt contains all required sections."""

    def _build(self, **overrides) -> str:
        defaults = dict(
            grade_band=GradeBand.GRADE_3_5,
            subject="Math",
            concept="Fractions",
            character_name="Sunny",
            character_personality="a cheerful sun who loves numbers",
            learner_name="Jordan",
        )
        defaults.update(overrides)
        ctx = PromptContext(**defaults)
        return build_system_prompt(ctx)

    # -- Character identity --

    def test_contains_character_name(self) -> None:
        prompt = self._build()
        assert "Sunny" in prompt

    def test_contains_character_personality(self) -> None:
        prompt = self._build()
        assert "cheerful sun who loves numbers" in prompt

    def test_contains_learner_name(self) -> None:
        prompt = self._build()
        assert "Jordan" in prompt

    def test_contains_subject_and_concept(self) -> None:
        prompt = self._build()
        assert "Math" in prompt
        assert "Fractions" in prompt

    def test_contains_grade_band(self) -> None:
        prompt = self._build()
        assert "3-5" in prompt

    # -- SEIAR loop --

    def test_seiar_phases_present(self) -> None:
        prompt = self._build()
        for phase in [
            "Storytelling",
            "Examples",
            "Interaction",
            "Assessment",
            "Refinement",
        ]:
            assert phase in prompt, f"Missing SEIAR phase: {phase}"

    # -- Age adaptation --

    def test_k2_adaptation(self) -> None:
        prompt = self._build(grade_band=GradeBand.K_2)
        assert "5 words" in prompt  # sentence length constraint
        assert "K-2" in prompt

    def test_grade_3_5_adaptation(self) -> None:
        prompt = self._build(grade_band=GradeBand.GRADE_3_5)
        assert "8 words" in prompt
        assert "multiple-choice" in prompt.lower() or "multiple choice" in prompt.lower()

    def test_grade_6_8_adaptation(self) -> None:
        prompt = self._build(grade_band=GradeBand.GRADE_6_8)
        assert "rabbit hole" in prompt.lower()
        assert "natural language" in prompt.lower()

    def test_grade_9_12_adaptation(self) -> None:
        prompt = self._build(grade_band=GradeBand.GRADE_9_12)
        assert "socratic" in prompt.lower()
        assert "essay" in prompt.lower()

    # -- Quiz format --

    def test_quiz_format_instruction(self) -> None:
        prompt = self._build()
        assert "QUIZ:" in prompt

    # -- Content rules --

    def test_stay_in_character_rule(self) -> None:
        prompt = self._build()
        assert "stay in character" in prompt.lower()

    def test_safety_rules(self) -> None:
        prompt = self._build()
        # Should mention safety / banned topics
        assert "banned" in prompt.lower() or "safety" in prompt.lower()

    def test_no_pii_rule(self) -> None:
        prompt = self._build()
        assert "pii" in prompt.lower() or "personal" in prompt.lower()

    # -- Optional sections --

    def test_mastery_context_included(self) -> None:
        prompt = self._build(mastery_context="Fractions: needs work")
        assert "Fractions: needs work" in prompt
        assert "mastery" in prompt.lower()

    def test_mastery_context_omitted_when_empty(self) -> None:
        prompt = self._build(mastery_context="")
        assert "Learner's Current Mastery" not in prompt

    def test_parent_guidelines_included(self) -> None:
        prompt = self._build(parent_guidelines="Keep sessions under 30 minutes")
        assert "Keep sessions under 30 minutes" in prompt
        assert "parent" in prompt.lower()

    def test_parent_guidelines_omitted_when_empty(self) -> None:
        prompt = self._build(parent_guidelines="")
        assert "Parent Guidelines" not in prompt

    def test_conversation_summary_included(self) -> None:
        prompt = self._build(conversation_summary="We covered addition basics.")
        assert "We covered addition basics." in prompt

    def test_conversation_summary_omitted_when_empty(self) -> None:
        prompt = self._build(conversation_summary="")
        assert "Conversation So Far" not in prompt

    # -- No learner name --

    def test_no_learner_name(self) -> None:
        prompt = self._build(learner_name="")
        assert "named " not in prompt or "named Sunny" not in prompt

    # -- Default character --

    def test_default_character_name(self) -> None:
        ctx = PromptContext(grade_band=GradeBand.K_2)
        prompt = build_system_prompt(ctx)
        assert "Sunny" in prompt


# ---------------------------------------------------------------------------
# Consistency with content_validator
# ---------------------------------------------------------------------------


class TestConsistencyWithContentValidator:
    """Ensure GradeBand and grade_to_band are aligned with content_validator."""

    def test_grade_band_values_match(self) -> None:
        from app.services.content_validator import (
            GradeBand as CVGradeBand,
        )

        # Values should be identical
        assert GradeBand.K_2.value == CVGradeBand.K_2.value
        assert GradeBand.GRADE_3_5.value == CVGradeBand.GRADE_3_5.value
        assert GradeBand.GRADE_6_8.value == CVGradeBand.GRADE_6_8.value
        assert GradeBand.GRADE_9_12.value == CVGradeBand.GRADE_9_12.value

    def test_grade_to_band_agrees(self) -> None:
        from app.services.content_validator import (
            grade_to_band as cv_grade_to_band,
        )

        for grade in range(0, 13):
            ours = grade_to_band(grade).value
            theirs = cv_grade_to_band(grade).value
            assert ours == theirs, f"Mismatch at grade {grade}: {ours} vs {theirs}"
