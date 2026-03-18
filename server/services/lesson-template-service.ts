import crypto from 'crypto';
import type { EnhancedLessonSpec, LessonTemplate, InsertLessonTemplate } from '../../shared/schema';
import type { IStorage } from '../storage';

/**
 * Generate a deterministic hash for deduplication.
 * Normalizes subject/topic to lowercase, trims whitespace.
 */
export function computeContentHash(
  subject: string,
  gradeLevel: number,
  topic: string,
  difficulty: string
): string {
  const normalized = [
    subject.toLowerCase().trim(),
    String(gradeLevel),
    topic.toLowerCase().trim(),
    difficulty.toLowerCase().trim(),
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 64);
}

/**
 * Try to find an existing template before generating a new lesson.
 * Returns the template spec if found, null if generation is needed.
 */
export async function findOrCreateTemplate(
  storage: IStorage,
  subject: string,
  gradeLevel: number,
  topic: string,
  difficulty: string,
  generateFn: () => Promise<EnhancedLessonSpec>
): Promise<{ spec: EnhancedLessonSpec; templateId: string; wasGenerated: boolean }> {
  const hash = computeContentHash(subject, gradeLevel, topic, difficulty);

  // Check for existing template
  const existing = await storage.findTemplateByHash(hash);
  if (existing) {
    await storage.incrementTemplateServed(existing.id);
    console.log(`[Library] Reusing template ${existing.id} (${existing.title}), served ${existing.timesServed + 1} times`);
    return { spec: existing.spec, templateId: existing.id, wasGenerated: false };
  }

  // Generate new lesson
  const spec = await generateFn();

  // Store as template
  const template = await storage.createTemplate({
    contentHash: hash,
    subject,
    gradeLevel,
    topic,
    difficulty: difficulty as 'beginner' | 'intermediate' | 'advanced',
    spec,
    title: spec.title,
  });

  console.log(`[Library] Created new template ${template.id} (${spec.title})`);
  return { spec, templateId: template.id, wasGenerated: true };
}
