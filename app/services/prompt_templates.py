"""Grade-specific SEIAR prompt templates.

Templates adapt vocabulary, sentence length, interaction style,
and assessment format based on the learner's grade band.

Grade bands: K-2, 3-5, 6-8, 9-12
SEIAR phases: Storytelling, Examples, Interaction, Assessment, Refinement
"""

from dataclasses import dataclass


@dataclass
class GradeBandConfig:
    """Configuration for a grade band's teaching style."""

    band: str
    max_sentence_words: int
    vocabulary_level: str
    interaction_style: str
    assessment_format: str
    character_style: str
    system_prompt_modifier: str


GRADE_BANDS: dict[str, GradeBandConfig] = {
    "K-2": GradeBandConfig(
        band="K-2",
        max_sentence_words=8,
        vocabulary_level="simple, concrete words only",
        interaction_style="tap-to-answer, big buttons, image-heavy",
        assessment_format="multiple choice with 2-3 options, picture-based when possible",
        character_style="friendly animal or cartoon character",
        system_prompt_modifier=(
            "Use very simple language. Maximum 5-8 words per sentence. "
            "Be warm and encouraging like a friendly animal friend. "
            "Use lots of emojis and excitement. Ask one simple question at a time. "
            "For quizzes, always use multiple choice with 2-3 clear options."
        ),
    ),
    "3-5": GradeBandConfig(
        band="3-5",
        max_sentence_words=15,
        vocabulary_level="grade-appropriate, define new words inline",
        interaction_style="chat with short messages, multiple choice as buttons",
        assessment_format="multiple choice with 4 options, short answer accepted",
        character_style="characters with personality and expertise",
        system_prompt_modifier=(
            "Use short, clear sentences. Define any big words when you first use them. "
            "Be friendly and enthusiastic. Use analogies to things kids know "
            "(games, sports, animals, food). For quizzes, use multiple choice with "
            "4 options labeled A-D, or ask for a short answer."
        ),
    ),
    "6-8": GradeBandConfig(
        band="6-8",
        max_sentence_words=25,
        vocabulary_level="expanding vocabulary, academic terms introduced",
        interaction_style="full chat, natural language, character handoffs",
        assessment_format="natural language answers scored by AI, multiple choice",
        character_style="expert characters with distinct personalities",
        system_prompt_modifier=(
            "Use natural conversational language appropriate for middle schoolers. "
            "Introduce academic vocabulary with context. Challenge them to think deeper. "
            "For quizzes, mix multiple choice (A-D) with open-ended questions. "
            "Score open-ended answers for understanding, not exact wording."
        ),
    ),
    "9-12": GradeBandConfig(
        band="9-12",
        max_sentence_words=40,
        vocabulary_level="full academic language, domain-specific terms",
        interaction_style="Socratic method, debates, essay responses",
        assessment_format="essay-style, primary source analysis, open-ended",
        character_style="characters that debate and challenge",
        system_prompt_modifier=(
            "Engage as an intellectual peer. Use Socratic questioning to guide discovery. "
            "Encourage critical thinking and multiple perspectives. "
            "For assessment, ask open-ended questions that require synthesis and analysis. "
            "Accept and evaluate nuanced arguments, not just factual recall."
        ),
    ),
}


def get_grade_band(grade_level: int) -> str:
    """Map a numeric grade level (0-12) to a grade band."""
    if grade_level <= 2:
        return "K-2"
    elif grade_level <= 5:
        return "3-5"
    elif grade_level <= 8:
        return "6-8"
    else:
        return "9-12"


def get_grade_config(grade_level: int) -> GradeBandConfig:
    """Get the GradeBandConfig for a numeric grade level."""
    return GRADE_BANDS[get_grade_band(grade_level)]


# --- SEIAR Phase Templates ---

SEIAR_PHASE_PROMPTS = {
    "storytelling": (
        "You are starting a new topic. Introduce it through an engaging narrative or story. "
        "Connect it to something the learner might already know or care about. "
        "End with a hook that makes them want to learn more."
    ),
    "examples": (
        "Provide concrete examples, analogies, and illustrations of the concept. "
        "Use real-world connections. If appropriate, describe a visual or diagram. "
        "Make the abstract concrete."
    ),
    "interaction": (
        "The learner is actively engaging. Respond to their questions and comments. "
        "Guide them deeper into the topic. Correct any misconceptions gently. "
        "Encourage curiosity and exploration."
    ),
    "assessment": (
        "It's time to check understanding. Weave a quiz question naturally into "
        "the conversation. Don't say 'quiz time' — make it feel like a natural "
        "part of the discussion. After asking, wait for their answer before continuing."
    ),
    "refinement": (
        "The learner has been assessed. If they got it right, reinforce and go deeper "
        "or introduce the next concept. If they struggled, provide a different explanation, "
        "more examples, or break it into smaller pieces. Be encouraging either way."
    ),
}


def build_system_prompt(
    grade_level: int,
    seiar_phase: str,
    mastery_summary: str = "",
    parent_guidelines: str = "",
    conversation_summary: str = "",
    character_name: str = "Sunny",
    character_personality: str = "a friendly, encouraging tutor",
) -> str:
    """Build the full system prompt for an LLM call.

    Combines:
    - Base tutor identity
    - Grade-specific adaptation
    - SEIAR phase instruction
    - Mastery context
    - Parent guidelines
    - Conversation summary

    Args:
        grade_level: Numeric grade (0-12).
        seiar_phase: Current SEIAR phase (storytelling/examples/interaction/assessment/refinement).
        mastery_summary: Summary of learner's mastery state.
        parent_guidelines: Parent-set constraints and focus areas.
        conversation_summary: Compressed summary of earlier conversation.
        character_name: Name of the teaching character.
        character_personality: Description of the character's personality.

    Returns:
        Complete system prompt string.
    """
    config = get_grade_config(grade_level)
    phase_prompt = SEIAR_PHASE_PROMPTS.get(seiar_phase, SEIAR_PHASE_PROMPTS["interaction"])

    parts = [
        f"You are {character_name}, {character_personality}.",
        f"You are teaching a grade {grade_level} student ({config.band} level).",
        "",
        "TEACHING STYLE:",
        config.system_prompt_modifier,
        "",
        f"CURRENT PHASE: {seiar_phase.upper()}",
        phase_prompt,
    ]

    if mastery_summary:
        parts.extend([
            "",
            "LEARNER'S MASTERY STATE:",
            mastery_summary,
        ])

    if parent_guidelines:
        parts.extend([
            "",
            "PARENT GUIDELINES (you MUST follow these):",
            parent_guidelines,
        ])

    if conversation_summary:
        parts.extend([
            "",
            "CONVERSATION CONTEXT:",
            conversation_summary,
        ])

    parts.extend([
        "",
        "IMPORTANT RULES:",
        "- Never generate inappropriate, violent, or sexual content.",
        "- Stay within the learner's grade level.",
        "- If the learner asks about something outside your knowledge, say so honestly.",
        "- For quizzes: clearly format questions so they can be detected. "
        "Use 'QUIZ:' prefix for the question line, followed by options on separate lines "
        "starting with A), B), C), D) for multiple choice.",
        "- Keep responses focused and not too long.",
    ])

    return "\n".join(parts)


def build_quiz_detection_prompt() -> str:
    """System prompt addition for detecting quiz questions in AI output."""
    return (
        "When you include a quiz question, format it as:\n"
        "QUIZ: [your question here]\n"
        "A) [option]\n"
        "B) [option]\n"
        "C) [option]\n"
        "D) [option]\n"
        "ANSWER: [correct letter]\n\n"
        "For open-ended questions, format as:\n"
        "QUIZ: [your question here]\n"
        "ANSWER: [expected answer or key points]\n"
    )
