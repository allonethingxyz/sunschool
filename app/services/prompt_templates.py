"""Grade-specific prompt templates following the SEIAR loop.

SEIAR: Storytelling, Examples, Interaction, Assessment, Refinement

Grade bands:
  K-2:  Simple language, image-heavy, gentle encouragement
  3-5:  Chat with personality, fun analogies, guided discovery
  6-8:  Full chat, Socratic questioning, deeper reasoning
  9-12: Conversation-first, debate-ready, analytical depth
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class GradeBand(str, Enum):
    K_2 = "K-2"
    GRADE_3_5 = "3-5"
    GRADE_6_8 = "6-8"
    GRADE_9_12 = "9-12"


def grade_to_band(grade: int) -> GradeBand:
    """Convert a numeric grade level (0=K, 1-12) to a grade band."""
    if grade <= 2:
        return GradeBand.K_2
    elif grade <= 5:
        return GradeBand.GRADE_3_5
    elif grade <= 8:
        return GradeBand.GRADE_6_8
    else:
        return GradeBand.GRADE_9_12


@dataclass
class PromptContext:
    """Context injected into prompt templates."""

    grade_band: GradeBand
    concept: str
    character_name: str = ""
    character_personality: str = ""
    conversation_summary: str = ""
    subject: str = ""
    learner_name: str = ""


# --- Grade band tone/style descriptors ---

GRADE_BAND_STYLE: dict[GradeBand, dict[str, str]] = {
    GradeBand.K_2: {
        "tone": "warm, encouraging, and playful",
        "vocabulary": "Use very simple words (1-2 syllable). Short sentences (5-8 words max). Lots of exclamation marks and celebration.",
        "interaction": "Ask one simple question at a time. Use yes/no or simple choice questions. Celebrate every attempt with enthusiasm.",
        "storytelling": "Tell tiny stories with friendly animals or characters. Use vivid imagery kids can picture. Make the concept feel like an adventure.",
        "assessment": "Use picture-based or single-word answer questions. Maximum 3 choices. Always praise effort regardless of answer.",
        "examples": "Use concrete, physical-world examples (counting toys, colors, shapes). Relate to everyday kid experiences.",
    },
    GradeBand.GRADE_3_5: {
        "tone": "friendly, curious, and encouraging with a dash of humor",
        "vocabulary": "Use grade-appropriate vocabulary. Sentences can be longer but stay conversational. Define any new words naturally in context.",
        "interaction": "Ask open-ended questions that spark curiosity. Use 'what if' scenarios. Encourage the student to explain their thinking.",
        "storytelling": "Create relatable scenarios and fun analogies. Use humor and personality. Build mini-narratives around concepts.",
        "assessment": "Mix multiple choice with short-answer questions. 4 choices for MC. Give specific, helpful feedback on wrong answers.",
        "examples": "Use real-world examples kids care about (games, sports, nature, food). Connect new ideas to things they already know.",
    },
    GradeBand.GRADE_6_8: {
        "tone": "respectful, intellectually engaging, and conversational",
        "vocabulary": "Use academic vocabulary with natural explanations. Introduce domain-specific terms. Write at a middle-school reading level.",
        "interaction": "Use Socratic questioning — guide students to discover answers themselves. Ask 'why' and 'how' questions. Challenge assumptions gently.",
        "storytelling": "Use real-world case studies and historical examples. Create thought experiments. Connect concepts across subjects.",
        "assessment": "Include analysis and application questions, not just recall. Use scenarios that require applying knowledge. Provide detailed explanations.",
        "examples": "Use current events, technology, and real-world applications. Show how concepts connect to careers and everyday decisions.",
    },
    GradeBand.GRADE_9_12: {
        "tone": "intellectually rigorous, conversational, and thought-provoking",
        "vocabulary": "Use advanced academic language. Expect and encourage precise terminology. Write at a high-school to college-prep level.",
        "interaction": "Engage in genuine intellectual dialogue. Present counterarguments. Encourage debate and critical analysis. Ask students to evaluate and synthesize.",
        "storytelling": "Use primary sources, research findings, and complex case studies. Present multiple perspectives on issues. Explore nuance and ambiguity.",
        "assessment": "Require analysis, synthesis, and evaluation. Include essay-style and open-ended questions. Grade on reasoning quality, not just correctness.",
        "examples": "Use academic research, cross-disciplinary connections, and real-world complexity. Show tradeoffs and competing frameworks.",
    },
}


def _build_character_block(ctx: PromptContext) -> str:
    """Build the character personality injection block."""
    if not ctx.character_name:
        return "You are a helpful and knowledgeable tutor."
    parts = [f"You are {ctx.character_name}, a tutoring character."]
    if ctx.character_personality:
        parts.append(f"Personality: {ctx.character_personality}")
    parts.append("Stay in character throughout the conversation while teaching effectively.")
    return " ".join(parts)


def _build_context_block(ctx: PromptContext) -> str:
    """Build the conversation context block."""
    if not ctx.conversation_summary:
        return ""
    return (
        f"\n## Conversation Context\n"
        f"Summary of previous conversation:\n{ctx.conversation_summary}\n"
        f"Continue naturally from where the conversation left off."
    )


def _build_seiar_instructions(style: dict[str, str]) -> str:
    """Build SEIAR loop instructions from grade band style."""
    return (
        "## Teaching Method (SEIAR Loop)\n"
        "Follow this pedagogical cycle:\n\n"
        f"1. **Storytelling**: {style['storytelling']}\n"
        f"2. **Examples**: {style['examples']}\n"
        f"3. **Interaction**: {style['interaction']}\n"
        f"4. **Assessment**: {style['assessment']}\n"
        f"5. **Refinement**: Based on the student's responses, adapt your approach. "
        "If they're struggling, simplify and provide more scaffolding. "
        "If they're excelling, increase complexity and depth.\n"
    )


# --- System prompt builders ---


def build_system_prompt(ctx: PromptContext) -> str:
    """Build a complete system prompt for tutoring, adapted to grade band.

    Includes: character personality, grade band adjustments, concept focus,
    SEIAR loop instructions, and conversation history summary.
    """
    style = GRADE_BAND_STYLE[ctx.grade_band]
    character_block = _build_character_block(ctx)
    context_block = _build_context_block(ctx)
    seiar = _build_seiar_instructions(style)

    subject_line = f" in {ctx.subject}" if ctx.subject else ""
    learner_line = f" The student's name is {ctx.learner_name}." if ctx.learner_name else ""

    return (
        f"{character_block}{learner_line}\n\n"
        f"## Grade Band: {ctx.grade_band.value}\n"
        f"**Tone**: {style['tone']}\n"
        f"**Language**: {style['vocabulary']}\n\n"
        f"## Focus\n"
        f"You are teaching about **{ctx.concept}**{subject_line}.\n\n"
        f"{seiar}\n"
        f"## Interaction Style\n"
        f"{style['interaction']}\n"
        f"{context_block}"
    )


# --- Specific prompt templates ---


def lesson_generation_prompt(ctx: PromptContext) -> tuple[str, str]:
    """Generate system and user prompts for lesson creation.

    Returns:
        (system_message, user_message) tuple.
    """
    style = GRADE_BAND_STYLE[ctx.grade_band]

    system = (
        "You are a curriculum designer creating engaging lesson content.\n\n"
        f"## Grade Band: {ctx.grade_band.value}\n"
        f"**Tone**: {style['tone']}\n"
        f"**Language**: {style['vocabulary']}\n"
        f"**Examples**: {style['examples']}\n\n"
        "## Output Format\n"
        "Respond with a JSON object containing:\n"
        "- title: Engaging lesson title\n"
        "- content: The full lesson text following the SEIAR structure "
        "(Storytelling hook, Examples, Interactive prompts, Assessment preview, Refinement notes)\n"
        "- key_concepts: List of 3-5 key concepts covered\n"
        "- vocabulary: List of new vocabulary words introduced\n"
        "- suggested_activities: List of 2-3 hands-on activities\n\n"
        "Make the content grade-appropriate and engaging."
    )

    subject_part = f" in {ctx.subject}" if ctx.subject else ""
    user = (
        f"Create a lesson about {ctx.concept}{subject_part} "
        f"for a {ctx.grade_band.value} grade student."
    )

    return system, user


def quiz_generation_prompt(
    ctx: PromptContext,
    num_questions: int = 5,
    lesson_content: str = "",
) -> tuple[str, str]:
    """Generate system and user prompts for quiz creation.

    Returns:
        (system_message, user_message) tuple.
    """
    style = GRADE_BAND_STYLE[ctx.grade_band]

    system = (
        "You are an assessment designer creating quiz questions.\n\n"
        f"## Grade Band: {ctx.grade_band.value}\n"
        f"**Assessment style**: {style['assessment']}\n"
        f"**Language**: {style['vocabulary']}\n\n"
        "## Output Format\n"
        "Respond with a JSON object containing:\n"
        "- questions: Array of question objects, each with:\n"
        "  - question: The question text\n"
        "  - options: Array of 3-4 answer choices\n"
        "  - correct_index: Index (0-based) of the correct answer\n"
        "  - explanation: Why the correct answer is right\n\n"
        "Make questions progressively harder. Test understanding, not memorization."
    )

    lesson_ref = ""
    if lesson_content:
        lesson_ref = f"\n\nBase the quiz on this lesson content:\n{lesson_content}"

    subject_part = f" in {ctx.subject}" if ctx.subject else ""
    user = (
        f"Create {num_questions} quiz questions about {ctx.concept}{subject_part} "
        f"for a {ctx.grade_band.value} grade student.{lesson_ref}"
    )

    return system, user


def answer_scoring_prompt(
    ctx: PromptContext,
    question: str,
    expected_answer: str,
    student_answer: str,
) -> tuple[str, str]:
    """Generate system and user prompts for scoring a student's answer.

    Returns:
        (system_message, user_message) tuple.
    """
    style = GRADE_BAND_STYLE[ctx.grade_band]

    system = (
        "You are an educational assessment expert scoring student answers.\n\n"
        f"## Grade Band: {ctx.grade_band.value}\n"
        f"**Feedback style**: {style['tone']}\n\n"
        "## Scoring Guidelines\n"
        "- Score on a 0.0 to 1.0 scale (0 = completely wrong, 1 = perfect)\n"
        "- Give partial credit for partially correct answers\n"
        "- Consider the grade level when evaluating — be age-appropriate in expectations\n"
        "- Focus on understanding over exact wording\n\n"
        "## Output Format\n"
        "Respond with a JSON object containing:\n"
        "- score: Float 0.0-1.0\n"
        "- feedback: Encouraging, specific feedback for the student\n"
        "- concepts_demonstrated: List of concepts the student showed understanding of\n"
        "- points_awarded: Integer points (score * 10, rounded)\n"
    )

    user = (
        f"**Question**: {question}\n"
        f"**Expected answer**: {expected_answer}\n"
        f"**Student's answer**: {student_answer}\n\n"
        f"Score this {ctx.grade_band.value} grade student's answer."
    )

    return system, user


def content_validation_prompt(
    ctx: PromptContext,
    content: str,
) -> tuple[str, str]:
    """Generate system and user prompts for content validation.

    Checks readability, safety, and grade-appropriateness.

    Returns:
        (system_message, user_message) tuple.
    """
    system = (
        "You are a content safety and quality reviewer for educational materials.\n\n"
        f"## Target Grade Band: {ctx.grade_band.value}\n\n"
        "## Review Criteria\n"
        "1. **Safety**: No violence, inappropriate content, bias, or harmful material\n"
        "2. **Grade appropriateness**: Language complexity, concept difficulty, and "
        "examples match the target grade band\n"
        "3. **Readability**: Text is clear, well-structured, and engaging for the age group\n"
        "4. **Accuracy**: Content is factually correct\n\n"
        "## Output Format\n"
        "Respond with a JSON object containing:\n"
        "- is_safe: Boolean — true if content passes safety review\n"
        "- is_grade_appropriate: Boolean — true if appropriate for the grade band\n"
        "- readability_score: Float 0.0-1.0 (1.0 = perfectly readable for grade)\n"
        "- issues: Array of strings describing any problems found (empty if none)\n"
    )

    subject_part = f" ({ctx.subject})" if ctx.subject else ""
    user = (
        f"Review the following educational content intended for "
        f"{ctx.grade_band.value} grade students{subject_part}:\n\n"
        f"---\n{content}\n---"
    )

    return system, user


def tutoring_prompt(ctx: PromptContext) -> str:
    """Build a tutoring system prompt for the conversation loop.

    This is the main system prompt used during live tutoring conversations.
    It combines character personality, grade band adjustments, SEIAR methodology,
    concept focus, and conversation history.

    Returns:
        Complete system prompt string.
    """
    return build_system_prompt(ctx)
