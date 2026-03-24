import { EnhancedLessonSpec, lessonValidationLog } from '../../shared/schema';
import { db } from '../db';

const PLACEHOLDER_PATTERNS = [
  /^This is a lesson about /i,
  /^What is this lesson about\?$/i,
  /^Let's learn about .+ together!$/i,
  /^Today we're going to learn about /i,
];

/**
 * Log a validation result (pass or fail) to the lesson_validation_log table.
 * Runs in the background — never throws.
 */
function logValidationResult(opts: {
  subject?: string;
  topic?: string;
  gradeLevel?: number;
  model?: string;
  passed: boolean;
  rejectionReason?: string;
  specSnapshot?: unknown;
}) {
  // Fire-and-forget — do not await in the hot path
  db.insert(lessonValidationLog)
    .values({
      subject: opts.subject ?? null,
      topic: opts.topic ?? null,
      gradeLevel: opts.gradeLevel ?? null,
      model: opts.model ?? null,
      passed: opts.passed,
      rejectionReason: opts.rejectionReason ?? null,
      specSnapshot: opts.specSnapshot ?? null,
    })
    .execute()
    .catch((err: unknown) => {
      console.error('[ValidationLog] Failed to write validation log:', err);
    });
}

/**
 * Validates that an EnhancedLessonSpec contains real content, not stubs.
 * Throws an Error describing what's wrong if validation fails.
 *
 * Optionally pass context (subject, topic, gradeLevel, model) so that the
 * result is persisted in the lesson_validation_log table for analytics.
 */
export function validateLessonSpec(
  spec: EnhancedLessonSpec,
  context?: {
    subject?: string;
    topic?: string;
    gradeLevel?: number;
    model?: string;
  },
): void {
  try {
    validateLessonSpecInner(spec);

    // Passed — log success
    if (context) {
      logValidationResult({
        ...context,
        passed: true,
      });
    }
  } catch (err) {
    // Failed — log failure with the rejection reason and spec snapshot
    const reason = err instanceof Error ? err.message : String(err);
    if (context) {
      logValidationResult({
        ...context,
        passed: false,
        rejectionReason: reason,
        specSnapshot: spec,
      });
    }
    throw err;
  }
}

/**
 * Core validation logic (no logging side-effects).
 */
function validateLessonSpecInner(spec: EnhancedLessonSpec): void {
  if (!spec) {
    throw new Error('Spec is null or undefined');
  }

  if (!spec.title || spec.title.trim().length === 0) {
    throw new Error('Spec missing title');
  }

  // Must have at least 2 sections
  if (!spec.sections || spec.sections.length < 2) {
    throw new Error(`Spec has ${spec.sections?.length ?? 0} sections, need at least 2`);
  }

  // Must have at least 2 questions
  if (!spec.questions || spec.questions.length < 2) {
    throw new Error(`Spec has ${spec.questions?.length ?? 0} questions, need at least 2`);
  }

  // Validate each question
  for (let i = 0; i < spec.questions.length; i++) {
    const q = spec.questions[i];
    if (!q.text || q.text.trim().length === 0) {
      throw new Error(`Question ${i} has empty text`);
    }
    if (!q.options || q.options.length < 2) {
      throw new Error(`Question ${i} has ${q.options?.length ?? 0} options, need at least 2`);
    }
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      throw new Error(`Question ${i} has invalid correctIndex ${q.correctIndex}`);
    }

    // Reject placeholder question text
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(q.text)) {
        throw new Error(`Question ${i} contains placeholder text: "${q.text}"`);
      }
    }
  }

  // Reject placeholder content in sections
  for (let i = 0; i < spec.sections.length; i++) {
    const section = spec.sections[i];
    if (!section.content || section.content.trim().length < 10) {
      throw new Error(`Section ${i} ("${section.title}") has insufficient content`);
    }
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(section.content)) {
        throw new Error(`Section ${i} contains placeholder content`);
      }
    }
  }
}
