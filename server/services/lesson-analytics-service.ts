import { db } from '../db';
import { lessons, lessonTemplates, lessonValidationLog } from '../../shared/schema';
import { eq, sql, and, gte, desc } from 'drizzle-orm';

interface LessonAnalytics {
  totalLessons: number;
  totalTemplates: number;
  avgScore: number;
  avgCompletionRate: number;
  topTemplates: { id: string; subject: string; title: string; timesServed: number; avgScore: number }[];
  lowPerformingTemplates: { id: string; subject: string; title: string; timesServed: number; avgScore: number }[];
  validationRejectionRate: number;
  recentRejections: { reason: string; count: number }[];
  subjectBreakdown: { subject: string; count: number; avgScore: number; completionRate: number }[];
}

interface TemplatePerformance {
  templateId: string;
  title: string;
  subject: string;
  timesServed: number;
  avgScore: number;
  completionRate: number;
  avgTimeSeconds: number | null;
}

/**
 * Returns a comprehensive LessonAnalytics snapshot.
 */
export async function getLessonAnalytics(): Promise<LessonAnalytics> {
  // Total lessons
  const [{ totalLessons }] = await db
    .select({ totalLessons: sql<number>`count(*)::int` })
    .from(lessons);

  // Total templates
  const [{ totalTemplates }] = await db
    .select({ totalTemplates: sql<number>`count(*)::int` })
    .from(lessonTemplates);

  // Average score across completed lessons
  const [{ avgScore }] = await db
    .select({ avgScore: sql<number>`coalesce(avg(${lessons.score}), 0)::numeric(5,2)` })
    .from(lessons)
    .where(eq(lessons.status, 'DONE'));

  // Average completion rate: (DONE lessons) / (total lessons)
  const [{ doneCount }] = await db
    .select({ doneCount: sql<number>`count(*)::int` })
    .from(lessons)
    .where(eq(lessons.status, 'DONE'));
  const avgCompletionRate = totalLessons > 0 ? Number(((doneCount / totalLessons) * 100).toFixed(2)) : 0;

  // Top templates by avg_score (at least 3 serves)
  const topTemplates = await db
    .select({
      id: lessonTemplates.id,
      subject: lessonTemplates.subject,
      title: lessonTemplates.title,
      timesServed: lessonTemplates.timesServed,
      avgScore: sql<number>`coalesce(${lessonTemplates.avgScore}, 0)`,
    })
    .from(lessonTemplates)
    .where(gte(lessonTemplates.timesServed, 3))
    .orderBy(desc(lessonTemplates.avgScore))
    .limit(10);

  // Low performing templates (avgScore < 40, timesServed > 5)
  const lowPerformingTemplates = await db
    .select({
      id: lessonTemplates.id,
      subject: lessonTemplates.subject,
      title: lessonTemplates.title,
      timesServed: lessonTemplates.timesServed,
      avgScore: sql<number>`coalesce(${lessonTemplates.avgScore}, 0)`,
    })
    .from(lessonTemplates)
    .where(
      and(
        sql`${lessonTemplates.avgScore} < 40`,
        sql`${lessonTemplates.timesServed} > 5`,
      ),
    )
    .orderBy(lessonTemplates.avgScore)
    .limit(20);

  // Validation rejection rate (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const validationRows = await db
    .select({
      total: sql<number>`count(*)::int`,
      failures: sql<number>`count(*) filter (where not ${lessonValidationLog.passed})::int`,
    })
    .from(lessonValidationLog)
    .where(gte(lessonValidationLog.createdAt, thirtyDaysAgo));
  const { total: valTotal, failures: valFailures } = validationRows[0] ?? { total: 0, failures: 0 };
  const validationRejectionRate = valTotal > 0 ? Number(((valFailures / valTotal) * 100).toFixed(2)) : 0;

  // Recent rejection reasons (grouped, last 30 days)
  const recentRejections = await db
    .select({
      reason: lessonValidationLog.rejectionReason,
      count: sql<number>`count(*)::int`,
    })
    .from(lessonValidationLog)
    .where(
      and(
        gte(lessonValidationLog.createdAt, thirtyDaysAgo),
        eq(lessonValidationLog.passed, false),
      ),
    )
    .groupBy(lessonValidationLog.rejectionReason)
    .orderBy(desc(sql`count(*)`))
    .limit(15);

  // Subject breakdown
  const subjectBreakdown = await db
    .select({
      subject: lessons.subject,
      count: sql<number>`count(*)::int`,
      avgScore: sql<number>`coalesce(avg(${lessons.score}), 0)::numeric(5,2)`,
      completionRate: sql<number>`(100.0 * count(*) filter (where ${lessons.status} = 'DONE') / nullif(count(*), 0))::numeric(5,2)`,
    })
    .from(lessons)
    .where(sql`${lessons.subject} is not null`)
    .groupBy(lessons.subject)
    .orderBy(desc(sql`count(*)`));

  return {
    totalLessons,
    totalTemplates,
    avgScore: Number(avgScore),
    avgCompletionRate,
    topTemplates: topTemplates.map((t) => ({
      id: t.id,
      subject: t.subject,
      title: t.title,
      timesServed: t.timesServed,
      avgScore: Number(t.avgScore),
    })),
    lowPerformingTemplates: lowPerformingTemplates.map((t) => ({
      id: t.id,
      subject: t.subject,
      title: t.title,
      timesServed: t.timesServed,
      avgScore: Number(t.avgScore),
    })),
    validationRejectionRate,
    recentRejections: recentRejections.map((r) => ({
      reason: r.reason ?? 'unknown',
      count: r.count,
    })),
    subjectBreakdown: subjectBreakdown.map((s) => ({
      subject: s.subject ?? 'unknown',
      count: s.count,
      avgScore: Number(s.avgScore),
      completionRate: Number(s.completionRate),
    })),
  };
}

/**
 * Returns detailed performance data for a single template.
 */
export async function getTemplatePerformance(templateId: string): Promise<TemplatePerformance | null> {
  const [template] = await db
    .select()
    .from(lessonTemplates)
    .where(eq(lessonTemplates.id, templateId))
    .limit(1);

  if (!template) return null;

  // Completion rate and avg time for lessons spawned from this template
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${lessons.status} = 'DONE')::int`,
      avgScore: sql<number>`coalesce(avg(${lessons.score}), 0)::numeric(5,2)`,
      avgTimeSeconds: sql<number | null>`avg(extract(epoch from (${lessons.completedAt} - ${lessons.createdAt})))::numeric(10,2)`,
    })
    .from(lessons)
    .where(eq(lessons.templateId, templateId));

  const total = stats?.total ?? 0;
  const done = stats?.done ?? 0;

  return {
    templateId: template.id,
    title: template.title,
    subject: template.subject,
    timesServed: template.timesServed,
    avgScore: Number(stats?.avgScore ?? 0),
    completionRate: total > 0 ? Number(((done / total) * 100).toFixed(2)) : 0,
    avgTimeSeconds: stats?.avgTimeSeconds ? Number(stats.avgTimeSeconds) : null,
  };
}

/**
 * Finds templates with avgScore < 40 and timesServed > 5.
 * Returns them sorted by worst-performing first.
 */
export async function flagLowQualityTemplates() {
  return db
    .select({
      id: lessonTemplates.id,
      subject: lessonTemplates.subject,
      title: lessonTemplates.title,
      topic: lessonTemplates.topic,
      gradeLevel: lessonTemplates.gradeLevel,
      timesServed: lessonTemplates.timesServed,
      avgScore: sql<number>`coalesce(${lessonTemplates.avgScore}, 0)`,
      createdAt: lessonTemplates.createdAt,
    })
    .from(lessonTemplates)
    .where(
      and(
        sql`coalesce(${lessonTemplates.avgScore}, 0) < 40`,
        sql`${lessonTemplates.timesServed} > 5`,
      ),
    )
    .orderBy(lessonTemplates.avgScore)
    .limit(50);
}

/**
 * Query the lesson_validation_log for rejection patterns since a given date.
 */
export async function getValidationStats(since: Date) {
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      passed: sql<number>`count(*) filter (where ${lessonValidationLog.passed})::int`,
      failed: sql<number>`count(*) filter (where not ${lessonValidationLog.passed})::int`,
    })
    .from(lessonValidationLog)
    .where(gte(lessonValidationLog.createdAt, since));

  const byReason = await db
    .select({
      reason: lessonValidationLog.rejectionReason,
      count: sql<number>`count(*)::int`,
    })
    .from(lessonValidationLog)
    .where(
      and(
        gte(lessonValidationLog.createdAt, since),
        eq(lessonValidationLog.passed, false),
      ),
    )
    .groupBy(lessonValidationLog.rejectionReason)
    .orderBy(desc(sql`count(*)`));

  const byModel = await db
    .select({
      model: lessonValidationLog.model,
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where not ${lessonValidationLog.passed})::int`,
    })
    .from(lessonValidationLog)
    .where(gte(lessonValidationLog.createdAt, since))
    .groupBy(lessonValidationLog.model)
    .orderBy(desc(sql`count(*)`));

  const bySubject = await db
    .select({
      subject: lessonValidationLog.subject,
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where not ${lessonValidationLog.passed})::int`,
    })
    .from(lessonValidationLog)
    .where(gte(lessonValidationLog.createdAt, since))
    .groupBy(lessonValidationLog.subject)
    .orderBy(desc(sql`count(*)`));

  return {
    total: totals?.total ?? 0,
    passed: totals?.passed ?? 0,
    failed: totals?.failed ?? 0,
    rejectionRate: totals?.total
      ? Number((((totals?.failed ?? 0) / totals.total) * 100).toFixed(2))
      : 0,
    byReason: byReason.map((r) => ({ reason: r.reason ?? 'unknown', count: r.count })),
    byModel: byModel.map((m) => ({
      model: m.model ?? 'unknown',
      total: m.total,
      failed: m.failed,
      failRate: m.total > 0 ? Number(((m.failed / m.total) * 100).toFixed(2)) : 0,
    })),
    bySubject: bySubject.map((s) => ({
      subject: s.subject ?? 'unknown',
      total: s.total,
      failed: s.failed,
      failRate: s.total > 0 ? Number(((s.failed / s.total) * 100).toFixed(2)) : 0,
    })),
  };
}
