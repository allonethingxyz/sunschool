import { db } from '../db';
import { lessonValidationLog, lessonTemplates } from '../../shared/schema';
import { sql, and, gte, eq, desc } from 'drizzle-orm';

interface ValidationStats {
  model: string;
  subject: string;
  totalValidations: number;
  failures: number;
  rejectionRate: number;
  commonReasons: { reason: string; count: number }[];
}

interface TuningAction {
  timestamp: Date;
  model: string;
  subject: string;
  action: string;
  reason: string;
  rejectionRate: number;
}

// Track tuning actions for logging and audit
const tuningHistory: TuningAction[] = [];

/**
 * Get validation statistics for the last N hours, grouped by model and subject.
 */
async function getValidationStats(hoursBack: number = 1): Promise<ValidationStats[]> {
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const stats = await db
    .select({
      model: lessonValidationLog.model,
      subject: lessonValidationLog.subject,
      totalValidations: sql<number>`count(*)::int`,
      failures: sql<number>`sum(case when ${lessonValidationLog.passed} = false then 1 else 0 end)::int`,
    })
    .from(lessonValidationLog)
    .where(
      and(
        gte(lessonValidationLog.createdAt, cutoffTime),
        sql`${lessonValidationLog.model} IS NOT NULL`,
        sql`${lessonValidationLog.subject} IS NOT NULL`
      )
    )
    .groupBy(lessonValidationLog.model, lessonValidationLog.subject);

  // For each model+subject combo, get common rejection reasons
  const enrichedStats = await Promise.all(
    stats.map(async (stat) => {
      const reasons = await db
        .select({
          reason: lessonValidationLog.rejectionReason,
          count: sql<number>`count(*)::int`,
        })
        .from(lessonValidationLog)
        .where(
          and(
            eq(lessonValidationLog.model, stat.model!),
            eq(lessonValidationLog.subject, stat.subject!),
            eq(lessonValidationLog.passed, false),
            gte(lessonValidationLog.createdAt, cutoffTime)
          )
        )
        .groupBy(lessonValidationLog.rejectionReason)
        .orderBy(desc(sql`count(*)`));

      return {
        model: stat.model!,
        subject: stat.subject!,
        totalValidations: stat.totalValidations,
        failures: stat.failures,
        rejectionRate: stat.totalValidations > 0 ? stat.failures / stat.totalValidations : 0,
        commonReasons: reasons
          .filter((r) => r.reason !== null)
          .map((r) => ({ reason: r.reason!, count: r.count })),
      };
    })
  );

  return enrichedStats;
}

/**
 * Main auto-tuner function. Runs periodically to monitor rejection rates
 * and adjust validation thresholds or flag issues.
 */
export async function runAutoTuner(): Promise<void> {
  console.log('[Auto-Tuner] Running validation auto-tuner check...');

  try {
    // Get all validation stats for the last hour
    const stats = await getValidationStats(1);

    if (stats.length === 0) {
      console.log('[Auto-Tuner] No validation data in the last hour');
      return;
    }

    for (const stat of stats) {
      // Skip if not enough data
      if (stat.totalValidations < 5) {
        continue;
      }

      const rejectionRatePercent = stat.rejectionRate * 100;

      // Check if rejection rate exceeds 20% threshold
      if (rejectionRatePercent > 20) {
        console.log(
          `[Auto-Tuner] ⚠️  High rejection rate detected: ${stat.model} + ${stat.subject} = ${rejectionRatePercent.toFixed(1)}%`
        );

        await handleHighRejectionRate(stat);
      } else {
        console.log(
          `[Auto-Tuner] ✓ ${stat.model} + ${stat.subject}: ${rejectionRatePercent.toFixed(1)}% rejection rate (${stat.failures}/${stat.totalValidations})`
        );
      }
    }

    // Check for low-quality templates that should be flagged
    await checkLowQualityTemplates();

    console.log('[Auto-Tuner] Check complete');
  } catch (error) {
    console.error('[Auto-Tuner] Error running auto-tuner:', error);
  }
}

/**
 * Handle a high rejection rate for a specific model+subject combination.
 */
async function handleHighRejectionRate(stat: ValidationStats): Promise<void> {
  const { model, subject, rejectionRate, commonReasons } = stat;

  // Analyze common rejection reasons
  const topReason = commonReasons[0];
  if (!topReason) {
    console.log(`[Auto-Tuner] No specific rejection reason found for ${model} + ${subject}`);
    return;
  }

  console.log(
    `[Auto-Tuner] Most common rejection: "${topReason.reason}" (${topReason.count} occurrences)`
  );

  // Detect patterns and suggest adjustments
  if (topReason.reason.includes('insufficient sections') || topReason.reason.includes('sections, need at least 2')) {
    // Check if model produces subsections instead of top-level sections
    console.log(
      `[Auto-Tuner] 💡 Suggestion: ${model} may produce subsections instead of sections. Consider updating validator to count subsections.`
    );
    logTuningAction({
      model,
      subject,
      action: 'SUGGEST_COUNT_SUBSECTIONS',
      reason: 'High "insufficient sections" rejections',
      rejectionRate: rejectionRate * 100,
    });
  }

  if (topReason.reason.includes('placeholder')) {
    // Check if placeholder patterns need updating
    console.log(
      `[Auto-Tuner] 💡 Suggestion: ${model} may use new placeholder patterns. Review and update PLACEHOLDER_PATTERNS in lesson-validator.ts`
    );
    logTuningAction({
      model,
      subject,
      action: 'SUGGEST_UPDATE_PLACEHOLDER_PATTERNS',
      reason: 'High placeholder rejections',
      rejectionRate: rejectionRate * 100,
    });
  }

  if (topReason.reason.includes('questions')) {
    console.log(
      `[Auto-Tuner] 💡 Suggestion: ${model} struggling with question generation for ${subject}. Consider prompt adjustments.`
    );
    logTuningAction({
      model,
      subject,
      action: 'SUGGEST_PROMPT_ADJUSTMENT',
      reason: 'High question-related rejections',
      rejectionRate: rejectionRate * 100,
    });
  }
}

/**
 * Check for low-quality templates that should be flagged or retired.
 */
async function checkLowQualityTemplates(): Promise<void> {
  // Templates served >10 times with avgScore <40%
  const lowQualityTemplates = await db
    .select({
      id: lessonTemplates.id,
      title: lessonTemplates.title,
      subject: lessonTemplates.subject,
      timesServed: lessonTemplates.timesServed,
      avgScore: lessonTemplates.avgScore,
    })
    .from(lessonTemplates)
    .where(
      and(
        gte(lessonTemplates.timesServed, 10),
        sql`${lessonTemplates.avgScore} < 40`
      )
    )
    .limit(20);

  if (lowQualityTemplates.length > 0) {
    console.log(`[Auto-Tuner] Found ${lowQualityTemplates.length} low-quality templates to flag for retirement`);

    for (const template of lowQualityTemplates) {
      console.log(
        `[Auto-Tuner] 🗑️  Template ${template.id} (${template.title}) should be retired: served ${template.timesServed} times with avg score ${template.avgScore}%`
      );
      logTuningAction({
        model: 'N/A',
        subject: template.subject,
        action: 'FLAG_TEMPLATE_RETIREMENT',
        reason: `Low quality: ${template.timesServed} serves, ${template.avgScore}% avg score`,
        rejectionRate: 0,
      });
    }
  }

  // Templates with >50 serves and >70% avg score are proven quality
  const provenTemplates = await db
    .select({
      id: lessonTemplates.id,
      title: lessonTemplates.title,
      subject: lessonTemplates.subject,
      timesServed: lessonTemplates.timesServed,
      avgScore: lessonTemplates.avgScore,
    })
    .from(lessonTemplates)
    .where(
      and(
        gte(lessonTemplates.timesServed, 50),
        sql`${lessonTemplates.avgScore} > 70`
      )
    )
    .limit(10);

  if (provenTemplates.length > 0) {
    console.log(`[Auto-Tuner] ✓ ${provenTemplates.length} proven high-quality templates (skip regeneration)`);
  }
}

/**
 * Log a tuning action for audit trail.
 */
function logTuningAction(action: Omit<TuningAction, 'timestamp'>): void {
  tuningHistory.push({
    ...action,
    timestamp: new Date(),
  });

  // Keep only last 100 actions in memory
  if (tuningHistory.length > 100) {
    tuningHistory.shift();
  }
}

/**
 * Get recent tuning actions (for debugging/monitoring).
 */
export function getTuningHistory(limit: number = 20): TuningAction[] {
  return tuningHistory.slice(-limit);
}

/**
 * Start the auto-tuner background job.
 * Runs every N minutes (default: 15).
 */
export function startAutoTuner(intervalMinutes: number = 15): NodeJS.Timeout {
  console.log(`[Auto-Tuner] Starting auto-tuner with ${intervalMinutes}-minute interval`);

  // Run immediately on start
  runAutoTuner();

  // Then run periodically
  return setInterval(() => {
    runAutoTuner();
  }, intervalMinutes * 60 * 1000);
}
