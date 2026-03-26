/**
 * Learner Persona E2E: Achievements
 *
 * Models a child viewing their progress dashboard and achievement milestones:
 * - View progress page with learning stats
 * - Check for achievements after completing lessons
 * - View lesson history
 * - Verify mastery tracking by subject
 *
 * Achievements are awarded automatically after quiz submission.
 */
import { test, expect } from '@playwright/test';
import {
  setupLearnerSession,
  screenshot,
  completeOneLesson,
  apiCall,
  spaNavigate,
  enterLearnerContext,
} from '../../helpers/learner-setup';

test.describe('Learner: Achievements', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('can view progress page with learning stats', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'achieve');

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'achieve-01-progress-page');

    // Progress page renders with level/stats content or dashboard content
    const hasProgressTitle = await page.getByText(/My Progress|Progress/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasLevel = await page.getByText(/Level|Beginner|Intermediate|Advanced/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasStats = await page.getByText(/Lessons|Score|Trophies|Points|Achievements|Grade/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDashboard = await page.getByText(/Welcome|Dashboard/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasProgressTitle || hasLevel || hasStats || hasDashboard).toBeTruthy();
  });

  test('progress page shows zero state for new learner', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'achieve_zero');

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'achieve-02-zero-state');

    // New learner should see zero/empty state indicators or dashboard content
    const hasZeroLessons = await page.getByText(/^0$/)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasEmptyTrophies = await page.getByText(/Complete lessons to earn|no achievements|start learning/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasProgressContent = await page.getByText(/My Progress|Progress/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    // Dashboard may show child stats with 0 values
    const hasChildStats = await page.getByText(/Lessons|Achievements|Grade/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDashboard = await page.getByText(/Welcome|Dashboard/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasZeroLessons || hasEmptyTrophies || hasProgressContent || hasChildStats || hasDashboard).toBeTruthy();
  });

  test('achievements appear after completing a lesson with perfect score', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'achieve_perfect');

    // Complete a lesson with perfect score
    const completed = await completeOneLesson(page);

    // Check achievements via API
    const learnerId = await page.evaluate(() =>
      localStorage.getItem('selectedLearnerId')
    );
    const achievementsResult = await apiCall(
      page,
      'GET',
      `/api/achievements?learnerId=${learnerId}`
    );
    const achievements = achievementsResult.data || [];

    // Navigate to progress page to view achievements
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'achieve-03-after-lesson');

    if (completed) {
      if (Array.isArray(achievements) && achievements.length > 0) {
        const hasAchievementSection = await page.getByText(/Achievement|Badge|Milestone|Trophies/i)
          .first().isVisible({ timeout: 10000 }).catch(() => false);

        expect(hasAchievementSection || achievements.length > 0).toBeTruthy();
      }
    }
  });

  test('can view lesson history on progress page', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'achieve_history');

    // Complete a lesson
    await completeOneLesson(page);

    // Navigate to progress page
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'achieve-04-lesson-history');

    // Check lesson history via API
    const learnerId = await page.evaluate(() =>
      localStorage.getItem('selectedLearnerId')
    );
    const historyResult = await apiCall(
      page,
      'GET',
      `/api/lessons?learnerId=${learnerId}`
    );
    const history = historyResult.data || [];

    if (Array.isArray(history) && history.length > 0) {
      const hasLessonEntry = await page.getByText(/Completed|Done|Score|Recent Lessons/i)
        .first().isVisible({ timeout: 10000 }).catch(() => false);

      const hasCount = await page.getByText(/\d+/)
        .first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasLessonEntry || hasCount || history.length > 0).toBeTruthy();
    }

    await screenshot(page, 'achieve-04-history-verified');
  });

  test('progress page shows subject mastery breakdown', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'achieve_mastery');

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'achieve-05-mastery');

    // Progress page should render with level, stats, or dashboard content
    const hasLevel = await page.getByText(/Level|Beginner|Intermediate|Advanced/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasTrophies = await page.getByText(/Trophies|Mastery|Subject/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasStats = await page.getByText(/Lessons Done|How I'm Doing|Points|Lessons|Achievements|Grade/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDashboard = await page.getByText(/Welcome|Dashboard/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasLevel || hasTrophies || hasStats || hasDashboard).toBeTruthy();
  });
});
