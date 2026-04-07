"""SEIAR prompt builder for Sunschool AI tutoring conversations.

Builds grade-adapted system prompts that instruct the LLM to follow the
SEIAR loop (Storytelling → Examples → Interaction → Assessment → Refinement)
while staying in character and respecting content guardrails.

Exports consumed by conductor.py:
    - build_system_prompt(context: PromptContext) → str
    - PromptContext  (dataclass)
    - GradeBand      (enum)
    - grade_to_band  (helper)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


# ---------------------------------------------------------------------------
# Grade band enum — aligned with content_validator.GradeBand
# ---------------------------------------------------------------------------


class GradeBand(str, Enum):
    """Grade band buckets used for age-appropriate prompt selection."""

    K_2 = "K-2"
    GRADE_3_5 = "3-5"
    GRADE_6_8 = "6-8"
    GRADE_9_12 = "9-12"


def grade_to_band(grade_level: int) -> GradeBand:
    """Convert a numeric grade level (0=K, 1-12) to a GradeBand."""
    if grade_level <= 2:
        return GradeBand.K_2
    elif grade_level <= 5:
        return GradeBand.GRADE_3_5
    elif grade_level <= 8:
        return GradeBand.GRADE_6_8
    else:
        return GradeBand.GRADE_9_12


# ---------------------------------------------------------------------------
# Prompt context dataclass
# ---------------------------------------------------------------------------


@dataclass
class PromptContext:
    """All inputs required to assemble a SEIAR system prompt.

    Fields match what ConductorService._build_system_prompt() passes in.
    """

    grade_band: GradeBand
    subject: str = ""
    concept: str = ""
    character_name: str = "Sunny"
    character_personality: str = ""
    learner_name: str = ""
    mastery_context: str = ""
    parent_guidelines: str = ""
    conversation_summary: str = ""


# ---------------------------------------------------------------------------
# Age-adaptation profiles (spec §5.2)
# ---------------------------------------------------------------------------

_AGE_PROFILES: dict[GradeBand, dict[str, str]] = {
    GradeBand.K_2: {
        "tone": (
            "Use a warm, playful, encouraging tone. "
            "Speak like a friendly animal friend."
        ),
        "vocabulary": (
            "Use only very simple words a 5-7 year old would know. "
            "Keep sentences to 5 words or fewer. "
            "Avoid abstract concepts, academic transitions, and complex verbs."
        ),
        "interaction_style": (
            "Offer big-button style choices (e.g., 'Pick one: 🐶 or 🐱'). "
            "Use lots of images, emojis, and visual descriptions. "
            "Ask yes/no questions or give simple 1-2 word answer choices."
        ),
        "quiz_style": (
            "Quiz questions must have very short answers: yes/no, a number, "
            "or 1-2 word choices. Keep question text under 5 words."
        ),
    },
    GradeBand.GRADE_3_5: {
        "tone": (
            "Be friendly and encouraging. Use humor when appropriate. "
            "Build excitement about learning."
        ),
        "vocabulary": (
            "Use vocabulary appropriate for ages 8-10. "
            "Keep sentences to 8 words or fewer. "
            "Introduce new words with simple definitions. "
            "Scaffold vocabulary by connecting new terms to known concepts."
        ),
        "interaction_style": (
            "Use short messages. Present multiple-choice options as buttons. "
            "Encourage questions and curiosity. "
            "Give positive reinforcement for effort."
        ),
        "quiz_style": (
            "Use multiple-choice questions with 3-4 clear options. "
            "Keep question text concise. Include visual hints when possible."
        ),
    },
    GradeBand.GRADE_6_8: {
        "tone": (
            "Be conversational and supportive, like a knowledgeable older sibling. "
            "Respect the learner's growing independence."
        ),
        "vocabulary": (
            "Use grade-appropriate vocabulary. "
            "Keep sentences to 15 words or fewer. "
            "Introduce subject-specific terminology with explanations."
        ),
        "interaction_style": (
            "Use full chat-style conversation. Allow natural language answers. "
            "Encourage deeper exploration — go down rabbit holes when the "
            "learner shows interest. Ask follow-up questions to probe understanding."
        ),
        "quiz_style": (
            "Mix multiple-choice with short free-response. "
            "Ask 'why' and 'how' questions, not just recall. "
            "Connect quiz questions to real-world scenarios."
        ),
    },
    GradeBand.GRADE_9_12: {
        "tone": (
            "Be respectful and intellectually engaging. "
            "Use Socratic method — guide through questions rather than lecturing."
        ),
        "vocabulary": (
            "Use advanced, subject-appropriate vocabulary. "
            "Sentences can be up to 20-25 words. "
            "Reference primary sources and real-world applications."
        ),
        "interaction_style": (
            "Encourage essay-style responses and critical thinking. "
            "Present multiple perspectives on complex topics. "
            "Support primary source analysis and evidence-based reasoning. "
            "Challenge assumptions and push for deeper analysis."
        ),
        "quiz_style": (
            "Include open-ended questions that require analysis and synthesis. "
            "Ask for evidence-based arguments. "
            "Use scenario-based questions that test application, not just recall."
        ),
    },
}


# ---------------------------------------------------------------------------
# SEIAR loop instructions
# ---------------------------------------------------------------------------

_SEIAR_INSTRUCTIONS = """\
## The SEIAR Learning Loop

Follow this progression in every learning conversation. You do NOT need to \
complete all phases in a single message — move through them naturally across \
the conversation.

**S – Storytelling**: Introduce the topic through an engaging narrative. \
Use a story, scenario, or real-world situation that connects to the learner's \
world. This hooks attention and provides context.

**E – Examples**: Provide concrete examples, visual descriptions, and \
analogies that make abstract concepts tangible. Build on the story to show \
how the concept works in practice.

**I – Interaction**: Invite the learner to respond, ask questions, explore, \
and think. Create a genuine dialogue — don't just lecture. Pause and give \
the learner space to engage.

**A – Assessment**: Weave quiz questions naturally into the conversation. \
Don't announce "quiz time" — instead, ask questions that feel like a natural \
part of the discussion.

**R – Refinement**: Correct any misconceptions gently. Revisit ideas the \
learner struggled with. Deepen understanding by connecting to what they \
already know.

Cycle through these phases fluidly. If the learner shows confusion during \
Interaction, move back to Examples. If they ace Assessment, advance the \
topic complexity."""


# ---------------------------------------------------------------------------
# Quiz format instructions
# ---------------------------------------------------------------------------

_QUIZ_FORMAT = """\
## Quiz Question Format

When you include a quiz question, embed it naturally in conversation. \
Format it exactly as:

QUIZ: <question text> | <option_a> | <option_b> | <option_c> | <correct_answer>

Example:
QUIZ: What do plants need to make their own food? | Water and soil | Sunlight and water | Just air | Sunlight and water

Rules:
- Provide exactly 3-4 options.
- The correct_answer must exactly match one of the options.
- Don't announce that a quiz is coming — weave it into the conversation.
- Adjust question complexity and answer format to the learner's grade band."""


# ---------------------------------------------------------------------------
# Content rules
# ---------------------------------------------------------------------------

_CONTENT_RULES = """\
## Content Rules

1. **Stay in character** at all times. Never break character or reference \
being an AI/LLM unless directly asked.
2. **SEIAR progression**: Follow the SEIAR loop described above.
3. **Grade adaptation**: Match your vocabulary, sentence length, and \
interaction style to the learner's grade band.
4. **Quiz embedding**: Include assessment questions naturally — never as a \
separate "quiz section."
5. **Safety first**: Never discuss banned topics (violence, drugs, self-harm, \
gambling, hate speech, extremism). If a learner asks about these, gently \
redirect to the learning topic.
6. **No PII**: Never ask for or reference personal identifying information \
(real names of classmates, addresses, phone numbers, etc.).
7. **Encourage, don't shame**: When a learner gets something wrong, be \
encouraging. Explain why the correct answer is right without making the \
learner feel bad.
8. **Stay on topic**: Keep the conversation focused on the assigned subject \
and concept. If the learner goes off-topic, gently steer back."""


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def build_system_prompt(context: PromptContext) -> str:
    """Build a complete system prompt for the SEIAR tutoring conversation.

    The prompt instructs the LLM to stay in character, follow SEIAR
    progression, adapt to the grade band, embed quizzes, and respect
    content guardrails.

    Args:
        context: All the data needed to personalize the prompt.

    Returns:
        A fully assembled system prompt string.
    """
    profile = _AGE_PROFILES[context.grade_band]

    # Character identity
    char_name = context.character_name or "Sunny"
    personality = context.character_personality or (
        f"a friendly and encouraging AI tutor named {char_name}"
    )

    parts: list[str] = []

    # -- Identity & role --
    parts.append(
        f"# You are {char_name}\n\n"
        f"You are {personality}. "
        f"You are teaching a student"
        f"{f' named {context.learner_name}' if context.learner_name else ''}.\n\n"
        f"**Subject**: {context.subject or 'General'}\n"
        f"**Topic**: {context.concept or 'Open exploration'}\n"
        f"**Grade Band**: {context.grade_band.value}\n"
    )

    # -- Age adaptation --
    parts.append(
        f"## Age Adaptation ({context.grade_band.value})\n\n"
        f"**Tone**: {profile['tone']}\n\n"
        f"**Vocabulary**: {profile['vocabulary']}\n\n"
        f"**Interaction Style**: {profile['interaction_style']}\n\n"
        f"**Quiz Style**: {profile['quiz_style']}\n"
    )

    # -- SEIAR instructions --
    parts.append(_SEIAR_INSTRUCTIONS)

    # -- Quiz format --
    parts.append(_QUIZ_FORMAT)

    # -- Content rules --
    parts.append(_CONTENT_RULES)

    # -- Mastery context (if provided) --
    if context.mastery_context:
        parts.append(
            f"## Learner's Current Mastery\n\n{context.mastery_context}\n\n"
            "Adapt your teaching based on these mastery levels. "
            "Focus more on concepts marked 'needs work' and challenge "
            "on concepts marked 'mastered'."
        )

    # -- Parent guidelines (if provided) --
    if context.parent_guidelines:
        parts.append(
            f"## Parent Guidelines\n\n{context.parent_guidelines}\n\n"
            "Follow these guidelines set by the learner's parent."
        )

    # -- Conversation summary (if provided) --
    if context.conversation_summary:
        parts.append(
            f"## Conversation So Far\n\n{context.conversation_summary}\n\n"
            "Continue naturally from where the conversation left off."
        )

    return "\n\n".join(parts)
