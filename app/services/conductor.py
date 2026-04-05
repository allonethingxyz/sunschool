"""Conductor agent — per-learner orchestrator for the SEIAR tutoring loop.

The conductor is the core intelligence of Sunschool. It processes every
learner message through a pipeline that:

1. Loads learner context (mastery state, parent guidelines, conversation history)
2. Checks parent gates (topic blocks, time limits, approval requirements)
3. Determines SEIAR phase (Storytelling → Examples → Interaction → Assessment → Refinement)
4. Builds a context-managed LLM prompt
5. Generates a response via OpenRouter
6. Parses the response for concepts, quiz questions, and topic transitions
7. Updates the mastery graph
8. Logs to prompt audit
9. Returns the formatted response

NetworkX is used for fast in-memory graph traversal during a session.
AGE is the persistent graph store, synced on session start/end.
"""

import json
import logging
import re
import uuid
from datetime import datetime
from typing import Any

import networkx as nx

from app.config import settings
from app.db import execute_cypher, get_connection
from app.models.audit import PromptAuditCreate
from app.models.graph import (
    ConversationState,
    ConversationStatus,
    Gate,
    GateStatus,
    GateType,
    MasteryEdge,
    Message,
    PendingQuiz,
    QuizType,
    SEIARPhase,
    SendMessageResponse,
)
from app.services.llm import LLMResponse, call_llm, generate_summary, score_answer
from app.services.prompt_templates import (
    build_quiz_detection_prompt,
    build_system_prompt,
    get_grade_config,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Session cache: active conductor sessions keyed by conversation_id
# ---------------------------------------------------------------------------
_sessions: dict[str, "ConductorSession"] = {}


class ConductorSession:
    """An active tutoring session for one learner in one conversation.

    Holds the in-memory NetworkX graph, conversation state, and message
    history. Synced to AGE on start and end.
    """

    def __init__(
        self,
        conversation_id: str,
        learner_id: str,
        grade_level: int,
    ):
        self.conversation_id = conversation_id
        self.learner_id = learner_id
        self.grade_level = grade_level

        # In-memory graph (NetworkX) for fast mastery lookups
        self.graph = nx.DiGraph()

        # Conversation state
        self.state = ConversationState(
            conversation_id=conversation_id,
            learner_id=learner_id,
        )

        # Message history (full transcript for persistence, windowed for LLM)
        self.messages: list[Message] = []

        # Parent gates loaded from AGE
        self.gates: list[Gate] = []

        # Parent guidelines (free text)
        self.parent_guidelines: str = ""

        # Mastery edges for this learner
        self.mastery: dict[str, MasteryEdge] = {}

    # -------------------------------------------------------------------
    # Session lifecycle
    # -------------------------------------------------------------------

    async def start(self) -> None:
        """Load learner context from AGE into memory.

        Called when a conversation starts or resumes.
        """
        logger.info(
            "Starting conductor session: conversation=%s, learner=%s",
            self.conversation_id,
            self.learner_id,
        )

        # Load mastery neighborhood from AGE into NetworkX
        self._load_mastery_graph()

        # Load parent gates
        self._load_gates()

        # Load parent guidelines
        self._load_parent_guidelines()

        # Load existing conversation state and messages (if resuming)
        self._load_conversation_state()

        logger.info(
            "Session loaded: %d mastery edges, %d gates, %d messages",
            len(self.mastery),
            len(self.gates),
            len(self.messages),
        )

    async def end(self) -> None:
        """Write session state back to AGE and clean up.

        Called when a conversation ends or goes idle.
        """
        logger.info("Ending conductor session: %s", self.conversation_id)

        # Sync mastery changes back to AGE
        self._sync_mastery_to_age()

        # Save conversation state
        self._save_conversation_state()

        # Remove from session cache
        _sessions.pop(self.conversation_id, None)

    # -------------------------------------------------------------------
    # Message processing pipeline (core loop)
    # -------------------------------------------------------------------

    async def process_message(self, learner_message: str) -> SendMessageResponse:
        """Process a learner message through the full conductor pipeline.

        This is the main entry point called on every POST /conversations/{id}/message.

        Returns:
            SendMessageResponse with the tutor's response and metadata.
        """
        # Step 1: Check parent gates
        gate_block = self._check_gates(learner_message)
        if gate_block:
            return SendMessageResponse(
                response=gate_block,
                seiar_phase=self.state.seiar_phase.value,
                points_earned=0,
                quiz_pending=False,
                concepts_discussed=[],
            )

        # Step 2: Check if learner is answering a pending quiz
        if self.state.pending_quiz:
            return await self._handle_quiz_answer(learner_message)

        # Step 3: Record the learner message
        self.messages.append(
            Message(role="user", content=learner_message)
        )
        self.state.message_count += 1

        # Step 4: Determine SEIAR phase
        self._advance_seiar_phase()

        # Step 5: Check shared library for relevant cached content
        library_context = self._check_library(learner_message)

        # Step 6: Build context-managed LLM prompt
        system_prompt, user_prompt = self._build_prompt(
            learner_message, library_context
        )

        # Step 7: Call LLM
        llm_response = await call_llm(
            messages=self._build_llm_messages(system_prompt, user_prompt),
            temperature=0.7,
            max_tokens=1024,
        )

        # Step 8: Parse response
        parsed = self._parse_response(llm_response.content)

        # Step 9: Record assistant message
        self.messages.append(
            Message(
                role="assistant",
                content=llm_response.content,
                metadata={
                    "seiar_phase": self.state.seiar_phase.value,
                    "concepts": parsed["concepts"],
                    "has_quiz": parsed["has_quiz"],
                },
            )
        )

        # Step 10: Update mastery graph with discussed concepts
        points = self._update_mastery_from_discussion(parsed["concepts"])

        # Step 11: Handle detected quiz question
        if parsed["has_quiz"] and parsed["quiz"]:
            self.state.pending_quiz = parsed["quiz"]

        # Step 12: Log to prompt audit
        await self._log_audit(
            system_prompt, user_prompt, llm_response, "character_dialog"
        )

        # Step 13: Check if we need to generate a conversation summary
        await self._maybe_generate_summary()

        # Step 14: Periodic AGE sync (every 10 messages)
        if self.state.message_count % 10 == 0:
            self._sync_mastery_to_age()
            self._save_conversation_state()

        return SendMessageResponse(
            response=llm_response.content,
            seiar_phase=self.state.seiar_phase.value,
            points_earned=points,
            quiz_pending=self.state.pending_quiz is not None,
            concepts_discussed=parsed["concepts"],
        )

    # -------------------------------------------------------------------
    # SEIAR phase management
    # -------------------------------------------------------------------

    def _advance_seiar_phase(self) -> None:
        """Determine the current SEIAR phase based on conversation flow.

        Phase transitions:
        - STORYTELLING: First message on a new topic (0-1 exchanges)
        - EXAMPLES: After initial topic intro (2-3 exchanges)
        - INTERACTION: Ongoing discussion (4+ exchanges)
        - ASSESSMENT: After sufficient interaction (every 5-7 exchanges)
        - REFINEMENT: After an assessment result

        The conductor tracks exchanges per topic, not total messages.
        """
        mc = self.state.message_count
        phase = self.state.seiar_phase

        # If we just finished refinement, loop back to storytelling (next concept)
        if phase == SEIARPhase.REFINEMENT:
            self.state.seiar_phase = SEIARPhase.STORYTELLING
            return

        # Topic-relative message count (reset on topic change)
        topic_messages = mc  # simplified: full count for now

        if topic_messages <= 1:
            self.state.seiar_phase = SEIARPhase.STORYTELLING
        elif topic_messages <= 3:
            self.state.seiar_phase = SEIARPhase.EXAMPLES
        elif topic_messages <= 6:
            self.state.seiar_phase = SEIARPhase.INTERACTION
        elif topic_messages % 7 == 0:
            # Assessment every ~7 exchanges
            self.state.seiar_phase = SEIARPhase.ASSESSMENT
        else:
            self.state.seiar_phase = SEIARPhase.INTERACTION

    # -------------------------------------------------------------------
    # Quiz detection and scoring
    # -------------------------------------------------------------------

    def _parse_response(self, content: str) -> dict[str, Any]:
        """Parse an LLM response to extract concepts, quiz questions, and transitions.

        Returns:
            Dict with keys: concepts (list[str]), has_quiz (bool),
            quiz (PendingQuiz | None), topic_transition (str | None).
        """
        result: dict[str, Any] = {
            "concepts": [],
            "has_quiz": False,
            "quiz": None,
            "topic_transition": None,
        }

        # Extract quiz questions (QUIZ: ... ANSWER: ... format)
        quiz_match = re.search(
            r"QUIZ:\s*(.+?)(?:\n[A-D]\)\s*(.+?))+(?:\nANSWER:\s*(.+?))?(?:\n|$)",
            content,
            re.DOTALL | re.IGNORECASE,
        )

        if quiz_match:
            question = quiz_match.group(1).strip()

            # Extract options
            options = re.findall(r"[A-D]\)\s*(.+?)(?:\n|$)", content)

            # Extract answer
            answer_match = re.search(r"ANSWER:\s*(.+?)(?:\n|$)", content, re.IGNORECASE)
            correct_answer = answer_match.group(1).strip() if answer_match else ""

            quiz_type = QuizType.MULTIPLE_CHOICE if options else QuizType.OPEN_ENDED

            result["has_quiz"] = True
            result["quiz"] = PendingQuiz(
                question=question,
                quiz_type=quiz_type,
                options=options,
                correct_answer=correct_answer,
                concept_name=self.state.current_topic or None,
            )
        else:
            # Check for open-ended quiz without options
            open_quiz = re.search(
                r"QUIZ:\s*(.+?)(?:\nANSWER:\s*(.+?))?(?:\n|$)",
                content,
                re.IGNORECASE,
            )
            if open_quiz:
                result["has_quiz"] = True
                result["quiz"] = PendingQuiz(
                    question=open_quiz.group(1).strip(),
                    quiz_type=QuizType.OPEN_ENDED,
                    correct_answer=(open_quiz.group(2) or "").strip(),
                    concept_name=self.state.current_topic or None,
                )

        # Extract concepts — look for capitalized noun phrases and topic keywords
        # This is a heuristic; production would use NER or LLM extraction
        result["concepts"] = self._extract_concepts(content)

        return result

    def _extract_concepts(self, content: str) -> list[str]:
        """Extract concept names discussed in the response.

        Uses a simple heuristic approach. In production, this could be
        enhanced with NER or a dedicated LLM call.
        """
        concepts = []

        # If we have a current topic, always include it
        if self.state.current_topic:
            concepts.append(self.state.current_topic)

        # Look for concept-like patterns: "about X", "learn about X", "concept of X"
        patterns = [
            r"(?:about|learn about|concept of|study|explore)\s+([A-Z][a-z]+(?:\s+[a-z]+){0,3})",
            r"(?:called|known as|named)\s+([A-Z][a-z]+(?:\s+[a-z]+){0,3})",
        ]
        for pattern in patterns:
            matches = re.findall(pattern, content)
            concepts.extend(m.strip() for m in matches if len(m.strip()) > 2)

        # Deduplicate while preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for c in concepts:
            c_lower = c.lower()
            if c_lower not in seen:
                seen.add(c_lower)
                unique.append(c)

        return unique[:5]  # Cap at 5 concepts per message

    async def _handle_quiz_answer(self, answer: str) -> SendMessageResponse:
        """Score a learner's answer to a pending quiz question."""
        quiz = self.state.pending_quiz
        if not quiz:
            raise ValueError("No pending quiz to answer")

        # Record the answer message
        self.messages.append(Message(role="user", content=answer))
        self.state.message_count += 1

        points = 0
        concepts = []

        if quiz.quiz_type == QuizType.MULTIPLE_CHOICE:
            # Exact match scoring for multiple choice
            answer_letter = answer.strip().upper()[:1]
            correct_letter = quiz.correct_answer.strip().upper()[:1]
            is_correct = answer_letter == correct_letter

            if is_correct:
                points = 10
                feedback = "That's correct! Great job! "
            else:
                correct_text = quiz.correct_answer
                if quiz.options and correct_letter in "ABCD":
                    idx = ord(correct_letter) - ord("A")
                    if idx < len(quiz.options):
                        correct_text = f"{correct_letter}) {quiz.options[idx]}"
                feedback = f"Not quite. The correct answer was {correct_text}. "

            confidence_delta = 0.15 if is_correct else -0.05

        else:
            # LLM-scored for open-ended
            score_result = await score_answer(
                question=quiz.question,
                correct_answer=quiz.correct_answer,
                learner_answer=answer,
                grade_level=self.grade_level,
            )

            is_correct = score_result.get("correct", False)
            partial = score_result.get("partial_credit", 0.0)
            feedback = score_result.get("feedback", "")

            if is_correct:
                points = 10
            elif partial > 0.5:
                points = 5
            confidence_delta = 0.15 * (partial if not is_correct else 1.0)

            # Log scoring audit
            await self._log_audit(
                system_message="Assessment scorer",
                user_message=f"Q: {quiz.question}\nA: {answer}",
                llm_response=LLMResponse(
                    content=json.dumps(score_result),
                    model=settings.SCORING_MODEL,
                    tokens_used=score_result.get("tokens_used", 0),
                    cost_estimate=score_result.get("cost_estimate", 0.0),
                ),
                prompt_type="assessment",
            )

        # Update mastery for the assessed concept
        if quiz.concept_name:
            concepts.append(quiz.concept_name)
            self._update_mastery_edge(
                quiz.concept_name, is_correct, confidence_delta
            )

        # Award points
        self.state.points_earned += points

        # Clear pending quiz
        self.state.pending_quiz = None

        # Move to refinement phase
        self.state.seiar_phase = SEIARPhase.REFINEMENT

        # Generate a follow-up response in refinement mode
        system_prompt = build_system_prompt(
            grade_level=self.grade_level,
            seiar_phase="refinement",
            mastery_summary=self._build_mastery_summary(),
            parent_guidelines=self.parent_guidelines,
            conversation_summary=self.state.summary,
        )

        follow_up_prompt = (
            f"The student just answered a quiz question.\n"
            f"Question: {quiz.question}\n"
            f"Their answer: {answer}\n"
            f"{'They got it right!' if is_correct else 'They got it wrong.'} "
            f"{feedback}\n"
            f"Now provide encouragement and either go deeper or reinforce the concept."
        )

        llm_response = await call_llm(
            messages=self._build_llm_messages(system_prompt, follow_up_prompt),
            temperature=0.7,
            max_tokens=1024,
        )

        # Record assistant response
        self.messages.append(
            Message(
                role="assistant",
                content=llm_response.content,
                metadata={
                    "seiar_phase": "refinement",
                    "quiz_result": is_correct,
                    "points": points,
                },
            )
        )

        await self._log_audit(
            system_prompt, follow_up_prompt, llm_response, "character_dialog"
        )

        return SendMessageResponse(
            response=llm_response.content,
            seiar_phase=SEIARPhase.REFINEMENT.value,
            points_earned=points,
            quiz_pending=False,
            concepts_discussed=concepts,
        )

    # -------------------------------------------------------------------
    # Parent gates
    # -------------------------------------------------------------------

    def _check_gates(self, message: str) -> str | None:
        """Check parent gates against the learner's message.

        Returns a blocking message string if a gate blocks this message,
        or None if the message is allowed.
        """
        message_lower = message.lower()

        for gate in self.gates:
            if gate.status != GateStatus.ACTIVE:
                continue

            if gate.gate_type == GateType.TOPIC_BLOCKED:
                blocked_topics = gate.predicate_json.get("topics", [])
                for topic in blocked_topics:
                    if topic.lower() in message_lower:
                        return (
                            f"I'm sorry, but I can't discuss {topic} right now. "
                            "Your parent has set some guidelines for our conversations. "
                            "Want to explore something else?"
                        )

            elif gate.gate_type == GateType.TIME_LIMITED:
                max_minutes = gate.predicate_json.get("max_minutes_per_day", 60)
                # Estimate time from message count (~2 min per exchange)
                estimated_minutes = self.state.message_count * 2
                if estimated_minutes >= max_minutes:
                    return (
                        "You've been learning for a while! Time to take a break. "
                        "Come back tomorrow for more adventures!"
                    )

            elif gate.gate_type == GateType.APPROVAL_REQUIRED:
                # Would need async parent approval flow
                required_topics = gate.predicate_json.get("topics", [])
                for topic in required_topics:
                    if topic.lower() in message_lower:
                        return (
                            f"Great question about {topic}! I need to check with "
                            "your parent before we explore that topic. I'll let them "
                            "know you're interested!"
                        )

            elif gate.gate_type == GateType.CONCEPT_GATE:
                gated_concepts = gate.predicate_json.get("concepts", [])
                for concept in gated_concepts:
                    if concept.lower() in message_lower:
                        return (
                            f"We'll get to {concept} soon! Your parent wants to make "
                            "sure you're ready first. Let's keep building your skills!"
                        )

        return None

    # -------------------------------------------------------------------
    # Prompt building with context window management
    # -------------------------------------------------------------------

    def _build_prompt(
        self, learner_message: str, library_context: str = ""
    ) -> tuple[str, str]:
        """Build system and user prompts for the LLM call.

        Manages the context window by injecting only:
        - Last N messages (configurable)
        - Compressed conversation summary
        - Mastery state summary
        - Parent guidelines
        - Library context (if available)
        """
        # Detect topic from first message or topic changes
        if self.state.message_count <= 1:
            self.state.current_topic = self._detect_topic(learner_message)

        system_prompt = build_system_prompt(
            grade_level=self.grade_level,
            seiar_phase=self.state.seiar_phase.value,
            mastery_summary=self._build_mastery_summary(),
            parent_guidelines=self.parent_guidelines,
            conversation_summary=self.state.summary,
        )

        # Add quiz detection instructions during assessment phase
        if self.state.seiar_phase == SEIARPhase.ASSESSMENT:
            system_prompt += "\n\n" + build_quiz_detection_prompt()

        # Build user turn with library context
        user_parts = []
        if library_context:
            user_parts.append(
                f"[Relevant content from the library: {library_context}]"
            )
        user_parts.append(learner_message)

        return system_prompt, "\n\n".join(user_parts)

    def _build_llm_messages(
        self, system_prompt: str, user_prompt: str
    ) -> list[dict[str, str]]:
        """Build the messages list for the LLM call with context windowing.

        Injects: system prompt + last N messages + current user message.
        """
        messages: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]

        # Add conversation summary if we have one
        if self.state.summary:
            messages.append(
                {
                    "role": "system",
                    "content": f"[Conversation summary so far: {self.state.summary}]",
                }
            )

        # Add last N messages for context
        window = settings.CONTEXT_LAST_N_MESSAGES
        recent = self.messages[-window:] if len(self.messages) > window else self.messages

        for msg in recent:
            # Skip the current user message (we add it separately)
            messages.append({"role": msg.role, "content": msg.content})

        # Add the current user message
        messages.append({"role": "user", "content": user_prompt})

        return messages

    def _build_mastery_summary(self) -> str:
        """Build a concise mastery summary for prompt injection."""
        if not self.mastery:
            return "This is a new learner with no mastery data yet."

        lines = []
        for concept_id, edge in self.mastery.items():
            level_desc = (
                "mastered" if edge.level >= 0.8
                else "good" if edge.level >= 0.6
                else "learning" if edge.level >= 0.3
                else "new"
            )
            lines.append(
                f"- {edge.concept_name}: {level_desc} "
                f"({edge.correct}/{edge.total} correct, "
                f"confidence: {edge.level:.0%})"
            )

        return "Learner's current mastery:\n" + "\n".join(lines[:10])

    def _detect_topic(self, message: str) -> str:
        """Detect the topic from a learner message.

        Simple heuristic: look for "teach me about X", "learn about X",
        "what is X", or just use the first noun phrase.
        """
        patterns = [
            r"(?:teach me about|learn about|tell me about|what (?:is|are))\s+(.+?)(?:\?|!|\.|$)",
            r"(?:I want to know about|explain)\s+(.+?)(?:\?|!|\.|$)",
        ]
        for pattern in patterns:
            match = re.search(pattern, message, re.IGNORECASE)
            if match:
                return match.group(1).strip()

        # Fallback: use the message itself (truncated) as the topic
        return message[:50].strip()

    # -------------------------------------------------------------------
    # Context window management
    # -------------------------------------------------------------------

    async def _maybe_generate_summary(self) -> None:
        """Generate a conversation summary every N messages.

        Per spec Open Question #3: store full transcript, inject only
        last 20 messages + compressed summary + mastery state.
        """
        n = settings.SUMMARY_EVERY_N_MESSAGES
        if (
            self.state.message_count > 0
            and self.state.message_count % n == 0
            and self.state.message_count > self.state.last_summary_at
        ):
            logger.info(
                "Generating conversation summary at message %d",
                self.state.message_count,
            )

            # Summarize the messages since the last summary
            start_idx = self.state.last_summary_at
            messages_to_summarize = [
                {"role": m.role, "content": m.content}
                for m in self.messages[start_idx:]
            ]

            self.state.summary = await generate_summary(
                messages_to_summarize,
                existing_summary=self.state.summary,
            )
            self.state.last_summary_at = self.state.message_count

            logger.info("Summary generated: %d chars", len(self.state.summary))

    # -------------------------------------------------------------------
    # Mastery graph (NetworkX in-memory)
    # -------------------------------------------------------------------

    def _update_mastery_from_discussion(self, concepts: list[str]) -> int:
        """Update mastery graph when concepts are discussed (not assessed).

        Discussion gives a small mastery boost. Assessment gives more.
        Returns points earned.
        """
        points = 0
        for concept_name in concepts:
            concept_id = concept_name.lower().replace(" ", "_")

            if concept_id not in self.mastery:
                # New concept encountered
                self.mastery[concept_id] = MasteryEdge(
                    concept_id=concept_id,
                    concept_name=concept_name,
                    level=0.1,  # Small initial confidence from just discussing
                    correct=0,
                    total=0,
                )
                # Add to NetworkX graph
                self.graph.add_node(concept_id, name=concept_name, type="concept")
                self.graph.add_edge(
                    self.learner_id, concept_id,
                    type="MASTERY", level=0.1,
                )
                points += 1  # 1 point for encountering a new concept
            else:
                # Small boost for continued discussion
                edge = self.mastery[concept_id]
                edge.level = min(1.0, edge.level + 0.02)
                # Update NetworkX edge
                if self.graph.has_edge(self.learner_id, concept_id):
                    self.graph[self.learner_id][concept_id]["level"] = edge.level

        return points

    def _update_mastery_edge(
        self, concept_name: str, correct: bool, confidence_delta: float
    ) -> None:
        """Update a mastery edge after an assessment."""
        concept_id = concept_name.lower().replace(" ", "_")

        if concept_id not in self.mastery:
            self.mastery[concept_id] = MasteryEdge(
                concept_id=concept_id,
                concept_name=concept_name,
                level=0.0,
                correct=0,
                total=0,
            )

        edge = self.mastery[concept_id]
        edge.total += 1
        if correct:
            edge.correct += 1
        edge.level = max(0.0, min(1.0, edge.level + confidence_delta))
        edge.last_tested = datetime.now(tz=__import__('datetime').timezone.utc)

        # Update NetworkX
        if not self.graph.has_node(concept_id):
            self.graph.add_node(concept_id, name=concept_name, type="concept")
        self.graph.add_edge(
            self.learner_id, concept_id,
            type="MASTERY",
            level=edge.level,
            correct=edge.correct,
            total=edge.total,
        )

    # -------------------------------------------------------------------
    # Shared library lookup
    # -------------------------------------------------------------------

    def _check_library(self, message: str) -> str:
        """Check the shared library for relevant cached content.

        Queries AGE for lessons/content matching the current topic
        that have good validation scores.
        """
        topic = self.state.current_topic or self._detect_topic(message)
        if not topic:
            return ""

        try:
            results = execute_cypher(
                """
                MATCH (l:Lesson)-[:COVERS]->(c:Concept)
                WHERE c.name =~ $topic_pattern
                AND l.validation_status = 'approved'
                AND l.avg_score > 0.7
                RETURN l.title, l.spec_json, c.name
                ORDER BY l.times_served DESC
                LIMIT 3
                """,
            )

            if results:
                snippets = []
                for r in results:
                    result_data = r.get("result", {})
                    if isinstance(result_data, dict):
                        title = result_data.get("l.title", "")
                        if title:
                            snippets.append(title)
                if snippets:
                    return "Related content: " + "; ".join(snippets)
        except Exception as e:
            # Library lookup is optional — don't fail the request
            logger.debug("Library lookup failed (non-fatal): %s", e)

        return ""

    # -------------------------------------------------------------------
    # AGE ↔ NetworkX sync
    # -------------------------------------------------------------------

    def _load_mastery_graph(self) -> None:
        """Load learner's mastery neighborhood from AGE into NetworkX.

        Loads: Learner node, connected Concepts, MASTERY edges,
        and PREREQUISITE_OF edges between concepts.
        """
        # Add learner node
        self.graph.add_node(
            self.learner_id, type="learner", grade_level=self.grade_level
        )

        try:
            # Load mastery edges
            results = execute_cypher(
                f"""
                MATCH (l:Learner {{id: '{self.learner_id}'}})-[m:MASTERY]->(c:Concept)
                RETURN c.id AS concept_id, c.name AS concept_name,
                       m.level AS level, m.correct AS correct,
                       m.total AS total, m.last_tested AS last_tested
                """
            )

            for row in results:
                r = row.get("result", row)
                if not isinstance(r, dict):
                    continue

                concept_id = r.get("concept_id", "")
                concept_name = r.get("concept_name", "")
                level = float(r.get("level", 0))
                correct = int(r.get("correct", 0))
                total = int(r.get("total", 0))

                self.mastery[concept_id] = MasteryEdge(
                    concept_id=concept_id,
                    concept_name=concept_name,
                    level=level,
                    correct=correct,
                    total=total,
                )

                self.graph.add_node(concept_id, name=concept_name, type="concept")
                self.graph.add_edge(
                    self.learner_id, concept_id,
                    type="MASTERY", level=level,
                    correct=correct, total=total,
                )

            # Load prerequisite edges between concepts
            if self.mastery:
                concept_ids = list(self.mastery.keys())
                results = execute_cypher(
                    f"""
                    MATCH (c1:Concept)-[:PREREQUISITE_OF]->(c2:Concept)
                    WHERE c1.id IN {concept_ids} OR c2.id IN {concept_ids}
                    RETURN c1.id AS from_id, c2.id AS to_id
                    """
                )

                for row in results:
                    r = row.get("result", row)
                    if isinstance(r, dict):
                        self.graph.add_edge(
                            r.get("from_id", ""),
                            r.get("to_id", ""),
                            type="PREREQUISITE_OF",
                        )

        except Exception as e:
            logger.warning("Failed to load mastery graph from AGE: %s", e)
            # Session can proceed without mastery data

    def _sync_mastery_to_age(self) -> None:
        """Write mastery changes back to AGE.

        Called on session end and periodically during long sessions.
        Uses MERGE to create-or-update mastery edges.
        """
        if not self.mastery:
            return

        try:
            with get_connection() as conn:
                for concept_id, edge in self.mastery.items():
                    execute_cypher(
                        f"""
                        MERGE (l:Learner {{id: '{self.learner_id}'}})
                        MERGE (c:Concept {{id: '{concept_id}'}})
                        ON CREATE SET c.name = '{edge.concept_name}'
                        MERGE (l)-[m:MASTERY]->(c)
                        SET m.level = {edge.level},
                            m.correct = {edge.correct},
                            m.total = {edge.total},
                            m.last_tested = '{edge.last_tested or datetime.now(tz=__import__("datetime").timezone.utc)}'
                        """,
                        conn=conn,
                    )
                logger.info(
                    "Synced %d mastery edges to AGE for learner %s",
                    len(self.mastery),
                    self.learner_id,
                )
        except Exception as e:
            logger.error("Failed to sync mastery to AGE: %s", e)

    def _load_gates(self) -> None:
        """Load active parent gates for this learner from AGE."""
        try:
            results = execute_cypher(
                f"""
                MATCH (g:Gate)-[:OWNED_BY]->(l:Learner {{id: '{self.learner_id}'}})
                WHERE g.status = 'active'
                RETURN g.id AS id, g.gate_type AS gate_type,
                       g.predicate_json AS predicate_json,
                       g.status AS status, g.parent_id AS parent_id
                """
            )

            for row in results:
                r = row.get("result", row)
                if not isinstance(r, dict):
                    continue

                predicate = r.get("predicate_json", "{}")
                if isinstance(predicate, str):
                    predicate = json.loads(predicate)

                self.gates.append(
                    Gate(
                        id=r.get("id", ""),
                        gate_type=GateType(r.get("gate_type", "TOPIC_BLOCKED")),
                        predicate_json=predicate,
                        status=GateStatus(r.get("status", "active")),
                        parent_id=r.get("parent_id", ""),
                    )
                )
        except Exception as e:
            logger.warning("Failed to load gates from AGE: %s", e)

    def _load_parent_guidelines(self) -> None:
        """Load parent guidelines for this learner."""
        try:
            results = execute_cypher(
                f"""
                MATCH (l:Learner {{id: '{self.learner_id}'}})
                RETURN l.guidelines AS guidelines
                """
            )
            for row in results:
                r = row.get("result", row)
                if isinstance(r, dict):
                    self.parent_guidelines = r.get("guidelines", "") or ""
        except Exception as e:
            logger.debug("Failed to load parent guidelines: %s", e)

    def _load_conversation_state(self) -> None:
        """Load existing conversation state and messages from AGE."""
        try:
            results = execute_cypher(
                f"""
                MATCH (conv:Conversation {{id: '{self.conversation_id}'}})
                RETURN conv.state_json AS state_json,
                       conv.summary AS summary,
                       conv.message_count AS message_count
                """
            )

            for row in results:
                r = row.get("result", row)
                if not isinstance(r, dict):
                    continue

                state_json = r.get("state_json", "")
                if state_json:
                    if isinstance(state_json, str):
                        state_data = json.loads(state_json)
                    else:
                        state_data = state_json
                    # Restore state fields
                    self.state.seiar_phase = SEIARPhase(
                        state_data.get("seiar_phase", "storytelling")
                    )
                    self.state.current_topic = state_data.get("current_topic", "")
                    self.state.points_earned = state_data.get("points_earned", 0)
                    self.state.message_count = state_data.get("message_count", 0)

                self.state.summary = r.get("summary", "") or ""

        except Exception as e:
            logger.debug("Failed to load conversation state (may be new): %s", e)

    def _save_conversation_state(self) -> None:
        """Save conversation state to AGE."""
        state_json = json.dumps({
            "seiar_phase": self.state.seiar_phase.value,
            "current_topic": self.state.current_topic,
            "current_concepts": self.state.current_concepts,
            "points_earned": self.state.points_earned,
            "message_count": self.state.message_count,
            "last_summary_at": self.state.last_summary_at,
        })

        # Escape single quotes for Cypher
        state_json_escaped = state_json.replace("'", "\\'")
        summary_escaped = (self.state.summary or "").replace("'", "\\'")

        try:
            execute_cypher(
                f"""
                MERGE (conv:Conversation {{id: '{self.conversation_id}'}})
                SET conv.learner_id = '{self.learner_id}',
                    conv.state_json = '{state_json_escaped}',
                    conv.summary = '{summary_escaped}',
                    conv.message_count = {self.state.message_count},
                    conv.last_active = '{datetime.now(tz=__import__("datetime").timezone.utc).isoformat()}',
                    conv.status = 'active'
                """
            )
        except Exception as e:
            logger.error("Failed to save conversation state: %s", e)

    # -------------------------------------------------------------------
    # Prompt audit logging
    # -------------------------------------------------------------------

    async def _log_audit(
        self,
        system_message: str,
        user_message: str,
        llm_response: LLMResponse,
        prompt_type: str,
    ) -> None:
        """Log an LLM call to the prompt_audit table.

        Every LLM call is logged so parents can see exactly what prompts
        were sent to the AI.
        """
        audit = PromptAuditCreate(
            learner_id=self.learner_id,
            conversation_id=self.conversation_id,
            prompt_type=prompt_type,
            system_message=system_message,
            user_message=user_message,
            model=llm_response.model,
            response_text=llm_response.content,
            tokens_used=llm_response.tokens_used,
            cost_estimate=llm_response.cost_estimate,
        )

        entry = audit.to_entry()

        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO prompt_audit
                            (id, learner_id, conversation_id, prompt_type,
                             system_message, user_message, model,
                             response_preview, tokens_used, cost_estimate, created_at)
                        VALUES
                            (%(id)s, %(learner_id)s, %(conversation_id)s, %(prompt_type)s,
                             %(system_message)s, %(user_message)s, %(model)s,
                             %(response_preview)s, %(tokens_used)s, %(cost_estimate)s,
                             NOW())
                        """,
                        entry,
                    )
                conn.commit()
        except Exception as e:
            # Audit logging should never block the response
            logger.error("Failed to log prompt audit: %s", e)


# ---------------------------------------------------------------------------
# Public API — used by routes
# ---------------------------------------------------------------------------


async def get_or_create_session(
    conversation_id: str,
    learner_id: str,
    grade_level: int,
) -> ConductorSession:
    """Get an existing session or create a new one.

    Sessions are cached in memory by conversation_id.
    """
    if conversation_id in _sessions:
        return _sessions[conversation_id]

    session = ConductorSession(
        conversation_id=conversation_id,
        learner_id=learner_id,
        grade_level=grade_level,
    )
    await session.start()
    _sessions[conversation_id] = session
    return session


async def process_learner_message(
    conversation_id: str,
    learner_id: str,
    grade_level: int,
    message: str,
) -> SendMessageResponse:
    """Process a learner message and return the tutor's response.

    This is the main entry point for POST /conversations/{id}/message.

    Args:
        conversation_id: UUID of the conversation.
        learner_id: UUID of the learner.
        grade_level: Numeric grade level (0-12).
        message: The learner's message text.

    Returns:
        SendMessageResponse with the tutor's reply and metadata.
    """
    session = await get_or_create_session(
        conversation_id, learner_id, grade_level
    )
    return await session.process_message(message)


async def end_session(conversation_id: str) -> None:
    """End a conductor session, syncing state to AGE."""
    session = _sessions.get(conversation_id)
    if session:
        await session.end()


async def get_session_state(conversation_id: str) -> ConversationState | None:
    """Get the current state of a session (if active)."""
    session = _sessions.get(conversation_id)
    if session:
        return session.state
    return None
