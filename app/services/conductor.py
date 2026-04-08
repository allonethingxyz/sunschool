"""Conductor agent — per-learner orchestrator for AI tutoring conversations.

Implements the SEIAR loop (Storytelling, Examples, Interaction, Assessment, Refinement)
by routing learner messages through the LLM, managing conversation context, detecting
and scoring quiz questions, and updating the mastery graph.

Primary entry point: ConductorService.process_message()
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.db import get_connection
from app.services.llm import (
    LLMError,
    LLMResponse,
    LLMService,
    Tier,
)
from app.services.prompt_templates import (
    GradeBand,
    PromptContext,
    build_system_prompt,
    grade_to_band,
)

logger = logging.getLogger("sunschool.conductor")

GRAPH_NAME = "sunschool_graph"
CONTEXT_WINDOW_SIZE = 20  # Last N messages to include in context


def _escape_cypher_string(value: str) -> str:
    """Escape a string for safe inclusion in AGE cypher literals."""
    return value.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class ConversationMessage:
    """A single message in a conversation."""

    id: str
    role: str  # "user" or "assistant"
    content: str
    created_at: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversationContext:
    """Assembled context for the LLM call."""

    learner_id: str
    conversation_id: str
    learner_name: str
    grade_level: int
    subject: str
    concept: str
    character_name: str = ""
    character_personality: str = ""
    summary: str = ""
    recent_messages: list[ConversationMessage] = field(default_factory=list)
    mastery_context: str = ""
    parent_guidelines: str = ""


@dataclass
class ConductorResponse:
    """Response from the conductor after processing a message."""

    message_id: str
    content: str
    role: str = "assistant"
    quiz_detected: bool = False
    quiz_data: dict[str, Any] | None = None
    mastery_updates: list[dict[str, Any]] = field(default_factory=list)
    model: str = ""
    tokens_used: int = 0
    cost_estimate: float = 0.0


@dataclass
class AnswerResult:
    """Result of scoring a quiz answer."""

    is_correct: bool
    score: float  # 0.0 to 1.0
    feedback: str
    points_awarded: int
    concepts_demonstrated: list[str] = field(default_factory=list)
    mastery_updates: list[dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Conductor service
# ---------------------------------------------------------------------------


class ConductorService:
    """Per-learner orchestrator that manages the tutoring conversation loop.

    Responsibilities:
    - Process learner messages through the SEIAR loop
    - Call OpenRouter via LLMService
    - Check/update mastery graph in AGE
    - Detect and score quiz questions
    - Manage conversation context window (last 20 msgs + summary)
    - Log all LLM calls to prompt_audit
    """

    def __init__(self, llm: LLMService | None = None):
        self.llm = llm or LLMService()

    async def process_message(
        self,
        learner_id: str,
        conversation_id: str,
        user_message: str,
        tier: Tier = Tier.FREE,
    ) -> ConductorResponse:
        """Process a learner message and return the AI tutor response.

        This is the main entry point for the SEIAR conversation loop.

        Steps:
        1. Load conversation context (learner profile, recent messages, mastery)
        2. Build system prompt with SEIAR instructions
        3. Call LLM via OpenRouter
        4. Detect quiz questions in response
        5. Store messages in conversation
        6. Log to prompt_audit
        7. Return structured response

        Args:
            learner_id: The learner's node ID in the graph.
            conversation_id: The conversation node ID.
            user_message: The learner's message text.
            tier: FREE or PAID tier for model selection.

        Returns:
            ConductorResponse with AI message and metadata.
        """
        # 1. Load context
        context = await self._load_context(learner_id, conversation_id)

        # 2. Store user message
        user_msg_id = str(uuid.uuid4())
        await self._store_message(
            conversation_id, user_msg_id, "user", user_message
        )

        # 3. Build prompts
        system_prompt = self._build_system_prompt(context)
        user_prompt = self._build_user_prompt(context, user_message)

        # 4. Call LLM
        try:
            llm_response = await self.llm.chat(
                system_message=system_prompt,
                user_message=user_prompt,
                tier=tier,
                temperature=0.7,
                max_tokens=2048,
            )
        except LLMError:
            logger.exception(
                "LLM call failed for learner=%s conversation=%s",
                learner_id,
                conversation_id,
            )
            raise

        # 5. Detect quiz in response
        quiz_detected, quiz_data = self._detect_quiz(llm_response.content)

        # 5b. Strip raw quiz markup from display content so it doesn't
        #     show as plain text — the frontend renders quiz buttons instead.
        display_content = llm_response.content
        if quiz_detected and quiz_data:
            # Strip QUIZ: pipe-delimited lines (replace with single newline)
            display_content = re.sub(
                r"\n?QUIZ:\s*.+?(?:\n|$)", "\n", display_content, flags=re.IGNORECASE
            )
            # Strip ```quiz JSON blocks
            display_content = re.sub(
                r"\n?```quiz\s*\n?.*?\n?```\n?", "\n", display_content, flags=re.DOTALL
            )
            display_content = display_content.strip()

        # 6. Store assistant message
        assistant_msg_id = str(uuid.uuid4())
        msg_metadata: dict[str, Any] = {}
        if quiz_detected and quiz_data:
            msg_metadata["quiz"] = quiz_data

        await self._store_message(
            conversation_id,
            assistant_msg_id,
            "assistant",
            display_content,
            metadata=msg_metadata,
        )

        # 7. Log to prompt_audit
        await self._log_prompt_audit(
            learner_id=learner_id,
            conversation_id=conversation_id,
            prompt_type="conversation",
            system_message=system_prompt,
            user_message=user_prompt,
            llm_response=llm_response,
        )

        # 8. Update conversation summary if context is getting long
        if len(context.recent_messages) >= CONTEXT_WINDOW_SIZE:
            await self._update_summary(conversation_id, context)

        # 9. Check mastery updates from conversation
        mastery_updates = await self._check_mastery_signals(
            learner_id, context, llm_response.content
        )

        return ConductorResponse(
            message_id=assistant_msg_id,
            content=display_content,
            role="assistant",
            quiz_detected=quiz_detected,
            quiz_data=quiz_data,
            mastery_updates=mastery_updates,
            model=llm_response.model,
            tokens_used=llm_response.tokens_used,
            cost_estimate=llm_response.cost_estimate,
        )

    async def score_answer(
        self,
        learner_id: str,
        conversation_id: str,
        question: str,
        expected_answer: str,
        student_answer: str,
        concepts: list[str] | None = None,
        tier: Tier = Tier.FREE,
    ) -> AnswerResult:
        """Score a student's answer to a quiz question.

        Args:
            learner_id: The learner's node ID.
            conversation_id: The conversation node ID.
            question: The quiz question text.
            expected_answer: The expected correct answer.
            student_answer: The student's submitted answer.
            concepts: List of concept names this question covers.
            tier: FREE or PAID tier for model selection.

        Returns:
            AnswerResult with score, feedback, and mastery updates.
        """
        context = await self._load_context(learner_id, conversation_id)

        system_prompt = (
            "You are an educational assessment expert scoring student answers.\n\n"
            f"## Grade Band: {grade_to_band(context.grade_level).value}\n\n"
            "## Scoring Guidelines\n"
            "- Score on a 0.0 to 1.0 scale (0 = completely wrong, 1 = perfect)\n"
            "- Give partial credit for partially correct answers\n"
            "- Consider the grade level when evaluating\n"
            "- Focus on understanding over exact wording\n\n"
            "## Output Format\n"
            "Respond with a JSON object containing:\n"
            '- score: Float 0.0-1.0\n'
            '- feedback: Encouraging, specific feedback for the student\n'
            '- concepts_demonstrated: List of concepts the student showed understanding of\n'
            '- points_awarded: Integer points (score * 10, rounded)\n'
            '- is_correct: Boolean — true if score >= 0.7\n'
        )

        user_prompt = (
            f"**Question**: {question}\n"
            f"**Expected answer**: {expected_answer}\n"
            f"**Student's answer**: {student_answer}\n\n"
            f"Score this {grade_to_band(context.grade_level).value} grade student's answer."
        )

        try:
            llm_response = await self.llm.chat(
                system_message=system_prompt,
                user_message=user_prompt,
                tier=tier,
                temperature=0.3,
                max_tokens=1024,
                response_format={"type": "json_object"},
            )
        except LLMError:
            logger.exception(
                "Answer scoring LLM call failed for learner=%s", learner_id
            )
            raise

        # Log to prompt_audit
        await self._log_prompt_audit(
            learner_id=learner_id,
            conversation_id=conversation_id,
            prompt_type="answer_scoring",
            system_message=system_prompt,
            user_message=user_prompt,
            llm_response=llm_response,
        )

        # Parse scoring response
        try:
            score_data = json.loads(llm_response.content)
        except json.JSONDecodeError:
            logger.error("Failed to parse scoring response: %s", llm_response.content)
            score_data = {
                "score": 0.0,
                "feedback": "Sorry, I had trouble scoring your answer. Let's try again!",
                "concepts_demonstrated": [],
                "points_awarded": 0,
                "is_correct": False,
            }

        score = float(score_data.get("score", 0.0))
        is_correct = score_data.get("is_correct", score >= 0.7)
        points_awarded = int(score_data.get("points_awarded", round(score * 10)))
        concepts_demonstrated = score_data.get("concepts_demonstrated", [])

        # Update mastery for demonstrated concepts
        mastery_updates = []
        effective_concepts = concepts or concepts_demonstrated
        for concept_name in effective_concepts:
            update = await self._update_mastery(
                learner_id, concept_name, score, is_correct
            )
            if update:
                mastery_updates.append(update)

        # Award points
        if points_awarded > 0:
            await self._award_points(learner_id, points_awarded)

        return AnswerResult(
            is_correct=is_correct,
            score=score,
            feedback=score_data.get("feedback", ""),
            points_awarded=points_awarded,
            concepts_demonstrated=concepts_demonstrated,
            mastery_updates=mastery_updates,
        )

    # ------------------------------------------------------------------
    # Context loading
    # ------------------------------------------------------------------

    async def _load_context(
        self, learner_id: str, conversation_id: str
    ) -> ConversationContext:
        """Load full conversation context from the graph and relational data."""
        async with get_connection() as conn:
            with conn.cursor() as cur:
                # Load learner profile from AGE graph
                learner = self._query_learner(cur, learner_id)

                # Load conversation metadata
                conversation = self._query_conversation(cur, conversation_id)

                # Load recent messages (last CONTEXT_WINDOW_SIZE)
                recent_messages = self._query_recent_messages(
                    cur, conversation_id, CONTEXT_WINDOW_SIZE
                )

                # Load mastery context for relevant concepts
                mastery_context = self._query_mastery_context(
                    cur, learner_id, conversation.get("subject", "")
                )

                # Load parent guidelines
                parent_guidelines = self._query_parent_guidelines(cur, learner_id)

        return ConversationContext(
            learner_id=learner_id,
            conversation_id=conversation_id,
            learner_name=learner.get("name", ""),
            grade_level=learner.get("grade_level", 5),
            subject=conversation.get("subject", ""),
            concept=conversation.get("current_concept", "general"),
            character_name=conversation.get("character_name", ""),
            character_personality=conversation.get("character_personality", ""),
            summary=conversation.get("summary", ""),
            recent_messages=recent_messages,
            mastery_context=mastery_context,
            parent_guidelines=parent_guidelines,
        )

    def _query_learner(self, cur: Any, learner_id: str) -> dict[str, Any]:
        """Query learner profile from AGE graph."""
        try:
            esc_id = _escape_cypher_string(learner_id)
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (l:Learner {{id: '{esc_id}'}})
                    RETURN l
                $$) AS (learner agtype);
                """
            )
            row = cur.fetchone()
            if row:
                data = _parse_agtype(row[0])
                return data if isinstance(data, dict) else {}
        except Exception:
            logger.exception("Failed to query learner %s", learner_id)
        return {"name": "", "grade_level": 5}

    def _query_conversation(self, cur: Any, conversation_id: str) -> dict[str, Any]:
        """Query conversation metadata from AGE graph."""
        try:
            esc_id = _escape_cypher_string(conversation_id)
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (c:Conversation {{id: '{esc_id}'}})
                    RETURN c
                $$) AS (conversation agtype);
                """
            )
            row = cur.fetchone()
            if row:
                data = _parse_agtype(row[0])
                return data if isinstance(data, dict) else {}
        except Exception:
            logger.exception("Failed to query conversation %s", conversation_id)
        return {}

    def _query_recent_messages(
        self, cur: Any, conversation_id: str, limit: int
    ) -> list[ConversationMessage]:
        """Query recent messages for the conversation from relational storage."""
        messages = []
        try:
            cur.execute(
                """
                SELECT id, role, content, created_at, metadata
                FROM conversation_messages
                WHERE conversation_id = %s
                ORDER BY created_at DESC
                LIMIT %s;
                """,
                (conversation_id, limit),
            )
            rows = cur.fetchall()
            for row in reversed(rows):  # Reverse to get chronological order
                meta = row[4] if row[4] else {}
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except json.JSONDecodeError:
                        meta = {}
                messages.append(
                    ConversationMessage(
                        id=str(row[0]),
                        role=row[1],
                        content=row[2],
                        created_at=str(row[3]),
                        metadata=meta,
                    )
                )
        except Exception:
            logger.exception(
                "Failed to query messages for conversation %s", conversation_id
            )
        return messages

    def _query_mastery_context(
        self, cur: Any, learner_id: str, subject: str
    ) -> str:
        """Query mastery levels for relevant concepts and format as context string."""
        mastery_items = []
        try:
            esc_id = _escape_cypher_string(learner_id)
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (l:Learner {{id: '{esc_id}'}})-[m:MASTERY]->(c:Concept)
                    RETURN c.name AS concept, m.confidence AS confidence, m.level AS level
                $$) AS (concept agtype, confidence agtype, level agtype);
                """
            )
            rows = cur.fetchall()
            for row in rows:
                concept_name = _parse_agtype(row[0])
                confidence = _parse_agtype(row[1])
                level = _parse_agtype(row[2])
                if confidence is None:
                    confidence = 0.0
                label = _mastery_label(float(confidence))
                mastery_items.append(f"- {concept_name}: {label} ({confidence:.1%})")
        except Exception:
            logger.exception("Failed to query mastery context for learner %s", learner_id)

        if not mastery_items:
            return ""
        return "Current mastery levels:\n" + "\n".join(mastery_items)

    def _query_parent_guidelines(self, cur: Any, learner_id: str) -> str:
        """Query parent-set guidelines for this learner."""
        try:
            esc_id = _escape_cypher_string(learner_id)
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (l:Learner {{id: '{esc_id}'}})
                    RETURN l.parent_guidelines AS guidelines
                $$) AS (guidelines agtype);
                """
            )
            row = cur.fetchone()
            if row:
                guidelines = _parse_agtype(row[0])
                if guidelines:
                    return str(guidelines)
        except Exception:
            logger.exception(
                "Failed to query parent guidelines for learner %s", learner_id
            )
        return ""

    # ------------------------------------------------------------------
    # Prompt building
    # ------------------------------------------------------------------

    def _build_system_prompt(self, context: ConversationContext) -> str:
        """Build the full system prompt for the SEIAR conversation loop."""
        grade_band = grade_to_band(context.grade_level)

        prompt_ctx = PromptContext(
            grade_band=grade_band,
            concept=context.concept,
            character_name=context.character_name,
            character_personality=context.character_personality,
            conversation_summary=context.summary,
            subject=context.subject,
            learner_name=context.learner_name,
            mastery_context=context.mastery_context,
            parent_guidelines=context.parent_guidelines,
        )

        base_prompt = build_system_prompt(prompt_ctx)

        # Add SEIAR phase emphasis based on message count
        msg_count = len(context.recent_messages)
        phase_instruction = self._get_seiar_phase_instruction(msg_count)
        if phase_instruction:
            base_prompt += f"\n\n{phase_instruction}"

        return base_prompt

    @staticmethod
    def _get_seiar_phase_instruction(msg_count: int) -> str:
        """Return an instruction emphasizing the current SEIAR phase.

        Phase mapping based on message count in the conversation:
        - Messages 1-2:  S (Storytelling) — introduce topic through narrative
        - Messages 3-4:  E (Examples) — concrete examples
        - Messages 5-6:  I (Interaction) — let kid explore
        - Messages 7-8:  A (Assessment) — quiz time
        - Messages 9+:   R (Refinement) — correct and deepen
        """
        if msg_count <= 2:
            phase = "S (Storytelling)"
            guidance = (
                "You are in the STORYTELLING phase. Introduce the topic through an "
                "engaging narrative, story, or real-world scenario. Hook the learner's "
                "attention and set the context. Do NOT quiz yet."
            )
        elif msg_count <= 4:
            phase = "E (Examples)"
            guidance = (
                "You are in the EXAMPLES phase. Provide concrete examples, visual "
                "descriptions, and analogies. Build on the story to show how the "
                "concept works in practice. Do NOT quiz yet."
            )
        elif msg_count <= 6:
            phase = "I (Interaction)"
            guidance = (
                "You are in the INTERACTION phase. Invite the learner to respond, "
                "ask questions, explore, and think. Create a genuine dialogue — "
                "pause and give space to engage. Do NOT quiz yet."
            )
        elif msg_count <= 8:
            phase = "A (Assessment)"
            guidance = (
                "You are in the ASSESSMENT phase. Now is the time to ask a quiz "
                "question! Weave it naturally into the conversation. You MUST include "
                "a quiz question in your response using the QUIZ: format described above."
            )
        else:
            phase = "R (Refinement)"
            guidance = (
                "You are in the REFINEMENT phase. Correct any misconceptions gently. "
                "Revisit ideas the learner struggled with. Deepen understanding by "
                "connecting to what they already know. You may include additional "
                "quiz questions using the QUIZ: format if appropriate."
            )

        return (
            f"## Current SEIAR Phase: {phase}\n\n"
            f"{guidance}"
        )

    def _build_user_prompt(
        self, context: ConversationContext, user_message: str
    ) -> str:
        """Build the user prompt including conversation history."""
        parts = []

        # Include recent message history for context
        if context.recent_messages:
            parts.append("## Recent conversation:")
            for msg in context.recent_messages[-10:]:  # Last 10 for the prompt
                role_label = "Student" if msg.role == "user" else "Tutor"
                parts.append(f"{role_label}: {msg.content}")
            parts.append("")

        parts.append(f"Student: {user_message}")
        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Quiz detection
    # ------------------------------------------------------------------

    def _detect_quiz(self, content: str) -> tuple[bool, dict[str, Any] | None]:
        """Detect quiz questions in LLM response content.

        Supports multiple quiz formats:
        1. QUIZ: question | option_a | option_b | option_c | correct_answer
        2. ```quiz { JSON } ``` blocks
        3. Heuristic detection for numbered/lettered question patterns
        """
        # 1. Check for QUIZ: pipe-delimited format (preferred — from prompt_templates)
        quiz_line_pattern = re.compile(
            r"QUIZ:\s*(.+?)(?:\n|$)", re.IGNORECASE
        )
        match = quiz_line_pattern.search(content)
        if match:
            parts = [p.strip() for p in match.group(1).split("|")]
            if len(parts) >= 4:
                question = parts[0]
                options = parts[1:-1]
                correct_answer = parts[-1]
                quiz_data = {
                    "question": question,
                    "options": options,
                    "correct_answer": correct_answer,
                    "expected_answer": correct_answer,
                    "concepts": [],
                }
                return True, quiz_data

        # 2. Check for explicit ```quiz JSON blocks (legacy support)
        quiz_block_pattern = re.compile(r"```quiz\s*\n?(.*?)\n?```", re.DOTALL)
        match = quiz_block_pattern.search(content)
        if match:
            try:
                quiz_data = json.loads(match.group(1).strip())
                # Normalize: ensure correct_answer and expected_answer exist
                if "options" in quiz_data and "correct_index" in quiz_data:
                    idx = quiz_data["correct_index"]
                    if 0 <= idx < len(quiz_data["options"]):
                        quiz_data.setdefault(
                            "correct_answer", quiz_data["options"][idx]
                        )
                        quiz_data.setdefault(
                            "expected_answer", quiz_data["options"][idx]
                        )
                return True, quiz_data
            except json.JSONDecodeError:
                logger.warning("Found quiz block but failed to parse JSON")

        # 3. Heuristic detection: question + numbered/lettered options
        question_pattern = re.compile(
            r"(?:^|\n)\s*(?:\*\*)?(?:Question|Q)\s*(?:\d+)?[:.]\s*(?:\*\*)?\s*(.+?)(?:\n)"
            r"(?:\s*[A-Da-d1-4][.)]\s*.+\n?){2,4}",
            re.MULTILINE,
        )
        if question_pattern.search(content):
            return True, {"detected_by": "heuristic", "raw_content": content}

        return False, None

    # ------------------------------------------------------------------
    # Message storage
    # ------------------------------------------------------------------

    async def _store_message(
        self,
        conversation_id: str,
        message_id: str,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Store a message in the conversation_messages table."""
        async with get_connection() as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        """
                        INSERT INTO conversation_messages
                            (id, conversation_id, role, content, metadata, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s);
                        """,
                        (
                            message_id,
                            conversation_id,
                            role,
                            content,
                            json.dumps(metadata) if metadata else None,
                            datetime.now(timezone.utc),
                        ),
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()
                    logger.exception(
                        "Failed to store message %s in conversation %s",
                        message_id,
                        conversation_id,
                    )
                    raise

    # ------------------------------------------------------------------
    # Prompt audit logging
    # ------------------------------------------------------------------

    async def _log_prompt_audit(
        self,
        learner_id: str,
        conversation_id: str,
        prompt_type: str,
        system_message: str,
        user_message: str,
        llm_response: LLMResponse,
    ) -> None:
        """Log an LLM call to the prompt_audit table."""
        async with get_connection() as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        """
                        INSERT INTO prompt_audit
                            (id, learner_id, conversation_id, prompt_type,
                             system_message, user_message, model,
                             response_preview, tokens_used, cost_estimate)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                        """,
                        (
                            str(uuid.uuid4()),
                            learner_id,
                            conversation_id,
                            prompt_type,
                            system_message,
                            user_message,
                            llm_response.model,
                            llm_response.content[:500],
                            llm_response.tokens_used,
                            llm_response.cost_estimate,
                        ),
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()
                    logger.exception("Failed to log prompt audit")

    # ------------------------------------------------------------------
    # Mastery graph operations
    # ------------------------------------------------------------------

    async def _check_mastery_signals(
        self,
        learner_id: str,
        context: ConversationContext,
        response_content: str,
    ) -> list[dict[str, Any]]:
        """Check for mastery signals in the conversation and update graph.

        This runs after each AI response to detect implicit mastery signals
        from the conversation flow (not just explicit quiz answers).
        """
        # For now, mastery updates happen primarily through score_answer.
        # This method can be extended later for implicit signal detection.
        return []

    async def _update_mastery(
        self,
        learner_id: str,
        concept_name: str,
        score: float,
        is_correct: bool,
    ) -> dict[str, Any] | None:
        """Update mastery edge between learner and concept using Bayesian confidence.

        Mastery thresholds:
        - 0.0-0.3: needs work
        - 0.3-0.7: learning
        - 0.7-1.0: mastered

        Uses a simple Bayesian update:
        new_confidence = old_confidence + learning_rate * (score - old_confidence)
        """
        learning_rate = 0.2

        async with get_connection() as conn:
            with conn.cursor() as cur:
                try:
                    # Ensure concept node exists
                    esc_concept = _escape_cypher_string(concept_name)
                    esc_lid = _escape_cypher_string(learner_id)
                    cur.execute(
                        f"""
                        SELECT * FROM cypher('{GRAPH_NAME}', $$
                            MERGE (c:Concept {{name: '{esc_concept}'}})
                            RETURN c
                        $$) AS (concept agtype);
                        """
                    )

                    # Check existing mastery edge
                    cur.execute(
                        f"""
                        SELECT * FROM cypher('{GRAPH_NAME}', $$
                            MATCH (l:Learner {{id: '{esc_lid}'}})-[m:MASTERY]->(c:Concept {{name: '{esc_concept}'}})
                            RETURN m.confidence AS confidence, m.attempts AS attempts
                        $$) AS (confidence agtype, attempts agtype);
                        """
                    )
                    row = cur.fetchone()

                    if row:
                        old_confidence = float(_parse_agtype(row[0]) or 0.0)
                        old_attempts = int(_parse_agtype(row[1]) or 0)
                    else:
                        old_confidence = 0.0
                        old_attempts = 0

                    # Bayesian update
                    new_confidence = old_confidence + learning_rate * (
                        score - old_confidence
                    )
                    new_confidence = max(0.0, min(1.0, new_confidence))
                    new_attempts = old_attempts + 1
                    new_level = _mastery_label(new_confidence)

                    esc_ts = _escape_cypher_string(datetime.now(timezone.utc).isoformat())
                    esc_level = _escape_cypher_string(new_level)

                    if row:
                        # Update existing edge
                        cur.execute(
                            f"""
                            SELECT * FROM cypher('{GRAPH_NAME}', $$
                                MATCH (l:Learner {{id: '{esc_lid}'}})-[m:MASTERY]->(c:Concept {{name: '{esc_concept}'}})
                                SET m.confidence = {new_confidence}, m.attempts = {new_attempts},
                                    m.level = '{esc_level}', m.last_updated = '{esc_ts}'
                                RETURN m
                            $$) AS (mastery agtype);
                            """
                        )
                    else:
                        # Create new mastery edge
                        cur.execute(
                            f"""
                            SELECT * FROM cypher('{GRAPH_NAME}', $$
                                MATCH (l:Learner {{id: '{esc_lid}'}}), (c:Concept {{name: '{esc_concept}'}})
                                CREATE (l)-[m:MASTERY {{
                                    confidence: {new_confidence}, attempts: {new_attempts},
                                    level: '{esc_level}', last_updated: '{esc_ts}'
                                }}]->(c)
                                RETURN m
                            $$) AS (mastery agtype);
                            """
                        )

                    conn.commit()

                    update = {
                        "concept": concept_name,
                        "old_confidence": old_confidence,
                        "new_confidence": new_confidence,
                        "level": new_level,
                        "attempts": new_attempts,
                    }
                    logger.info(
                        "Mastery update: learner=%s concept=%s %.1f%% -> %.1f%% (%s)",
                        learner_id,
                        concept_name,
                        old_confidence * 100,
                        new_confidence * 100,
                        new_level,
                    )
                    return update

                except Exception:
                    conn.rollback()
                    logger.exception(
                        "Failed to update mastery for learner=%s concept=%s",
                        learner_id,
                        concept_name,
                    )
                    return None

    async def _award_points(self, learner_id: str, points: int) -> None:
        """Award points to a learner by updating their point balance in the graph."""
        async with get_connection() as conn:
            with conn.cursor() as cur:
                try:
                    # Get current points
                    esc_lid = _escape_cypher_string(learner_id)
                    cur.execute(
                        f"""
                        SELECT * FROM cypher('{GRAPH_NAME}', $$
                            MATCH (l:Learner {{id: '{esc_lid}'}})
                            RETURN l.points AS points
                        $$) AS (points agtype);
                        """
                    )
                    row = cur.fetchone()
                    current_points = int(_parse_agtype(row[0]) or 0) if row else 0

                    new_points = current_points + points
                    cur.execute(
                        f"""
                        SELECT * FROM cypher('{GRAPH_NAME}', $$
                            MATCH (l:Learner {{id: '{esc_lid}'}})
                            SET l.points = {new_points}
                            RETURN l
                        $$) AS (learner agtype);
                        """
                    )
                    conn.commit()
                    logger.info(
                        "Awarded %d points to learner %s (total: %d)",
                        points,
                        learner_id,
                        new_points,
                    )
                except Exception:
                    conn.rollback()
                    logger.exception(
                        "Failed to award points to learner %s", learner_id
                    )

    # ------------------------------------------------------------------
    # Conversation summary management
    # ------------------------------------------------------------------

    async def _update_summary(
        self,
        conversation_id: str,
        context: ConversationContext,
    ) -> None:
        """Update the conversation summary when the context window is full.

        Calls the LLM to summarize older messages, then stores the summary
        on the Conversation node in the graph.
        """
        # Build a summary of the older messages that will fall out of the window
        old_messages = context.recent_messages[: -CONTEXT_WINDOW_SIZE // 2]
        if not old_messages:
            return

        messages_text = "\n".join(
            f"{m.role}: {m.content}" for m in old_messages
        )

        existing_summary = context.summary or "No previous summary."

        system_prompt = (
            "You are a conversation summarizer for an educational tutoring app. "
            "Create a concise summary that captures:\n"
            "- Topics discussed\n"
            "- Key concepts covered\n"
            "- Student's understanding level\n"
            "- Any questions or misconceptions\n"
            "- Progress toward learning goals\n\n"
            "Keep the summary under 200 words."
        )

        user_prompt = (
            f"Previous summary:\n{existing_summary}\n\n"
            f"New messages to incorporate:\n{messages_text}\n\n"
            "Create an updated summary."
        )

        try:
            llm_response = await self.llm.chat(
                system_message=system_prompt,
                user_message=user_prompt,
                tier=Tier.FREE,
                temperature=0.3,
                max_tokens=512,
            )

            new_summary = llm_response.content

            # Store summary on conversation node
            async with get_connection() as conn:
                with conn.cursor() as cur:
                    esc_cid = _escape_cypher_string(conversation_id)
                    esc_summary = _escape_cypher_string(new_summary)
                    cur.execute(
                        f"""
                        SELECT * FROM cypher('{GRAPH_NAME}', $$
                            MATCH (c:Conversation {{id: '{esc_cid}'}})
                            SET c.summary = '{esc_summary}'
                            RETURN c
                        $$) AS (conversation agtype);
                        """
                    )
                    conn.commit()

            # Log the summarization call
            await self._log_prompt_audit(
                learner_id=context.learner_id,
                conversation_id=conversation_id,
                prompt_type="summarization",
                system_message=system_prompt,
                user_message=user_prompt,
                llm_response=llm_response,
            )

            logger.info(
                "Updated conversation summary for %s (%d chars)",
                conversation_id,
                len(new_summary),
            )
        except LLMError:
            logger.exception(
                "Failed to update summary for conversation %s", conversation_id
            )

    async def close(self) -> None:
        """Close the underlying LLM client."""
        await self.llm.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_agtype(value: Any) -> Any:
    """Parse an AGE agtype value to a Python type.

    AGE returns agtype values that may be wrapped in quotes or have
    special formatting. This normalizes them.
    """
    if value is None:
        return None
    s = str(value).strip()
    # Remove surrounding quotes
    if s.startswith('"') and s.endswith('"'):
        s = s[1:-1]
    # Try to parse as JSON (handles nested objects, arrays, numbers)
    try:
        return json.loads(s)
    except (json.JSONDecodeError, ValueError):
        pass
    # Try numeric
    try:
        if "." in s:
            return float(s)
        return int(s)
    except ValueError:
        pass
    return s


def _mastery_label(confidence: float) -> str:
    """Convert a mastery confidence score to a human-readable label.

    Thresholds:
    - 0.0-0.3: needs work
    - 0.3-0.7: learning
    - 0.7-1.0: mastered
    """
    if confidence >= 0.7:
        return "mastered"
    elif confidence >= 0.3:
        return "learning"
    else:
        return "needs_work"


# ---------------------------------------------------------------------------
# Convenience functions (exported for other services)
# ---------------------------------------------------------------------------


def get_mastery_context(cur: Any, learner_id: str, subject: str = "") -> str:
    """Get mastery context string for a learner (synchronous, for use in other services).

    Args:
        cur: Database cursor with AGE initialized.
        learner_id: The learner's node ID.
        subject: Optional subject filter.

    Returns:
        Formatted mastery context string.
    """
    mastery_items = []
    try:
        esc_id = _escape_cypher_string(learner_id)
        cur.execute(
            f"""
            SELECT * FROM cypher('{GRAPH_NAME}', $$
                MATCH (l:Learner {{id: '{esc_id}'}})-[m:MASTERY]->(c:Concept)
                RETURN c.name AS concept, m.confidence AS confidence, m.level AS level
            $$) AS (concept agtype, confidence agtype, level agtype);
            """
        )
        rows = cur.fetchall()
        for row in rows:
            concept_name = _parse_agtype(row[0])
            confidence = _parse_agtype(row[1])
            if confidence is None:
                confidence = 0.0
            label = _mastery_label(float(confidence))
            mastery_items.append(f"- {concept_name}: {label} ({float(confidence):.1%})")
    except Exception:
        logger.exception("Failed to get mastery context for learner %s", learner_id)

    if not mastery_items:
        return ""
    return "Current mastery levels:\n" + "\n".join(mastery_items)


def update_mastery_sync(
    cur: Any,
    learner_id: str,
    concept_name: str,
    score: float,
    is_correct: bool,
    learning_rate: float = 0.2,
) -> dict[str, Any] | None:
    """Update mastery edge synchronously (for use in other services).

    Args:
        cur: Database cursor with AGE initialized.
        learner_id: The learner's node ID.
        concept_name: Name of the concept.
        score: Score from 0.0 to 1.0.
        is_correct: Whether the answer was correct.
        learning_rate: Bayesian update learning rate.

    Returns:
        Dict with update details, or None on failure.
    """
    try:
        # Ensure concept exists
        esc_concept = _escape_cypher_string(concept_name)
        esc_lid = _escape_cypher_string(learner_id)
        cur.execute(
            f"""
            SELECT * FROM cypher('{GRAPH_NAME}', $$
                MERGE (c:Concept {{name: '{esc_concept}'}})
                RETURN c
            $$) AS (concept agtype);
            """
        )

        # Check existing mastery
        cur.execute(
            f"""
            SELECT * FROM cypher('{GRAPH_NAME}', $$
                MATCH (l:Learner {{id: '{esc_lid}'}})-[m:MASTERY]->(c:Concept {{name: '{esc_concept}'}})
                RETURN m.confidence AS confidence, m.attempts AS attempts
            $$) AS (confidence agtype, attempts agtype);
            """
        )
        row = cur.fetchone()

        if row:
            old_confidence = float(_parse_agtype(row[0]) or 0.0)
            old_attempts = int(_parse_agtype(row[1]) or 0)
        else:
            old_confidence = 0.0
            old_attempts = 0

        new_confidence = old_confidence + learning_rate * (score - old_confidence)
        new_confidence = max(0.0, min(1.0, new_confidence))
        new_attempts = old_attempts + 1
        new_level = _mastery_label(new_confidence)

        esc_ts = _escape_cypher_string(datetime.now(timezone.utc).isoformat())
        esc_level = _escape_cypher_string(new_level)

        if row:
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (l:Learner {{id: '{esc_lid}'}})-[m:MASTERY]->(c:Concept {{name: '{esc_concept}'}})
                    SET m.confidence = {new_confidence}, m.attempts = {new_attempts},
                        m.level = '{esc_level}', m.last_updated = '{esc_ts}'
                    RETURN m
                $$) AS (mastery agtype);
                """
            )
        else:
            cur.execute(
                f"""
                SELECT * FROM cypher('{GRAPH_NAME}', $$
                    MATCH (l:Learner {{id: '{esc_lid}'}}), (c:Concept {{name: '{esc_concept}'}})
                    CREATE (l)-[m:MASTERY {{
                        confidence: {new_confidence}, attempts: {new_attempts},
                        level: '{esc_level}', last_updated: '{esc_ts}'
                    }}]->(c)
                    RETURN m
                $$) AS (mastery agtype);
                """
            )

        return {
            "concept": concept_name,
            "old_confidence": old_confidence,
            "new_confidence": new_confidence,
            "level": new_level,
            "attempts": new_attempts,
        }
    except Exception:
        logger.exception(
            "Failed to update mastery (sync) for learner=%s concept=%s",
            learner_id,
            concept_name,
        )
        return None
