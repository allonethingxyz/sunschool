"""
Content Validation Service

Validates AI-generated content for grade-appropriateness, safety, and quality.
Ported from v1 TypeScript (content-validator.ts, lesson-validator.ts, prompt-safety.ts)
and extended for the v2 validation pipeline.

Usage:
    from app.services.content_validator import validate_response, ValidationResult

    result = validate_response("Lesson text here...", grade_level=3)
    if not result.passed:
        for issue in result.errors:
            print(f"BLOCKED: {issue}")

Pipeline stages:
    1. Safety checks (banned topics, prompt injection, PII)
    2. Quality checks (placeholders, stubs, minimum length)
    3. Grade-appropriate readability (Flesch-Kincaid, sentence length, vocabulary)
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class Severity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class ValidationIssue:
    message: str
    severity: Severity
    category: str  # "safety", "quality", "readability"


@dataclass
class ValidationResult:
    """Result of the content validation pipeline."""

    passed: bool
    issues: list[ValidationIssue] = field(default_factory=list)
    readability_score: float | None = None

    @property
    def errors(self) -> list[str]:
        return [i.message for i in self.issues if i.severity == Severity.ERROR]

    @property
    def warnings(self) -> list[str]:
        return [i.message for i in self.issues if i.severity == Severity.WARNING]

    @property
    def infos(self) -> list[str]:
        return [i.message for i in self.issues if i.severity == Severity.INFO]


@dataclass
class QuizQuestion:
    text: str
    options: list[str]
    correct_index: int
    explanation: str | None = None


# ---------------------------------------------------------------------------
# Constants — grade bands & limits
# ---------------------------------------------------------------------------

# Average sentence-length limits by grade band (max avg words per sentence)
SENTENCE_LENGTH_LIMITS: dict[str, int] = {
    "K-2": 8,
    "3-5": 12,
    "6-8": 18,
    "9-12": 25,
}

# Maximum Flesch-Kincaid grade level allowed (with 1.5 grade buffer)
FK_GRADE_BUFFER = 1.5

# Minimum content lengths (characters)
MIN_LESSON_LENGTH = 100
MIN_QUIZ_QUESTION_LENGTH = 20

# Vocabulary flagged as too complex for lower grades
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
        # Academic connectors
        "subsequently", "furthermore", "nevertheless", "consequently",
        "therefore", "although", "whereas", "moreover",
        # Complex comparatives
        "relationship", "comparison", "similarity", "difference",
        "characteristic", "property", "attribute",
    ],
    "3-5": [
        # Advanced scientific terms
        "molecular", "cellular", "genetic", "heredity", "chromosomes",
        "proteins", "enzymes", "metabolism", "symbiosis", "mutualism",
        # Complex processes
        "respiration", "digestion", "circulation",
        "reproduction", "metamorphosis", "mitosis", "meiosis",
        # Advanced math
        "polynomial", "quadratic", "exponential", "logarithm",
        "derivative", "integral", "theorem", "proof",
    ],
}

# Max sentence words by individual grade (used for quiz question validation)
MAX_SENTENCE_WORDS_BY_GRADE: dict[int, int] = {
    0: 5, 1: 5, 2: 6,
    3: 8, 4: 8,
    5: 12, 6: 12,
    7: 15, 8: 15,
    9: 20, 10: 20, 11: 22, 12: 25,
}


# ---------------------------------------------------------------------------
# Safety — banned topics
# ---------------------------------------------------------------------------

BANNED_TOPIC_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE) for p in [
        # Violence
        r"\b(kill(ing)?|murder|shoot(ing)?|stab(bing)?|assault|weapon|gun|bomb)\b",
        r"\b(gore|blood(y)?|dismember|torture|massacre|execution)\b",
        # Sexual content
        r"\b(sex(ual)?|porn(ography)?|erotic|nude|naked|genital|intercourse)\b",
        # Self-harm / suicide
        r"\b(suicid(e|al)|self[- ]harm|cut(ting)?\s+yourself|overdose)\b",
        # Substance abuse
        r"\b(drug\s+use|cocaine|heroin|meth(amphetamine)?|marijuana\s+use)\b",
        # Hate / extremism
        r"\b(nazi|white\s+supremac|racial\s+slur|hate\s+crime|extremis[mt])\b",
        # Gambling
        r"\b(gambl(e|ing)|betting|casino|slot\s+machine)\b",
    ]
]

# ---------------------------------------------------------------------------
# Safety — prompt injection patterns (from v1 prompt-safety.ts)
# ---------------------------------------------------------------------------

INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE) for p in [
        r"ignore\s+(all\s+)?previous\s+instructions",
        r"ignore\s+(the\s+)?(above|system)\s+(prompt|instructions)",
        r"disregard\s+(all\s+)?prior",
        r"you\s+are\s+now\s+(a|an)\s+",
        r"new\s+instructions?\s*:",
        r"system\s*prompt\s*:",
        r"\bDAN\b.*\bmode\b",
        r"do\s+anything\s+now",
        r"\bjailbreak\b",
        r"bypass\s+(safety|content|filter)",
        r"\bprocess\.env\b",
        r"\beval\s*\(",
        r"<script",
        r"\$\{.*\}",
        r"\bprompt\s*leak\b",
        r"\bexfiltrate\b",
        r"\bsudo\b",
        r"\brm\s+-rf\b",
        r"\bpassword\b.*\bshow\b",
        r"\bapi[_\s]?key\b",
        r"\bsecret\b.*\btoken\b",
        r"act\s+as\s+(a|an)\s+",
        r"pretend\s+(to\s+be|you'?re)\s+",
        r"roleplay\s+as\s+",
        r"\bformat:\s*json\b",
        r"respond\s+with\s+(only|just)\s+",
        r"output\s+(only|just)\s+",
    ]
]

# ---------------------------------------------------------------------------
# Safety — PII detection
# ---------------------------------------------------------------------------

PII_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("phone number", re.compile(
        r"\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b"
    )),
    ("email address", re.compile(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
    )),
    ("street address", re.compile(
        r"\b\d{1,5}\s+\w+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b",
        re.IGNORECASE,
    )),
    ("SSN", re.compile(
        r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b"
    )),
]

# ---------------------------------------------------------------------------
# Quality — placeholder / stub detection
# ---------------------------------------------------------------------------

PLACEHOLDER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p, re.IGNORECASE) for p in [
        r"\blorem\s+ipsum\b",
        r"\[insert\s+here\]",
        r"\bTODO\b",
        r"\bFIXME\b",
        r"\bXXX\b",
        r"\[placeholder\]",
        r"\[fill\s+in\]",
        r"^This is a lesson about\s",
        r"^What is this lesson about\?$",
        r"^Let's learn about .+ together!$",
        r"^Today we're going to learn about\s",
        r"\.\.\.\s*$",  # Trailing ellipsis (lazy stub)
    ]
]


# ---------------------------------------------------------------------------
# Readability helpers
# ---------------------------------------------------------------------------

def _count_syllables(word: str) -> int:
    """Count syllables in a word (simplified algorithm, ported from v1)."""
    word = re.sub(r"[^a-z]", "", word.lower())
    if len(word) <= 3:
        return 1

    vowel_groups = re.findall(r"[aeiouy]+", word)
    count = len(vowel_groups) if vowel_groups else 1

    # Silent e
    if word.endswith("e"):
        count -= 1

    # -le ending preceded by a consonant
    if word.endswith("le") and len(word) > 2 and word[-3] not in "aeiouy":
        count += 1

    return max(count, 1)


def flesch_kincaid_grade(text: str) -> float:
    """
    Flesch-Kincaid Grade Level.
    Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
    """
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    words = [w for w in re.split(r"\s+", text) if w]

    if not sentences or not words:
        return 0.0

    total_syllables = sum(_count_syllables(w) for w in words)
    words_per_sentence = len(words) / len(sentences)
    syllables_per_word = total_syllables / len(words)

    return 0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59


def _grade_to_band(grade_level: int) -> str:
    """Map a numeric grade (0-12) to a grade band string."""
    if grade_level <= 2:
        return "K-2"
    elif grade_level <= 5:
        return "3-5"
    elif grade_level <= 8:
        return "6-8"
    else:
        return "9-12"


def _avg_sentence_length(text: str) -> float:
    """Average number of words per sentence."""
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    if not sentences:
        return 0.0
    total_words = sum(len(s.split()) for s in sentences)
    return total_words / len(sentences)


# ---------------------------------------------------------------------------
# Individual check functions
# ---------------------------------------------------------------------------

def _check_safety(text: str) -> list[ValidationIssue]:
    """Run all safety checks: banned topics, injection, PII."""
    issues: list[ValidationIssue] = []

    # Banned topics
    for pattern in BANNED_TOPIC_PATTERNS:
        match = pattern.search(text)
        if match:
            issues.append(ValidationIssue(
                message=f"Banned topic detected: '{match.group()}'",
                severity=Severity.ERROR,
                category="safety",
            ))

    # Prompt injection
    for pattern in INJECTION_PATTERNS:
        match = pattern.search(text)
        if match:
            issues.append(ValidationIssue(
                message=f"Prompt injection pattern detected: '{match.group()[:50]}'",
                severity=Severity.ERROR,
                category="safety",
            ))

    # PII detection
    for pii_type, pattern in PII_PATTERNS:
        match = pattern.search(text)
        if match:
            issues.append(ValidationIssue(
                message=f"Possible {pii_type} detected in generated content",
                severity=Severity.ERROR,
                category="safety",
            ))

    return issues


def _check_quality(
    text: str,
    content_type: Literal["lesson", "quiz_question"] = "lesson",
) -> list[ValidationIssue]:
    """Check for placeholder text, stubs, and minimum length."""
    issues: list[ValidationIssue] = []

    # Placeholder / stub detection
    for pattern in PLACEHOLDER_PATTERNS:
        match = pattern.search(text)
        if match:
            issues.append(ValidationIssue(
                message=f"Placeholder text detected: '{match.group()[:40]}'",
                severity=Severity.ERROR,
                category="quality",
            ))

    # Empty / too short
    stripped = text.strip()
    if not stripped:
        issues.append(ValidationIssue(
            message="Content is empty",
            severity=Severity.ERROR,
            category="quality",
        ))
        return issues  # No point checking further

    min_len = MIN_LESSON_LENGTH if content_type == "lesson" else MIN_QUIZ_QUESTION_LENGTH
    if len(stripped) < min_len:
        issues.append(ValidationIssue(
            message=f"Content too short ({len(stripped)} chars, minimum {min_len})",
            severity=Severity.ERROR,
            category="quality",
        ))

    return issues


def _check_readability(text: str, grade_level: int) -> tuple[list[ValidationIssue], float]:
    """Validate Flesch-Kincaid score, sentence length, and vocabulary for grade."""
    issues: list[ValidationIssue] = []
    band = _grade_to_band(grade_level)

    # Flesch-Kincaid
    fk_score = flesch_kincaid_grade(text)
    max_fk = grade_level + FK_GRADE_BUFFER
    if fk_score > max_fk:
        issues.append(ValidationIssue(
            message=(
                f"Readability too advanced: Flesch-Kincaid grade {fk_score:.1f} "
                f"(max {max_fk:.1f} for grade {grade_level})"
            ),
            severity=Severity.WARNING,
            category="readability",
        ))

    # Average sentence length
    avg_len = _avg_sentence_length(text)
    limit = SENTENCE_LENGTH_LIMITS.get(band, 25)
    if avg_len > limit:
        issues.append(ValidationIssue(
            message=(
                f"Average sentence length {avg_len:.1f} words exceeds "
                f"{limit}-word limit for {band}"
            ),
            severity=Severity.WARNING,
            category="readability",
        ))

    # Individual long sentences
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    long_count = sum(1 for s in sentences if len(s.split()) > limit * 1.5)
    if long_count > 0:
        issues.append(ValidationIssue(
            message=f"{long_count} sentence(s) significantly exceed grade-level length limit",
            severity=Severity.INFO,
            category="readability",
        ))

    # Vocabulary complexity
    banned = GRADE_BANNED_WORDS.get(band, [])
    if banned:
        text_lower = text.lower()
        found = [w for w in banned if w in text_lower]
        if found:
            severity = Severity.WARNING if len(found) <= 3 else Severity.ERROR
            issues.append(ValidationIssue(
                message=(
                    f"Vocabulary above grade level for {band}: "
                    f"{', '.join(found[:5])}"
                    f"{' (and more)' if len(found) > 5 else ''}"
                ),
                severity=severity,
                category="readability",
            ))

    return issues, fk_score


# ---------------------------------------------------------------------------
# Quiz-specific validation
# ---------------------------------------------------------------------------

def validate_quiz_question(question: QuizQuestion, grade_level: int) -> list[ValidationIssue]:
    """Validate a single quiz question for structure, safety, and grade-appropriateness."""
    issues: list[ValidationIssue] = []

    # Text must exist and meet minimum length
    if not question.text or len(question.text.strip()) < MIN_QUIZ_QUESTION_LENGTH:
        issues.append(ValidationIssue(
            message=f"Quiz question too short ({len(question.text.strip()) if question.text else 0} chars)",
            severity=Severity.ERROR,
            category="quality",
        ))

    # Must have at least 2 options
    if not question.options or len(question.options) < 2:
        issues.append(ValidationIssue(
            message=f"Quiz question must have at least 2 options, got {len(question.options) if question.options else 0}",
            severity=Severity.ERROR,
            category="quality",
        ))
        return issues  # Can't validate further without options

    # Exactly one correct answer (valid index)
    if not (0 <= question.correct_index < len(question.options)):
        issues.append(ValidationIssue(
            message=f"Invalid correct_index {question.correct_index} for {len(question.options)} options",
            severity=Severity.ERROR,
            category="quality",
        ))

    # Check for duplicate options
    option_texts = [o.strip().lower() for o in question.options]
    if len(set(option_texts)) != len(option_texts):
        issues.append(ValidationIssue(
            message="Quiz question has duplicate answer options",
            severity=Severity.ERROR,
            category="quality",
        ))

    # Safety on question + options
    all_text = question.text + " " + " ".join(question.options)
    issues.extend(_check_safety(all_text))

    # Readability on question text
    max_words = MAX_SENTENCE_WORDS_BY_GRADE.get(grade_level, 15)
    q_words = len(question.text.split())
    if q_words > max_words:
        issues.append(ValidationIssue(
            message=f"Question too long: {q_words} words (max {max_words} for grade {grade_level})",
            severity=Severity.WARNING,
            category="readability",
        ))

    # Check option lengths for lower grades
    for idx, option in enumerate(question.options):
        opt_words = len(option.split())
        if opt_words > max_words:
            issues.append(ValidationIssue(
                message=f"Answer option {idx + 1} too long: {opt_words} words",
                severity=Severity.WARNING,
                category="readability",
            ))

    # Multi-part question check for young grades
    if grade_level <= 4 and " and " in question.text and "?" in question.text:
        parts = re.split(r"\s+and\s+", question.text, flags=re.IGNORECASE)
        if len(parts) > 2:
            issues.append(ValidationIssue(
                message="Multi-part question too complex for this grade level",
                severity=Severity.WARNING,
                category="readability",
            ))

    return issues


# ---------------------------------------------------------------------------
# Main validation pipeline
# ---------------------------------------------------------------------------

def validate_response(
    text: str,
    grade_level: int,
    content_type: Literal["lesson", "quiz_question"] = "lesson",
) -> ValidationResult:
    """
    Full validation pipeline for AI-generated content.

    Runs safety → quality → readability checks in order.
    Returns a ValidationResult with pass/fail, categorized issues, and FK score.

    On error-severity issues: response should be BLOCKED.
    On warning-severity issues: response may be sent but FLAGGED.
    """
    all_issues: list[ValidationIssue] = []

    # 1. Safety checks (errors block immediately)
    safety_issues = _check_safety(text)
    all_issues.extend(safety_issues)

    # 2. Quality checks
    quality_issues = _check_quality(text, content_type)
    all_issues.extend(quality_issues)

    # 3. Readability checks
    readability_issues, fk_score = _check_readability(text, grade_level)
    all_issues.extend(readability_issues)

    # Determine pass/fail: any ERROR → fail
    has_errors = any(i.severity == Severity.ERROR for i in all_issues)

    if all_issues:
        level = "ERROR" if has_errors else "WARNING"
        logger.info(
            "Content validation %s: %d issue(s) [grade=%d, type=%s]",
            level, len(all_issues), grade_level, content_type,
        )
        for issue in all_issues:
            logger.debug("  [%s/%s] %s", issue.severity.value, issue.category, issue.message)

    return ValidationResult(
        passed=not has_errors,
        issues=all_issues,
        readability_score=fk_score,
    )


def validate_quiz(
    questions: list[QuizQuestion],
    grade_level: int,
) -> ValidationResult:
    """Validate a list of quiz questions. Aggregates all issues."""
    all_issues: list[ValidationIssue] = []
    fk_scores: list[float] = []

    for idx, q in enumerate(questions):
        q_issues = validate_quiz_question(q, grade_level)
        # Prefix each issue message with question number
        for issue in q_issues:
            issue.message = f"Q{idx + 1}: {issue.message}"
        all_issues.extend(q_issues)

        # FK score on question text
        if q.text:
            fk_scores.append(flesch_kincaid_grade(q.text))

    has_errors = any(i.severity == Severity.ERROR for i in all_issues)
    avg_fk = sum(fk_scores) / len(fk_scores) if fk_scores else None

    return ValidationResult(
        passed=not has_errors,
        issues=all_issues,
        readability_score=avg_fk,
    )


def validate_lesson_structure(
    title: str | None,
    sections: list[dict] | None,
    questions: list[dict] | None,
) -> ValidationResult:
    """
    Structural validation for a full lesson spec.
    Ported from v1 lesson-validator.ts.

    Checks:
    - Title exists and is non-empty
    - At least 2 sections with sufficient content
    - At least 2 questions with valid structure
    - No placeholder content
    """
    issues: list[ValidationIssue] = []

    # Title
    if not title or not title.strip():
        issues.append(ValidationIssue(
            message="Lesson missing title",
            severity=Severity.ERROR,
            category="quality",
        ))

    # Sections
    if not sections or len(sections) < 2:
        issues.append(ValidationIssue(
            message=f"Lesson has {len(sections) if sections else 0} sections, need at least 2",
            severity=Severity.ERROR,
            category="quality",
        ))
    else:
        for idx, section in enumerate(sections):
            content = section.get("content", "")
            sec_title = section.get("title", f"Section {idx}")
            if not content or len(content.strip()) < 10:
                issues.append(ValidationIssue(
                    message=f"Section '{sec_title}' has insufficient content ({len(content.strip()) if content else 0} chars)",
                    severity=Severity.ERROR,
                    category="quality",
                ))
            # Check for placeholders in section content
            for pattern in PLACEHOLDER_PATTERNS:
                if content and pattern.search(content):
                    issues.append(ValidationIssue(
                        message=f"Section '{sec_title}' contains placeholder text",
                        severity=Severity.ERROR,
                        category="quality",
                    ))
                    break

    # Questions
    if not questions or len(questions) < 2:
        issues.append(ValidationIssue(
            message=f"Lesson has {len(questions) if questions else 0} questions, need at least 2",
            severity=Severity.ERROR,
            category="quality",
        ))
    else:
        for idx, q_dict in enumerate(questions):
            text = q_dict.get("text", "")
            options = q_dict.get("options", [])
            correct_index = q_dict.get("correctIndex", q_dict.get("correct_index", -1))

            if not text or not text.strip():
                issues.append(ValidationIssue(
                    message=f"Question {idx + 1} has empty text",
                    severity=Severity.ERROR,
                    category="quality",
                ))
            if not options or len(options) < 2:
                issues.append(ValidationIssue(
                    message=f"Question {idx + 1} has {len(options) if options else 0} options, need at least 2",
                    severity=Severity.ERROR,
                    category="quality",
                ))
            elif not (0 <= correct_index < len(options)):
                issues.append(ValidationIssue(
                    message=f"Question {idx + 1} has invalid correct_index {correct_index}",
                    severity=Severity.ERROR,
                    category="quality",
                ))

    has_errors = any(i.severity == Severity.ERROR for i in issues)
    return ValidationResult(passed=not has_errors, issues=issues)


# ---------------------------------------------------------------------------
# Input validation (for user-provided text going into LLM prompts)
# ---------------------------------------------------------------------------

# Safe characters for topic/subject input
_SAFE_TOPIC_PATTERN = re.compile(r"^[\w\s\-().,&'+:;!?/]{1,200}$", re.UNICODE)


def validate_topic_input(text: str) -> tuple[bool, str | None, str]:
    """
    Validate user-provided topic/subject text before it enters an LLM prompt.

    Returns: (safe, reason_if_unsafe, sanitized_text)
    """
    if not text or not isinstance(text, str):
        return False, "Input is required", ""

    trimmed = text.strip()
    if not trimmed:
        return False, "Input is empty", ""

    if len(trimmed) > 200:
        return False, "Input exceeds 200 character limit", ""

    # Check injection patterns
    for pattern in INJECTION_PATTERNS:
        if pattern.search(trimmed):
            logger.warning("Injection pattern in topic input: '%.50s...'", trimmed)
            return False, "Input contains disallowed patterns", ""

    # Character whitelist
    if not _SAFE_TOPIC_PATTERN.match(trimmed):
        logger.warning("Invalid characters in topic input: '%.50s...'", trimmed)
        return False, "Input contains invalid characters", ""

    return True, None, trimmed


def delimit_user_input(text: str) -> str:
    """Wrap user input with delimiters for safe LLM prompt interpolation."""
    return f"<<<{text}>>>"
