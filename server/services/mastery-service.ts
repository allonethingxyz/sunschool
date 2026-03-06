/**
 * Mastery Tracking Service
 *
 * Calculates and tracks learner mastery levels for individual concepts
 * Identifies concepts needing reinforcement for adaptive learning
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { getConceptPerformance } from './quiz-tracking-service';

export interface ConceptMastery {
  id?: string;
  learnerId: number;
  conceptName: string;
  subject: string;
  correctCount: number;
  totalCount: number;
  masteryLevel: number; // 0-100 integer
  lastTested: Date;
  needsReinforcement: boolean;
  createdAt?: Date;
}

const MASTERY_THRESHOLD = 70; // 70% accuracy for mastery (stored as 0-100 integer)

/**
 * Update or create mastery record for a concept
 */
export async function updateConceptMastery(
  learnerId: number,
  conceptName: string,
  subject: string,
  isCorrect: boolean
): Promise<void> {
  try {
    // Check if mastery record exists
    const existing = await db.execute(sql`
      SELECT * FROM concept_mastery
      WHERE learner_id = ${learnerId}
        AND concept_name = ${conceptName}
        AND subject = ${subject}
    `);

    if (existing.rows.length > 0) {
      // Update existing record
      const record = existing.rows[0] as any;
      const newCorrectCount = record.correct_count + (isCorrect ? 1 : 0);
      const newTotalCount = record.total_count + 1;
      const newMasteryLevel = newTotalCount > 0 ? Math.round((newCorrectCount / newTotalCount) * 100) : 0;
      const needsReinforcement = newMasteryLevel < MASTERY_THRESHOLD;

      await db.execute(sql`
        UPDATE concept_mastery
        SET
          correct_count = ${newCorrectCount},
          total_count = ${newTotalCount},
          mastery_level = ${newMasteryLevel},
          last_tested = NOW(),
          needs_reinforcement = ${needsReinforcement}
        WHERE learner_id = ${learnerId}
          AND concept_name = ${conceptName}
          AND subject = ${subject}
      `);
    } else {
      // Create new record
      const masteryLevel = isCorrect ? 100 : 0;
      const needsReinforcement = masteryLevel < MASTERY_THRESHOLD;

      await db.execute(sql`
        INSERT INTO concept_mastery (
          learner_id,
          concept_name,
          subject,
          correct_count,
          total_count,
          mastery_level,
          last_tested,
          needs_reinforcement
        ) VALUES (
          ${learnerId},
          ${conceptName},
          ${subject},
          ${isCorrect ? 1 : 0},
          1,
          ${masteryLevel},
          NOW(),
          ${needsReinforcement}
        )
      `);
    }
  } catch (error) {
    console.error(`Error updating mastery for concept ${conceptName}:`, error);
    throw error;
  }
}

/**
 * Update mastery for all concepts tested in a quiz
 */
export async function updateMasteryFromQuiz(
  learnerId: number,
  subject: string,
  conceptTags: string[],
  isCorrect: boolean
): Promise<void> {
  for (const concept of conceptTags) {
    await updateConceptMastery(learnerId, concept, subject, isCorrect);
  }
}

/**
 * Get all mastery records for a learner
 */
export async function getLearnerMastery(
  learnerId: number,
  subject?: string
): Promise<ConceptMastery[]> {
  try {
    let query;
    if (subject) {
      query = sql`
        SELECT * FROM concept_mastery
        WHERE learner_id = ${learnerId}
          AND subject = ${subject}
        ORDER BY mastery_level ASC, last_tested DESC
      `;
    } else {
      query = sql`
        SELECT * FROM concept_mastery
        WHERE learner_id = ${learnerId}
        ORDER BY subject, mastery_level ASC
      `;
    }

    const results = await db.execute(query);
    return results.rows.map(row => ({
      id: (row as any).id,
      learnerId: (row as any).learner_id,
      conceptName: (row as any).concept_name,
      subject: (row as any).subject,
      correctCount: (row as any).correct_count,
      totalCount: (row as any).total_count,
      masteryLevel: parseFloat((row as any).mastery_level),
      lastTested: new Date((row as any).last_tested),
      needsReinforcement: (row as any).needs_reinforcement,
      createdAt: (row as any).created_at ? new Date((row as any).created_at) : undefined
    }));
  } catch (error) {
    console.error('Error fetching learner mastery:', error);
    return [];
  }
}

/**
 * Get concepts that need reinforcement (mastery < 70%)
 */
export async function getConceptsNeedingReinforcement(
  learnerId: number,
  subject?: string,
  limit: number = 5
): Promise<ConceptMastery[]> {
  try {
    let query;
    if (subject) {
      query = sql`
        SELECT * FROM concept_mastery
        WHERE learner_id = ${learnerId}
          AND subject = ${subject}
          AND needs_reinforcement = true
        ORDER BY mastery_level ASC, last_tested ASC
        LIMIT ${limit}
      `;
    } else {
      query = sql`
        SELECT * FROM concept_mastery
        WHERE learner_id = ${learnerId}
          AND needs_reinforcement = true
        ORDER BY mastery_level ASC, last_tested ASC
        LIMIT ${limit}
      `;
    }

    const results = await db.execute(query);
    return results.rows.map(row => ({
      id: (row as any).id,
      learnerId: (row as any).learner_id,
      conceptName: (row as any).concept_name,
      subject: (row as any).subject,
      correctCount: (row as any).correct_count,
      totalCount: (row as any).total_count,
      masteryLevel: parseFloat((row as any).mastery_level),
      lastTested: new Date((row as any).last_tested),
      needsReinforcement: (row as any).needs_reinforcement,
      createdAt: (row as any).created_at ? new Date((row as any).created_at) : undefined
    }));
  } catch (error) {
    console.error('Error fetching concepts needing reinforcement:', error);
    return [];
  }
}

/**
 * Get mastery summary for a learner
 */
export async function getMasterySummary(
  learnerId: number
): Promise<{
  totalConcepts: number;
  masteredConcepts: number;
  needsReinforcementCount: number;
  averageMastery: number;
  bySubject: Record<string, { mastered: number; total: number; avgMastery: number }>;
}> {
  try {
    const allMastery = await getLearnerMastery(learnerId);

    const totalConcepts = allMastery.length;
    const masteredConcepts = allMastery.filter(m => m.masteryLevel >= MASTERY_THRESHOLD).length;
    const needsReinforcementCount = allMastery.filter(m => m.needsReinforcement).length;
    const averageMastery =
      totalConcepts > 0
        ? allMastery.reduce((sum, m) => sum + m.masteryLevel, 0) / totalConcepts
        : 0;

    // Calculate by subject
    const bySubject: Record<string, { mastered: number; total: number; avgMastery: number }> = {};
    for (const mastery of allMastery) {
      if (!bySubject[mastery.subject]) {
        bySubject[mastery.subject] = { mastered: 0, total: 0, avgMastery: 0 };
      }
      bySubject[mastery.subject].total++;
      if (mastery.masteryLevel >= MASTERY_THRESHOLD) {
        bySubject[mastery.subject].mastered++;
      }
      bySubject[mastery.subject].avgMastery += mastery.masteryLevel;
    }

    // Calculate averages
    for (const subject in bySubject) {
      bySubject[subject].avgMastery /= bySubject[subject].total;
    }

    return {
      totalConcepts,
      masteredConcepts,
      needsReinforcementCount,
      averageMastery,
      bySubject
    };
  } catch (error) {
    console.error('Error calculating mastery summary:', error);
    return {
      totalConcepts: 0,
      masteredConcepts: 0,
      needsReinforcementCount: 0,
      averageMastery: 0,
      bySubject: {}
    };
  }
}

/**
 * Bulk update mastery from quiz completion
 * This is the main function called after quiz submission
 */
export async function bulkUpdateMasteryFromAnswers(
  learnerId: number,
  subject: string,
  conceptsAndCorrectness: Array<{ concepts: string[]; isCorrect: boolean }>
): Promise<void> {
  for (const { concepts, isCorrect } of conceptsAndCorrectness) {
    await updateMasteryFromQuiz(learnerId, subject, concepts, isCorrect);
  }
}
