/**
 * Question Deduplication Service
 *
 * Prevents exact duplicate questions from appearing multiple times
 * Enables spaced repetition by allowing variations after time/concept gaps
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { hashQuestion } from './quiz-tracking-service';

export interface QuestionHistory {
  id?: number;
  learnerId: string;
  topic: string;
  questionHash: string;
  createdAt?: Date;
}

/**
 * Store question hash in history table to prevent future duplicates
 */
export async function storeQuestionHash(
  learnerId: number,
  topic: string,
  questionHash: string
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO questions_history (learner_id, topic, question_hash, created_at)
      VALUES (${learnerId.toString()}, ${topic}, ${questionHash}, NOW())
      ON CONFLICT (learner_id, topic, question_hash) DO NOTHING
    `);
  } catch (error) {
    console.error('Error storing question hash:', error);
    // Don't throw - deduplication is non-critical
  }
}

/**
 * Store multiple question hashes from a quiz
 */
export async function storeQuestionHashes(
  learnerId: number,
  topic: string,
  questions: Array<{ text: string }>
): Promise<void> {
  for (const question of questions) {
    const questionHash = hashQuestion(question.text);
    await storeQuestionHash(learnerId, topic, questionHash);
  }
}

/**
 * Get recent question texts that learner has seen (to avoid in prompts)
 */
export async function getRecentQuestions(
  learnerId: number,
  topic?: string,
  limit: number = 50
): Promise<string[]> {
  try {
    // Get recent question hashes
    let query;
    if (topic) {
      query = sql`
        SELECT DISTINCT qa.question_text
        FROM quiz_answers qa
        WHERE qa.learner_id = ${learnerId}
          AND qa.answered_at > NOW() - INTERVAL '30 days'
        ORDER BY qa.answered_at DESC
        LIMIT ${limit}
      `;
    } else {
      query = sql`
        SELECT DISTINCT qa.question_text
        FROM quiz_answers qa
        WHERE qa.learner_id = ${learnerId}
          AND qa.answered_at > NOW() - INTERVAL '30 days'
        ORDER BY qa.answered_at DESC
        LIMIT ${limit}
      `;
    }

    const results = await db.execute(query);
    return results.rows.map((row: any) => row.question_text);
  } catch (error) {
    console.error('Error fetching recent questions:', error);
    return [];
  }
}

/**
 * Check if a question hash has been seen before
 */
export async function hasSeenQuestion(
  learnerId: number,
  questionHash: string
): Promise<boolean> {
  try {
    const results = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM questions_history
      WHERE learner_id = ${learnerId.toString()}
        AND question_hash = ${questionHash}
    `);

    const count = parseInt((results.rows[0] as any)?.count || '0');
    return count > 0;
  } catch (error) {
    console.error('Error checking question history:', error);
    return false;
  }
}

/**
 * Get question avoidance prompt instructions for LLM
 * This creates a prompt addition that tells the LLM which questions to avoid
 */
export async function getAvoidanceInstructions(
  learnerId: number,
  topic?: string
): Promise<string> {
  const recentQuestions = await getRecentQuestions(learnerId, topic, 20);

  if (recentQuestions.length === 0) {
    return '';
  }

  const instructions = `
IMPORTANT: AVOID EXACT DUPLICATES

The learner has recently seen these questions. DO NOT ask these exact questions again:

${recentQuestions.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

Instead:
- Create NEW questions that test the SAME concepts
- Use DIFFERENT scenarios, numbers, or examples
- Change the wording while keeping the same difficulty level
- You can test the same concept with fresh variations

Example:
- Seen before: "Is water wet?"
- Good variation: "Can you feel water?"
- Good variation: "Does water make things wet?"
- Bad: "Is water wet?" (exact duplicate)
`;

  return instructions;
}

/**
 * Clean up old question history (optional maintenance task)
 * Removes questions older than 90 days to allow spaced repetition
 */
export async function cleanupOldHistory(daysToKeep: number = 90): Promise<number> {
  try {
    const result = await db.execute(sql`
      DELETE FROM questions_history
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
    `);

    const deletedCount = (result as any).rowCount || 0;
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up question history:', error);
    return 0;
  }
}

/**
 * Get statistics about question history for a learner
 */
export async function getDeduplicationStats(
  learnerId: number
): Promise<{
  totalQuestionsSeen: number;
  uniqueQuestions: number;
  recentQuestions: number;
  oldestQuestion: Date | null;
}> {
  try {
    const totalResults = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM quiz_answers
      WHERE learner_id = ${learnerId}
    `);

    const uniqueResults = await db.execute(sql`
      SELECT COUNT(DISTINCT question_hash) as count
      FROM quiz_answers
      WHERE learner_id = ${learnerId}
    `);

    const recentResults = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM quiz_answers
      WHERE learner_id = ${learnerId}
        AND answered_at > NOW() - INTERVAL '30 days'
    `);

    const oldestResults = await db.execute(sql`
      SELECT MIN(answered_at) as oldest
      FROM quiz_answers
      WHERE learner_id = ${learnerId}
    `);

    return {
      totalQuestionsSeen: parseInt((totalResults.rows[0] as any)?.count || '0'),
      uniqueQuestions: parseInt((uniqueResults.rows[0] as any)?.count || '0'),
      recentQuestions: parseInt((recentResults.rows[0] as any)?.count || '0'),
      oldestQuestion: (oldestResults.rows[0] as any)?.oldest
        ? new Date((oldestResults.rows[0] as any).oldest)
        : null
    };
  } catch (error) {
    console.error('Error fetching deduplication stats:', error);
    return {
      totalQuestionsSeen: 0,
      uniqueQuestions: 0,
      recentQuestions: 0,
      oldestQuestion: null
    };
  }
}
