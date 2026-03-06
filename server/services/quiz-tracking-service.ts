/**
 * Quiz Tracking Service
 *
 * Stores individual quiz answers with concept tagging and question hashing
 * for analytics, deduplication, and adaptive learning
 */

import crypto from 'crypto';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface QuizAnswer {
  id?: string;
  learnerId: number;
  lessonId: string;
  questionIndex: number;
  questionText: string;
  questionHash: string;
  userAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
  conceptTags: string[];
  answeredAt?: Date;
}

export interface QuizQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

/**
 * Generate SHA-256 hash of question text for deduplication
 */
export function hashQuestion(questionText: string): string {
  return crypto
    .createHash('sha256')
    .update(questionText.toLowerCase().trim())
    .digest('hex');
}

/**
 * Extract concept tags from question text and options
 * Uses simple keyword matching - can be enhanced with NLP
 */
export function extractConceptTags(
  question: QuizQuestion,
  subject: string
): string[] {
  const text = `${question.text} ${question.options.join(' ')}`.toLowerCase();
  const tags: Set<string> = new Set();

  // Add subject as primary tag
  tags.add(subject.toLowerCase());

  // Math concepts
  if (text.match(/\b(add|addition|plus|sum)\b/)) tags.add('addition');
  if (text.match(/\b(subtract|subtraction|minus|difference)\b/)) tags.add('subtraction');
  if (text.match(/\b(multiply|multiplication|times|product)\b/)) tags.add('multiplication');
  if (text.match(/\b(divide|division|split|quotient)\b/)) tags.add('division');
  if (text.match(/\b(fraction|half|quarter|third)\b/)) tags.add('fractions');
  if (text.match(/\b(count|counting|number|how many)\b/)) tags.add('counting');

  // Science concepts
  if (text.match(/\b(plant|plants|grow|seed|leaf)\b/)) tags.add('plants');
  if (text.match(/\b(animal|animals|bird|fish|mammal)\b/)) tags.add('animals');
  if (text.match(/\b(water|liquid|solid|gas|ice|steam)\b/)) tags.add('states-of-matter');
  if (text.match(/\b(hot|cold|heat|temperature|warm)\b/)) tags.add('temperature');
  if (text.match(/\b(light|dark|shadow|sun)\b/)) tags.add('light');
  if (text.match(/\b(sound|hear|loud|quiet|noise)\b/)) tags.add('sound');

  // Reading/Language concepts
  if (text.match(/\b(letter|alphabet|word|spell)\b/)) tags.add('letters');
  if (text.match(/\b(read|reading|story|book)\b/)) tags.add('reading');
  if (text.match(/\b(write|writing|sentence)\b/)) tags.add('writing');
  if (text.match(/\b(rhyme|rhyming|sound)\b/)) tags.add('phonics');

  // General cognitive skills
  if (text.match(/\b(color|red|blue|green|yellow)\b/)) tags.add('colors');
  if (text.match(/\b(shape|circle|square|triangle)\b/)) tags.add('shapes');
  if (text.match(/\b(big|small|large|tiny|size)\b/)) tags.add('size');
  if (text.match(/\b(compare|same|different|similar)\b/)) tags.add('comparison');

  return Array.from(tags);
}

/**
 * Store a single quiz answer
 */
export async function storeQuizAnswer(answer: QuizAnswer): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO quiz_answers (
        learner_id,
        lesson_id,
        question_index,
        question_text,
        question_hash,
        user_answer,
        correct_answer,
        is_correct,
        concept_tags,
        answered_at
      ) VALUES (
        ${answer.learnerId},
        ${answer.lessonId},
        ${answer.questionIndex},
        ${answer.questionText},
        ${answer.questionHash},
        ${answer.userAnswer},
        ${answer.correctAnswer},
        ${answer.isCorrect},
        ${sql`${`{${answer.conceptTags.join(',')}}`}::text[]`},
        ${answer.answeredAt || new Date()}
      )
    `);
  } catch (error) {
    console.error('Error storing quiz answer:', error);
    throw error;
  }
}

/**
 * Store all answers from a completed quiz
 */
export async function storeQuizAnswers(
  learnerId: number,
  lessonId: string,
  questions: QuizQuestion[],
  userAnswers: number[],
  subject: string
): Promise<void> {
  const answersToStore: QuizAnswer[] = questions.map((question, index) => {
    const questionHash = hashQuestion(question.text);
    const conceptTags = extractConceptTags(question, subject);
    const isCorrect = userAnswers[index] === question.correctIndex;

    return {
      learnerId,
      lessonId,
      questionIndex: index,
      questionText: question.text,
      questionHash,
      userAnswer: userAnswers[index],
      correctAnswer: question.correctIndex,
      isCorrect,
      conceptTags,
      answeredAt: new Date()
    };
  });

  // Store all answers
  for (const answer of answersToStore) {
    await storeQuizAnswer(answer);
  }
}

/**
 * Get recent quiz answers for a learner
 */
export async function getRecentAnswers(
  learnerId: number,
  limit: number = 50
): Promise<QuizAnswer[]> {
  try {
    const results = await db.execute(sql`
      SELECT *
      FROM quiz_answers
      WHERE learner_id = ${learnerId}
      ORDER BY answered_at DESC
      LIMIT ${limit}
    `);

    return results.rows as unknown as QuizAnswer[];
  } catch (error) {
    console.error('Error fetching recent answers:', error);
    return [];
  }
}

/**
 * Get answers for a specific concept
 */
export async function getAnswersForConcept(
  learnerId: number,
  concept: string
): Promise<QuizAnswer[]> {
  try {
    const results = await db.execute(sql`
      SELECT *
      FROM quiz_answers
      WHERE learner_id = ${learnerId}
        AND ${concept} = ANY(concept_tags)
      ORDER BY answered_at DESC
    `);

    return results.rows as unknown as QuizAnswer[];
  } catch (error) {
    console.error(`Error fetching answers for concept ${concept}:`, error);
    return [];
  }
}

/**
 * Get concept performance summary for a learner
 */
export async function getConceptPerformance(
  learnerId: number
): Promise<Record<string, { correct: number; total: number; accuracy: number }>> {
  try {
    const results = await db.execute(sql`
      SELECT
        UNNEST(concept_tags) as concept,
        COUNT(*) as total,
        SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct
      FROM quiz_answers
      WHERE learner_id = ${learnerId}
      GROUP BY concept
    `);

    const performance: Record<string, { correct: number; total: number; accuracy: number }> = {};

    for (const row of results.rows as any[]) {
      const correct = parseInt(row.correct || '0');
      const total = parseInt(row.total || '0');
      performance[row.concept] = {
        correct,
        total,
        accuracy: total > 0 ? correct / total : 0
      };
    }

    return performance;
  } catch (error) {
    console.error('Error calculating concept performance:', error);
    return {};
  }
}
