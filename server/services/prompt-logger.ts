import { pool } from '../db';

interface PromptLogEntry {
  lessonId?: string;
  learnerId?: number;
  promptType: string;
  systemMessage: string;
  userMessage: string;
  model: string;
  temperature?: number;
  responsePreview?: string;
  tokensUsed?: number;
}

export function logPrompt(entry: PromptLogEntry): void {
  // Fire-and-forget — don't block the response
  const id = crypto.randomUUID();
  pool.query(
    `INSERT INTO prompt_log (id, lesson_id, learner_id, prompt_type, system_message, user_message, model, temperature, response_preview, tokens_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, entry.lessonId || null, entry.learnerId || null, entry.promptType, entry.systemMessage, entry.userMessage, entry.model, entry.temperature || null, entry.responsePreview || null, entry.tokensUsed || null]
  ).catch(err => console.error('[PromptLogger] Failed to log prompt:', err));
}
