/**
 * Self-maintaining checks that can be run by cron, admin endpoint, or agent.
 * Each function detects a specific data integrity issue and optionally fixes it.
 */

import { pool } from "../db";

// ── Function A: Orphaned Image Detection ─────────────────────────────────────

export type OrphanedImagesResult = {
  orphanedCount: number;
  fixedCount: number;
  orphanedLessons: { id: string; subject: string | null; imageCount: number }[];
};

export async function detectOrphanedImages(fix = false): Promise<OrphanedImagesResult> {
  // Fetch all ACTIVE or DONE lessons that have a spec with images
  const { rows } = await pool.query(
    `SELECT id, subject, spec FROM lessons WHERE status IN ('ACTIVE', 'DONE') AND spec IS NOT NULL`
  );

  const orphanedLessons: OrphanedImagesResult["orphanedLessons"] = [];
  let fixedCount = 0;

  for (const row of rows) {
    const spec = typeof row.spec === "string" ? JSON.parse(row.spec) : row.spec;
    if (!spec || !Array.isArray(spec.images) || spec.images.length === 0) continue;

    // Check if ALL image entries have null/undefined/empty svgData AND null/undefined/empty base64Data
    const allOrphaned = spec.images.every(
      (img: any) => !img.svgData && !img.base64Data
    );

    if (allOrphaned) {
      orphanedLessons.push({
        id: row.id,
        subject: row.subject,
        imageCount: spec.images.length,
      });

      if (fix) {
        // Clear the broken image arrays so placeholders render instead
        spec.images = [];
        await pool.query(
          `UPDATE lessons SET spec = $1 WHERE id = $2`,
          [JSON.stringify(spec), row.id]
        );
        fixedCount++;
      }
    }
  }

  return {
    orphanedCount: orphanedLessons.length,
    fixedCount,
    orphanedLessons,
  };
}

// ── Function B: Partial Quiz Submission Detection ────────────────────────────

export type PartialQuizResult = {
  partialCount: number;
  details: { lessonId: string; expected: number; actual: number }[];
};

export async function detectPartialQuizSubmissions(fix = false): Promise<PartialQuizResult> {
  // Get all completed lessons with their spec (for question count)
  const { rows: doneLessons } = await pool.query(
    `SELECT id, spec FROM lessons WHERE status = 'DONE' AND spec IS NOT NULL`
  );

  // Get answer counts grouped by lesson_id for all DONE lessons
  const { rows: answerCounts } = await pool.query(
    `SELECT lesson_id, COUNT(*)::int AS answer_count FROM quiz_answers GROUP BY lesson_id`
  );
  const answerMap = new Map<string, number>();
  for (const row of answerCounts) {
    answerMap.set(row.lesson_id, row.answer_count);
  }

  const details: PartialQuizResult["details"] = [];

  for (const lesson of doneLessons) {
    const spec = typeof lesson.spec === "string" ? JSON.parse(lesson.spec) : lesson.spec;
    if (!spec || !Array.isArray(spec.questions)) continue;

    const expected = spec.questions.length;
    const actual = answerMap.get(lesson.id) ?? 0;

    if (actual < expected) {
      details.push({ lessonId: lesson.id, expected, actual });

      if (fix) {
        // Can't recover missing answers — just log the discrepancy
        console.warn(
          `[Maintenance] Partial quiz: lesson ${lesson.id} has ${actual}/${expected} answers`
        );
      }
    }
  }

  return {
    partialCount: details.length,
    details,
  };
}

// ── Function C: Points Balance Reconciliation ────────────────────────────────

export type PointsReconciliationResult = {
  mismatchCount: number;
  fixedCount: number;
  details: {
    learnerId: number;
    ledgerSum: number;
    recordedBalance: number;
    diff: number;
  }[];
};

export async function reconcilePointsBalances(fix = false): Promise<PointsReconciliationResult> {
  // Compare learner_points.current_balance against SUM of points_ledger entries
  const { rows } = await pool.query(`
    SELECT
      lp.learner_id,
      lp.current_balance,
      COALESCE(SUM(pl.amount), 0)::int AS ledger_sum
    FROM learner_points lp
    LEFT JOIN points_ledger pl ON pl.learner_id = lp.learner_id
    GROUP BY lp.learner_id, lp.current_balance
  `);

  const details: PointsReconciliationResult["details"] = [];
  let fixedCount = 0;

  for (const row of rows) {
    const learnerId = row.learner_id;
    const recordedBalance = parseInt(row.current_balance, 10);
    const ledgerSum = parseInt(row.ledger_sum, 10);
    const diff = ledgerSum - recordedBalance;

    if (Math.abs(diff) > 0) {
      details.push({ learnerId, ledgerSum, recordedBalance, diff });

      if (fix) {
        await pool.query(
          `UPDATE learner_points SET current_balance = $1 WHERE learner_id = $2`,
          [ledgerSum, learnerId]
        );
        fixedCount++;
      }
    }
  }

  return {
    mismatchCount: details.length,
    fixedCount,
    details,
  };
}
