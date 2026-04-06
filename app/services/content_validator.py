"""Content validation service for AI-generated educational content.

Validates safety, grade-appropriateness, readability, and structural quality
of lessons, quizzes, and other AI-generated content before serving to students.

Ported from v1 TypeScript services:
  - server/services/content-validator.ts  (readability, grade vocab, quiz structure)
  - server/services/prompt-safety.ts      (injection detection, PII, input sanitization)
  - server/services/lesson-validator.ts   (placeholder detection, structural checks)
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class ValidationResult:
    """Outcome of a content validation pass."""

    is_valid: bool
    issues: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    readability_score: float | None = None


@dataclass
class SafetyResult:
    """Outcome of a safety check."""

    safe: bool
    reason: str = ""
    sanitized: str = ""


@dataclass
class ContentValidationReport:
    """Full validation report combining all checks."""

    is_valid: bool
    is_safe: bool
    is_grade_appropriate: bool
    readability_grade: float
    issues: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Grade band helpers
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Readability
# ---------------------------------------------------------------------------


def count_syllables(word: str) -> int:
    """Count syllables in a word (simplified algorithm, ported from v1)."""
    word = re.sub(r"[^a-z]", "", word.lower())
    if len(word) <= 3:
        return 1

    # Count vowel groups
    vowel_groups = re.findall(r"[aeiouy]+", word)
    count = len(vowel_groups) if vowel_groups else 1

    # Adjust for silent e
    if word.endswith("e"):
        count -= 1

    # Adjust for -le endings (e.g. "table")
    if word.endswith("le") and len(word) > 2 and word[-3] not in "aeiouy":
        count += 1

    return max(count, 1)


def flesch_kincaid_grade(text: str) -> float:
    """Calculate Flesch-Kincaid Grade Level.

    Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
    """
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    words = [w for w in text.split() if w]
    if not sentences or not words:
        return 0.0

    total_syllables = sum(count_syllables(w) for w in words)
    words_per_sentence = len(words) / len(sentences)
    syllables_per_word = total_syllables / len(words)

    return 0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59


# ---------------------------------------------------------------------------
# Grade-specific vocabulary restrictions (ported from v1)
# ---------------------------------------------------------------------------

GRADE_BANNED_WORDS: dict[str, list[str]] = {
    "K-2": [
        # Abstract concepts
        "process", "system", "adapt", "adaptation", "environment", "organism",
        "function", "structure", "cycle", "energy", "nutrient", "habitat",
        "ecosystem", "photosynthesis", "cells", "billions", "molecules",
        "chemical", "reaction", "evolution", "species", "classification",
        # Complex verbs
        "analyze", "synthesize", "evaluate", "determine", "conclude",
        "hypothesize", "investigate", "demonstrate", "illustrate",
        # Academic transitions
        "subsequently", "furthermore", "nevertheless", "consequently",
        "therefore", "however", "although", "whereas", "moreover",
        # Complex comparatives
        "relationship", "comparison", "similarity", "difference",
        "characteristic", "property", "attribute", "feature",
    ],
    "3-5": [
        # Advanced scientific terms
        "molecular", "cellular", "genetic", "heredity", "chromosomes",
        "proteins", "enzymes", "metabolism", "symbiosis", "mutualism",
        # Complex processes
        "photosynthesis", "respiration", "digestion", "circulation",
        "reproduction", "metamorphosis", "mitosis", "meiosis",
        # Advanced math
        "polynomial", "quadratic", "exponential", "logarithm",
        "derivative", "integral", "theorem", "proof",
    ],
}

# Maximum words per sentence by grade level
MAX_SENTENCE_WORDS: dict[int, int] = {
    0: 5, 1: 5, 2: 5,        # K-2
    3: 8, 4: 8,               # 3-4
    5: 12, 6: 12,             # 5-6
    7: 15, 8: 15,             # 7-8
    9: 20, 10: 20,            # 9-10
    11: 25, 12: 25,           # 11-12
}

# Maximum content word count by grade level
MAX_CONTENT_WORDS: dict[int, int] = {
    0: 75, 1: 75, 2: 75,
    3: 200, 4: 200,
    5: 400, 6: 400,
    7: 700, 8: 700,
    9: 1000, 10: 1000,
    11: 1200, 12: 1200,
}


# ---------------------------------------------------------------------------
# Safety — banned topics, prompt injection, PII
# ---------------------------------------------------------------------------

BANNED_TOPICS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\b(drug|drugs)\s+(use|abuse|dealing)\b",
        r"\bsuicid(e|al)\b",
        r"\bself[\s-]?harm\b",
        r"\bgambling\b",
        r"\bpornograph(y|ic)\b",
        r"\bweapons?\s+(making|building|assembl)\b",
        r"\bexplosives?\b",
        r"\bhate\s+speech\b",
        r"\bracis(t|m)\b",
        r"\bextremis(t|m)\b",
        r"\bterroris(t|m)\b",
    ]
]

INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"ignore\s+(all\s+)?previous\s+instructions",
        r"ignore\s+(the\s+)?(above|system)\s+(prompt|instructions)",
        r"disregard\s+(all\s+)?prior",
        r"you\s+are\s+now\s+(a|an)\s+",
        r"new\s+instructions?\s*:",
        r"system\s*prompt\s*:",
        r"\bDAN\b.*\bmode\b",
        r"do\s+anything\s+now",
        r"jailbreak",
        r"bypass\s+(safety|content|filter)",
        r"\bprocess\.env\b",
        r"\beval\s*\(",
        r"<script",
        r"\$\{.*\}",
    ]
]

# PII patterns
PII_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("email", re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")),
    ("phone", re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")),
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("credit_card", re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")),
    ("IP_address", re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")),
]

# Input character whitelist (letters, numbers, common punctuation, unicode)
SAFE_TOPIC_PATTERN = re.compile(r"^[\w\s\-().,&'+:;!?/]{1,200}$", re.UNICODE)


# ---------------------------------------------------------------------------
# Quality — placeholder detection
# ---------------------------------------------------------------------------

PLACEHOLDER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"^This is a lesson about ",
        r"^What is this lesson about\?$",
        r"^Let's learn about .+ together!$",
        r"^Today we're going to learn about ",
        r"\[insert .+\]",
        r"\[TODO\b",
        r"\[placeholder\b",
        r"lorem ipsum",
        r"<your .+ here>",
        r"FIXME",
        r"XXX",
    ]
]

# Minimum content lengths (word count)
MIN_LESSON_WORDS = 30
MIN_SECTION_WORDS = 10
MIN_QUIZ_QUESTIONS = 2
MIN_QUIZ_OPTIONS = 2


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class ContentValidator:
    """Stateless validator for AI-generated educational content.

    All methods are synchronous — no external API calls, no mocks.
    """

    # --- Readability checks ---

    def check_readability(
        self, text: str, grade_level: int
    ) -> ValidationResult:
        """Check grade-specific readability: sentence length, vocab, Flesch-Kincaid."""
        issues: list[str] = []
        recommendations: list[str] = []

        fk_grade = flesch_kincaid_grade(text)
        target_max_grade = grade_level + 1.5  # allow 1.5 grades above

        if fk_grade > target_max_grade:
            issues.append(
                f"Readability grade ({fk_grade:.1f}) exceeds target ({target_max_grade:.1f})"
            )
            recommendations.append(
                "Simplify vocabulary and use shorter sentences"
            )

        # Sentence length check
        sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
        max_words = MAX_SENTENCE_WORDS.get(grade_level, 25)
        long_sentences = 0
        for sentence in sentences:
            word_count = len(sentence.split())
            if word_count > int(max_words * 1.5):
                long_sentences += 1

        if sentences and long_sentences > len(sentences) * 0.2:
            issues.append(
                f"{long_sentences} sentences exceed recommended length for grade {grade_level}"
            )
            recommendations.append(
                "Break long sentences into shorter, simpler ones"
            )

        # Vocab complexity check (banned words by grade band)
        band_key = "K-2" if grade_level <= 2 else "3-5" if grade_level <= 5 else None
        if band_key and band_key in GRADE_BANNED_WORDS:
            text_lower = text.lower()
            found = [w for w in GRADE_BANNED_WORDS[band_key] if w in text_lower]
            if found:
                issues.append(
                    f"Found {len(found)} words too advanced for grade {grade_level}: "
                    f"{', '.join(found[:5])}"
                )
                recommendations.append(
                    f"Replace advanced words with simpler alternatives"
                )

        return ValidationResult(
            is_valid=len(issues) == 0,
            issues=issues,
            recommendations=recommendations,
            readability_score=fk_grade,
        )

    # --- Safety checks ---

    def check_safety(self, text: str) -> SafetyResult:
        """Check for banned topics, prompt injection, and PII."""
        # Banned topics
        for pattern in BANNED_TOPICS:
            if pattern.search(text):
                reason = f"Banned topic detected: {pattern.pattern}"
                logger.warning("Safety check failed: %s", reason)
                return SafetyResult(safe=False, reason=reason)

        # Prompt injection
        for pattern in INJECTION_PATTERNS:
            if pattern.search(text):
                reason = "Prompt injection pattern detected"
                logger.warning(
                    "Safety check failed: injection pattern in '%.50s...'", text
                )
                return SafetyResult(safe=False, reason=reason)

        # PII detection
        for pii_type, pattern in PII_PATTERNS:
            if pattern.search(text):
                reason = f"PII detected: {pii_type}"
                logger.warning("Safety check failed: %s", reason)
                return SafetyResult(safe=False, reason=reason)

        return SafetyResult(safe=True, sanitized=text)

    def validate_topic_input(self, input_text: str) -> SafetyResult:
        """Validate and sanitize a user-provided topic string.

        Checks character whitelist and injection patterns before the value
        reaches any LLM prompt.
        """
        if not input_text or not isinstance(input_text, str):
            return SafetyResult(safe=False, reason="Input is required")

        trimmed = input_text.strip()
        if not trimmed:
            return SafetyResult(safe=False, reason="Input is empty")

        if len(trimmed) > 200:
            return SafetyResult(
                safe=False, reason="Input exceeds 200 character limit"
            )

        # Injection patterns
        for pattern in INJECTION_PATTERNS:
            if pattern.search(trimmed):
                logger.warning(
                    "Topic injection detected: '%.50s...'", trimmed
                )
                return SafetyResult(
                    safe=False, reason="Input contains disallowed patterns"
                )

        # Character whitelist
        if not SAFE_TOPIC_PATTERN.match(trimmed):
            logger.warning("Invalid chars in topic: '%.50s...'", trimmed)
            return SafetyResult(
                safe=False, reason="Input contains invalid characters"
            )

        return SafetyResult(safe=True, sanitized=trimmed)

    # --- Quality checks ---

    def check_quality(self, text: str) -> ValidationResult:
        """Check for placeholders, minimum length, and general quality."""
        issues: list[str] = []
        recommendations: list[str] = []

        # Minimum length
        word_count = len(text.split())
        if word_count < MIN_LESSON_WORDS:
            issues.append(
                f"Content too short: {word_count} words (minimum {MIN_LESSON_WORDS})"
            )
            recommendations.append("Expand content with more detail and examples")

        # Placeholder detection
        for pattern in PLACEHOLDER_PATTERNS:
            match = pattern.search(text)
            if match:
                issues.append(
                    f"Placeholder content detected: '{match.group()[:50]}'"
                )
                recommendations.append(
                    "Replace placeholder text with real content"
                )

        return ValidationResult(
            is_valid=len(issues) == 0,
            issues=issues,
            recommendations=recommendations,
        )

    def validate_quiz_structure(
        self,
        questions: list[dict[str, Any]],
        grade_level: int,
    ) -> ValidationResult:
        """Validate quiz question structure and grade-appropriateness.

        Each question dict should have:
          - question (str): question text
          - options (list[str]): answer choices
          - correct_index (int): 0-based index of correct answer
          - explanation (str, optional): why the answer is correct
        """
        issues: list[str] = []
        recommendations: list[str] = []
        readability_scores: list[float] = []

        if len(questions) < MIN_QUIZ_QUESTIONS:
            issues.append(
                f"Quiz has {len(questions)} questions, need at least {MIN_QUIZ_QUESTIONS}"
            )

        max_words = MAX_SENTENCE_WORDS.get(grade_level, 25)
        band_key = "K-2" if grade_level <= 2 else "3-5" if grade_level <= 5 else None
        banned_words = GRADE_BANNED_WORDS.get(band_key, []) if band_key else []

        for idx, q in enumerate(questions):
            q_text = q.get("question", "")
            options = q.get("options", [])
            correct_index = q.get("correct_index")

            # Empty question text
            if not q_text or not q_text.strip():
                issues.append(f"Question {idx + 1} has empty text")
                continue

            # Placeholder check
            for pattern in PLACEHOLDER_PATTERNS:
                if pattern.search(q_text):
                    issues.append(
                        f"Question {idx + 1} contains placeholder text"
                    )

            # Question length
            q_words = q_text.split()
            if len(q_words) > max_words:
                issues.append(
                    f"Question {idx + 1} too long: {len(q_words)} words "
                    f"(max {max_words} for grade {grade_level})"
                )
                recommendations.append(
                    f"Q{idx + 1}: Simplify question or reduce unnecessary words"
                )

            # Readability
            fk = flesch_kincaid_grade(q_text)
            readability_scores.append(fk)
            if fk > grade_level + 1:
                issues.append(
                    f"Question {idx + 1} readability ({fk:.1f}) "
                    f"above target ({grade_level + 1})"
                )

            # Banned words in question
            q_lower = q_text.lower()
            for word in banned_words:
                if word in q_lower:
                    issues.append(
                        f"Question {idx + 1}: banned word '{word}' for grade {grade_level}"
                    )

            # Options validation
            if len(options) < MIN_QUIZ_OPTIONS:
                issues.append(
                    f"Question {idx + 1} has {len(options)} options, "
                    f"need at least {MIN_QUIZ_OPTIONS}"
                )

            # correct_index bounds
            if correct_index is None:
                issues.append(f"Question {idx + 1} missing correct_index")
            elif not isinstance(correct_index, int):
                issues.append(f"Question {idx + 1} correct_index is not an integer")
            elif correct_index < 0 or correct_index >= len(options):
                issues.append(
                    f"Question {idx + 1} correct_index {correct_index} out of range"
                )

            # Banned words in options
            for opt_idx, opt in enumerate(options):
                opt_lower = opt.lower()
                for word in banned_words:
                    if word in opt_lower:
                        issues.append(
                            f"Question {idx + 1}, option {opt_idx + 1}: "
                            f"banned word '{word}'"
                        )
                # Option length
                opt_words = opt.split()
                if len(opt_words) > max_words:
                    issues.append(
                        f"Question {idx + 1}, option {opt_idx + 1} too long: "
                        f"{len(opt_words)} words"
                    )

            # K-2 specific: answers should be very simple
            if grade_level <= 2 and options:
                is_yes_no = any(
                    o.lower() in ("yes", "no") for o in options
                )
                is_numbers = all(re.match(r"^\d+$", o.strip()) for o in options)
                is_simple = all(len(o.split()) <= 2 for o in options)
                if not (is_yes_no or is_numbers or is_simple):
                    issues.append(
                        f"Question {idx + 1}: K-2 answers should be "
                        "yes/no, numbers, or 1-2 word choices"
                    )
                    recommendations.append(
                        f"Q{idx + 1}: Use yes/no, counting numbers, or simple choices"
                    )

            # Multi-part question check for young grades
            if (
                grade_level <= 4
                and " and " in q_text
                and "?" in q_text
                and q_text.count(" and ") >= 2
            ):
                issues.append(
                    f"Question {idx + 1}: multi-part question too complex for grade {grade_level}"
                )
                recommendations.append(f"Q{idx + 1}: Ask one concept at a time")

        avg_readability = (
            sum(readability_scores) / len(readability_scores)
            if readability_scores
            else 0.0
        )

        return ValidationResult(
            is_valid=len(issues) == 0,
            issues=issues,
            recommendations=recommendations,
            readability_score=avg_readability,
        )

    def validate_lesson_content(
        self,
        content: str,
        grade_level: int,
        *,
        sections: list[dict[str, Any]] | None = None,
    ) -> ValidationResult:
        """Validate lesson text and optional sections structure.

        Args:
            content: Full lesson text.
            grade_level: 0=K, 1-12.
            sections: Optional list of section dicts with 'title' and 'content'.
        """
        issues: list[str] = []
        recommendations: list[str] = []

        # Readability
        readability = self.check_readability(content, grade_level)
        issues.extend(readability.issues)
        recommendations.extend(readability.recommendations)

        # Content length
        word_count = len(content.split())
        max_words = MAX_CONTENT_WORDS.get(grade_level, 1200)
        if word_count > int(max_words * 1.2):
            issues.append(
                f"Content too long: {word_count} words (recommended max {max_words})"
            )
            recommendations.append(
                "Focus on core concepts and reduce unnecessary details"
            )

        # Quality
        quality = self.check_quality(content)
        issues.extend(quality.issues)
        recommendations.extend(quality.recommendations)

        # Section validation
        if sections is not None:
            if len(sections) < 2:
                issues.append(
                    f"Lesson has {len(sections)} sections, need at least 2"
                )
            for idx, section in enumerate(sections):
                sec_content = section.get("content", "")
                sec_title = section.get("title", f"Section {idx}")
                if not sec_content or len(sec_content.strip()) < 10:
                    issues.append(
                        f'Section {idx} ("{sec_title}") has insufficient content'
                    )
                for pattern in PLACEHOLDER_PATTERNS:
                    if pattern.search(sec_content):
                        issues.append(
                            f"Section {idx} contains placeholder content"
                        )

        return ValidationResult(
            is_valid=len(issues) == 0,
            issues=issues,
            recommendations=recommendations,
            readability_score=readability.readability_score,
        )

    # --- Full validation pipeline ---

    def validate(
        self,
        content: str,
        grade_level: int,
        *,
        content_type: str = "lesson",
        quiz_questions: list[dict[str, Any]] | None = None,
        sections: list[dict[str, Any]] | None = None,
    ) -> ContentValidationReport:
        """Run the full validation pipeline on content.

        Combines safety, readability, and quality checks into a single report.

        Args:
            content: The text content to validate.
            grade_level: Numeric grade (0=K, 1-12).
            content_type: "lesson" or "quiz".
            quiz_questions: Quiz question dicts (required when content_type="quiz").
            sections: Lesson section dicts (optional, for lesson structural checks).

        Returns:
            ContentValidationReport with aggregated results.
        """
        all_issues: list[str] = []
        all_recommendations: list[str] = []

        # 1. Safety
        safety = self.check_safety(content)
        is_safe = safety.safe
        if not safety.safe:
            all_issues.append(f"Safety: {safety.reason}")

        # 2. Readability
        readability = self.check_readability(content, grade_level)
        is_grade_appropriate = readability.is_valid
        all_issues.extend(readability.issues)
        all_recommendations.extend(readability.recommendations)

        # 3. Quality
        quality = self.check_quality(content)
        all_issues.extend(quality.issues)
        all_recommendations.extend(quality.recommendations)

        # 4. Content-type-specific checks
        if content_type == "quiz" and quiz_questions is not None:
            quiz_result = self.validate_quiz_structure(quiz_questions, grade_level)
            all_issues.extend(quiz_result.issues)
            all_recommendations.extend(quiz_result.recommendations)
            if not quiz_result.is_valid:
                is_grade_appropriate = False

        if content_type == "lesson" and sections is not None:
            lesson_result = self.validate_lesson_content(
                content, grade_level, sections=sections
            )
            # Avoid duplicating readability/quality issues already collected
            for issue in lesson_result.issues:
                if issue not in all_issues:
                    all_issues.append(issue)
            for rec in lesson_result.recommendations:
                if rec not in all_recommendations:
                    all_recommendations.append(rec)

        fk_grade = readability.readability_score or 0.0

        return ContentValidationReport(
            is_valid=is_safe and is_grade_appropriate and len(all_issues) == 0,
            is_safe=is_safe,
            is_grade_appropriate=is_grade_appropriate,
            readability_grade=fk_grade,
            issues=all_issues,
            recommendations=all_recommendations,
        )


# ---------------------------------------------------------------------------
# Prompt hardening utility
# ---------------------------------------------------------------------------


def delimit_user_input(text: str) -> str:
    """Wrap user input with delimiters to distinguish it from LLM instructions.

    Use when interpolating user-provided text into prompt templates.
    """
    return f"<<<{text}>>>"


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

content_validator = ContentValidator()
