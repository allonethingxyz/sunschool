import { EnhancedLessonSpec } from '../../shared/schema';

const PLACEHOLDER_PATTERNS = [
  /^This is a lesson about /i,
  /^What is this lesson about\?$/i,
  /^Let's learn about .+ together!$/i,
  /^Today we're going to learn about /i,
];

/**
 * Validates that an EnhancedLessonSpec contains real content, not stubs.
 * Throws an Error describing what's wrong if validation fails.
 */
export function validateLessonSpec(spec: EnhancedLessonSpec): void {
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
