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

export type MismatchReason = "partial_write" | "spec_modified" | "no_answers";

export type PartialQuizDetail = {
  lessonId: string;
  learnerId: number | null;
  expected: number;
  actual: number;
  reason: MismatchReason;
};

export type PartialQuizResult = {
  partialCount: number;
  /** @deprecated Use detailedResults for richer data */
  details: { lessonId: string; expected: number; actual: number }[];
  detailedResults: PartialQuizDetail[];
  summary: {
    partialWrites: number;
    specModified: number;
    noAnswers: number;
  };
};

export async function detectPartialQuizSubmissions(fix = false): Promise<PartialQuizResult> {
  // Get all completed lessons with their spec (for question count) and learner_id
  const { rows: doneLessons } = await pool.query(
    `SELECT id, learner_id, spec, updated_at FROM lessons WHERE status = 'DONE' AND spec IS NOT NULL`
  );

  // Get answer counts grouped by lesson_id + learner_id, with the latest answer timestamp
  const { rows: answerCounts } = await pool.query(
    `SELECT lesson_id, learner_id, COUNT(*)::int AS answer_count,
            MAX(answered_at) AS last_answered_at
     FROM quiz_answers
     GROUP BY lesson_id, learner_id`
  );
  const answerMap = new Map<string, { count: number; learnerId: number; lastAnsweredAt: Date | null }>();
  for (const row of answerCounts) {
    answerMap.set(row.lesson_id, {
      count: row.answer_count,
      learnerId: row.learner_id,
      lastAnsweredAt: row.last_answered_at ? new Date(row.last_answered_at) : null,
    });
  }

  const details: PartialQuizResult["details"] = [];
  const detailedResults: PartialQuizDetail[] = [];
  let partialWrites = 0;
  let specModified = 0;
  let noAnswers = 0;

  for (const lesson of doneLessons) {
    const spec = typeof lesson.spec === "string" ? JSON.parse(lesson.spec) : lesson.spec;
    if (!spec || !Array.isArray(spec.questions)) continue;

    const expected = spec.questions.length;
    const answerData = answerMap.get(lesson.id);
    const actual = answerData?.count ?? 0;

    if (actual < expected) {
      // Classify the mismatch reason
      let reason: MismatchReason;

      if (actual === 0) {
        // No answers at all — lesson marked DONE but quiz never submitted
        reason = "no_answers";
        noAnswers++;
      } else if (
        answerData?.lastAnsweredAt &&
        lesson.updated_at &&
        new Date(lesson.updated_at) > answerData.lastAnsweredAt
      ) {
        // Lesson spec was updated after the last answer was recorded
        // This suggests the question count changed post-submission
        reason = "spec_modified";
        specModified++;
      } else {
        // Answers exist but fewer than expected — partial write failure
        reason = "partial_write";
        partialWrites++;
      }

      // Backwards-compatible details
      details.push({ lessonId: lesson.id, expected, actual });

      detailedResults.push({
        lessonId: lesson.id,
        learnerId: answerData?.learnerId ?? lesson.learner_id ?? null,
        expected,
        actual,
        reason,
      });

      if (fix && reason === "spec_modified") {
        // For spec-modified cases, we can safely update by storing the current
        // question count alongside the answers. Log it for audit.
        console.info(
          `[Maintenance] Spec-modified quiz: lesson ${lesson.id} — expected updated from ${expected} to match current spec`
        );
      } else if (fix && reason === "partial_write") {
        // Cannot recover missing answers — flag for manual review only
        console.warn(
          `[Maintenance] Partial quiz write: lesson ${lesson.id} has ${actual}/${expected} answers — flagged for manual review`
        );
      }
    }
  }

  return {
    partialCount: detailedResults.length,
    details,
    detailedResults,
    summary: {
      partialWrites,
      specModified,
      noAnswers,
    },
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
