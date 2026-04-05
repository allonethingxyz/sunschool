"""Unit tests for the conductor service.

Tests the SEIAR phase management, quiz detection/scoring,
gate checking, and context window management logic.
These tests exercise internal logic without requiring a database
or LLM — they test the pure functions and state transitions.
"""

import pytest
from datetime import datetime

from app.models.graph import (
    ConversationState,
    Gate,
    GateStatus,
    GateType,
    MasteryEdge,
    PendingQuiz,
    QuizType,
    SEIARPhase,
)
from app.services.conductor import ConductorSession
from app.services.prompt_templates import (
    build_system_prompt,
    get_grade_band,
    get_grade_config,
)


# --- Grade band tests ---

def test_grade_band_mapping():
    assert get_grade_band(0) == "K-2"
    assert get_grade_band(2) == "K-2"
    assert get_grade_band(3) == "3-5"
    assert get_grade_band(5) == "3-5"
    assert get_grade_band(6) == "6-8"
    assert get_grade_band(8) == "6-8"
    assert get_grade_band(9) == "9-12"
    assert get_grade_band(12) == "9-12"


def test_grade_config_has_required_fields():
    for grade in [1, 4, 7, 10]:
        config = get_grade_config(grade)
        assert config.band
        assert config.max_sentence_words > 0
        assert config.vocabulary_level
        assert config.interaction_style
        assert config.system_prompt_modifier


# --- System prompt tests ---

def test_system_prompt_includes_grade_info():
    prompt = build_system_prompt(grade_level=3, seiar_phase="storytelling")
    assert "grade 3" in prompt.lower()
    assert "3-5" in prompt
    assert "STORYTELLING" in prompt


def test_system_prompt_includes_parent_guidelines():
    prompt = build_system_prompt(
        grade_level=5,
        seiar_phase="interaction",
        parent_guidelines="Focus on math only. No violence.",
    )
    assert "Focus on math only" in prompt
    assert "PARENT GUIDELINES" in prompt


def test_system_prompt_includes_mastery():
    prompt = build_system_prompt(
        grade_level=7,
        seiar_phase="examples",
        mastery_summary="Fractions: mastered (8/10, 80%)",
    )
    assert "Fractions" in prompt
    assert "MASTERY" in prompt


# --- SEIAR phase advancement tests ---

def test_seiar_phase_progression():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )

    # Message 1: storytelling
    session.state.message_count = 1
    session._advance_seiar_phase()
    assert session.state.seiar_phase == SEIARPhase.STORYTELLING

    # Message 2-3: examples
    session.state.message_count = 2
    session._advance_seiar_phase()
    assert session.state.seiar_phase == SEIARPhase.EXAMPLES

    # Message 4-6: interaction
    session.state.message_count = 5
    session._advance_seiar_phase()
    assert session.state.seiar_phase == SEIARPhase.INTERACTION

    # Message 7: assessment
    session.state.message_count = 7
    session._advance_seiar_phase()
    assert session.state.seiar_phase == SEIARPhase.ASSESSMENT


def test_seiar_refinement_loops_back():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )
    session.state.seiar_phase = SEIARPhase.REFINEMENT
    session.state.message_count = 8
    session._advance_seiar_phase()
    assert session.state.seiar_phase == SEIARPhase.STORYTELLING


# --- Quiz detection tests ---

def test_parse_multiple_choice_quiz():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )

    content = """Let me see if you understood that!

QUIZ: What is the largest planet in our solar system?
A) Mars
B) Jupiter
C) Saturn
D) Earth
ANSWER: B

Think about what we just learned!"""

    result = session._parse_response(content)
    assert result["has_quiz"] is True
    assert result["quiz"] is not None
    assert result["quiz"].quiz_type == QuizType.MULTIPLE_CHOICE
    assert "largest planet" in result["quiz"].question
    assert result["quiz"].correct_answer == "B"
    assert len(result["quiz"].options) == 4


def test_parse_open_ended_quiz():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=9,
    )

    content = """Great discussion! Let me check your understanding.

QUIZ: Explain why photosynthesis is important for life on Earth.
ANSWER: Photosynthesis converts CO2 to oxygen and produces glucose for energy.

Take your time with this one."""

    result = session._parse_response(content)
    assert result["has_quiz"] is True
    assert result["quiz"].quiz_type == QuizType.OPEN_ENDED


def test_parse_no_quiz():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )

    content = "That's a great question! The solar system has 8 planets."
    result = session._parse_response(content)
    assert result["has_quiz"] is False
    assert result["quiz"] is None


# --- Gate checking tests ---

def test_topic_blocked_gate():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )
    session.gates = [
        Gate(
            id="gate-1",
            gate_type=GateType.TOPIC_BLOCKED,
            predicate_json={"topics": ["violence", "weapons"]},
            status=GateStatus.ACTIVE,
            parent_id="parent-1",
        )
    ]

    # Should block
    result = session._check_gates("Tell me about weapons")
    assert result is not None
    assert "can't discuss" in result.lower()

    # Should allow
    result = session._check_gates("Tell me about dinosaurs")
    assert result is None


def test_time_limited_gate():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )
    session.gates = [
        Gate(
            id="gate-2",
            gate_type=GateType.TIME_LIMITED,
            predicate_json={"max_minutes_per_day": 10},
            status=GateStatus.ACTIVE,
            parent_id="parent-1",
        )
    ]

    # Under limit
    session.state.message_count = 2
    result = session._check_gates("Tell me more")
    assert result is None

    # Over limit (10 messages * 2 min = 20 min > 10 min limit)
    session.state.message_count = 10
    result = session._check_gates("Tell me more")
    assert result is not None
    assert "break" in result.lower()


def test_inactive_gate_ignored():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )
    session.gates = [
        Gate(
            id="gate-3",
            gate_type=GateType.TOPIC_BLOCKED,
            predicate_json={"topics": ["violence"]},
            status=GateStatus.APPROVED,  # Not active
            parent_id="parent-1",
        )
    ]

    result = session._check_gates("Tell me about violence")
    assert result is None


# --- Mastery update tests ---

def test_mastery_update_from_discussion():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )

    # New concept
    points = session._update_mastery_from_discussion(["Photosynthesis"])
    assert points == 1  # 1 point for new concept
    assert "photosynthesis" in session.mastery
    assert session.mastery["photosynthesis"].level == 0.1

    # Discuss again — small boost
    points = session._update_mastery_from_discussion(["Photosynthesis"])
    assert points == 0  # No points for repeat discussion
    assert session.mastery["photosynthesis"].level == pytest.approx(0.12)


def test_mastery_update_from_assessment():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )

    # Correct answer
    session._update_mastery_edge("Fractions", correct=True, confidence_delta=0.15)
    assert session.mastery["fractions"].correct == 1
    assert session.mastery["fractions"].total == 1
    assert session.mastery["fractions"].level == 0.15

    # Another correct answer
    session._update_mastery_edge("Fractions", correct=True, confidence_delta=0.15)
    assert session.mastery["fractions"].correct == 2
    assert session.mastery["fractions"].level == 0.30

    # Wrong answer
    session._update_mastery_edge("Fractions", correct=False, confidence_delta=-0.05)
    assert session.mastery["fractions"].correct == 2
    assert session.mastery["fractions"].total == 3
    assert session.mastery["fractions"].level == 0.25


def test_mastery_level_clamped():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )

    # Push above 1.0
    session._update_mastery_edge("Math", correct=True, confidence_delta=1.5)
    assert session.mastery["math"].level == 1.0

    # Push below 0.0
    session._update_mastery_edge("Math", correct=False, confidence_delta=-2.0)
    assert session.mastery["math"].level == 0.0


# --- Topic detection tests ---

def test_topic_detection():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )

    assert session._detect_topic("Teach me about dinosaurs") == "dinosaurs"
    assert session._detect_topic("What is photosynthesis?") == "photosynthesis"
    assert session._detect_topic("I want to know about the solar system") == "the solar system"


# --- Mastery summary tests ---

def test_mastery_summary_empty():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )
    summary = session._build_mastery_summary()
    assert "new learner" in summary.lower()


def test_mastery_summary_with_data():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )
    session.mastery["fractions"] = MasteryEdge(
        concept_id="fractions",
        concept_name="Fractions",
        level=0.85,
        correct=8,
        total=10,
    )
    summary = session._build_mastery_summary()
    assert "Fractions" in summary
    assert "mastered" in summary


# --- Context windowing tests ---

def test_llm_messages_windowed():
    session = ConductorSession(
        conversation_id="test-conv",
        learner_id="test-learner",
        grade_level=5,
    )

    from app.models.graph import Message

    # Add 30 messages
    for i in range(30):
        role = "user" if i % 2 == 0 else "assistant"
        session.messages.append(Message(role=role, content=f"Message {i}"))

    messages = session._build_llm_messages("System prompt", "Current question")

    # Should have: system + last 20 messages + current user = 22
    # (system prompt, then 20 history messages, then current user)
    assert len(messages) <= 23  # system + up to 20 history + current user
    assert messages[0]["role"] == "system"
    assert messages[-1]["role"] == "user"
    assert messages[-1]["content"] == "Current question"
