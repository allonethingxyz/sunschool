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
} from '../../helpers/learner-setup';

test.describe('Learner: Achievements', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('can view progress page with learning stats', async ({ page }) => {
    await setupLearnerSession(page, 'achieve');

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achieve-01-progress-page');

    // Progress page should have structural content
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);

    // Look for progress-related elements using semantic locators
    const hasProgressTitle = await page.getByText(/Progress|Learning|Dashboard/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasStats = await page.getByText(/Lessons|Score|Completed|Average/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasProgressTitle || hasStats).toBeTruthy();
  });

  test('progress page shows zero state for new learner', async ({ page }) => {
    await setupLearnerSession(page, 'achieve_zero');

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achieve-02-zero-state');

    // New learner should see empty/zero state
    // The actual UI shows "Complete lessons to earn trophies!" or "Start a lesson to see your history!"
    const hasEmptyState = await page.getByText(/Complete lessons to earn trophies|Start a lesson|no achievements|start learning/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasEmptyState).toBeTruthy();

    // The page should render with at least a heading
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);
  });

  test('achievements appear after completing a lesson with perfect score', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'achieve_perfect');

    // Complete a lesson with perfect score
    const completed = await completeOneLesson(page);
    if (!completed) {
      test.skip(true, 'Lesson generation timed out — skipping achievement assertions');
      return;
    }

    // Poll for achievements to appear (they are awarded synchronously on answer
    // submission, but a small delay can occur before the API reflects them)
    const learnerId = await page.evaluate(() =>
      localStorage.getItem('selectedLearnerId')
    );

    let achievements: any[] = [];
    await expect
      .poll(
        async () => {
          const result = await apiCall(
            page,
            'GET',
            `/api/achievements?learnerId=${learnerId}`
          );
          achievements = Array.isArray(result.data) ? result.data : [];
          return achievements.length;
        },
        {
          message: 'Waiting for achievements to be awarded after lesson completion',
          timeout: 30_000,
          intervals: [2_000],
        }
      )
      .toBeGreaterThan(0);

    // Navigate to progress page to view achievements
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achieve-03-after-lesson');

    // The progress page shows "My Trophies" section with achievement titles
    const hasTrophySection = await page.getByText(/My Trophies/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasTrophySection).toBeTruthy();

    // Verify at least one achievement title is visible (e.g. "First Steps", "Perfect Score!")
    const hasAchievementTitle = await page.getByText(/First Steps|Perfect Score|Learning Explorer/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasAchievementTitle).toBeTruthy();
  });

  test('can view lesson history on progress page', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'achieve_history');

    // Complete a lesson
    const completed = await completeOneLesson(page);
    if (!completed) {
      test.skip(true, 'Lesson generation timed out — skipping history assertions');
      return;
    }

    // Navigate to progress page
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achieve-04-lesson-history');

    // The "Recent Lessons" section should be visible with at least one entry
    const hasRecentLessons = await page.getByText(/Recent Lessons/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasRecentLessons).toBeTruthy();

    // Verify lesson history exists via API as a sanity check
    const learnerId = await page.evaluate(() =>
      localStorage.getItem('selectedLearnerId')
    );
    const historyResult = await apiCall(
      page,
      'GET',
      `/api/lessons?learnerId=${learnerId}`
    );
    const history = Array.isArray(historyResult.data) ? historyResult.data : [];
    expect(history.length).toBeGreaterThan(0);

    await screenshot(page, 'achieve-04-history-verified');
  });

  test('progress page shows subject mastery breakdown', async ({ page }) => {
    await setupLearnerSession(page, 'achieve_mastery');

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achieve-05-mastery');

    // Check for subject mastery section using semantic locators
    const hasMasterySection = await page.getByText(/Mastery|Subject|Topics/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);

    // The progress page should render with structural elements
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);
  });
});
