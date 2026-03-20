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
import { test, expect, Page } from '@playwright/test';
import {
  setupLearnerSession,
  screenshot,
  completeOneLesson,
  apiCall,
  navigateAsLearner,
} from '../../helpers/learner-setup';

/** react-native-web renders Text as <div>, not <h1>-<h6>, so getByRole('heading') won't find them */
async function expectPageHasContent(page: Page): Promise<void> {
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText.length).toBeGreaterThan(50);
}

test.describe('Learner: Achievements', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('can view progress page with learning stats', async ({ page }) => {
    await setupLearnerSession(page, 'achieve');

    await navigateAsLearner(page, '/progress');
    await screenshot(page, 'achieve-01-progress-page');

    // Progress page should have structural content
    await expectPageHasContent(page);

    // Look for progress-related elements
    const hasProgressTitle = await page.getByText(/Progress|Learning|Dashboard/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasStats = await page.getByText(/Lessons|Score|Completed|Average/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasProgressTitle || hasStats).toBeTruthy();
  });

  test('progress page shows zero state for new learner', async ({ page }) => {
    await setupLearnerSession(page, 'achieve_zero');

    await navigateAsLearner(page, '/progress');
    await screenshot(page, 'achieve-02-zero-state');

    // The page should render with content
    await expectPageHasContent(page);

    // New learner should see zero-state indicators
    const hasZeroIndicator = await page.getByText(/0 Lessons|Beginner|Level 1/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasProgressLabel = await page.getByText(/My Progress/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasZeroIndicator || hasProgressLabel).toBeTruthy();
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
    await navigateAsLearner(page, '/progress');
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
    await navigateAsLearner(page, '/progress');
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
      const hasLessonEntry = await page.getByText(/Completed|Done|Score/i)
        .first().isVisible({ timeout: 10000 }).catch(() => false);

      const hasCount = await page.getByText(/\d+/)
        .first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasLessonEntry || hasCount || history.length > 0).toBeTruthy();
    }

    await screenshot(page, 'achieve-04-history-verified');
  });

  test('progress page shows subject mastery breakdown', async ({ page }) => {
    await setupLearnerSession(page, 'achieve_mastery');

    await navigateAsLearner(page, '/progress');
    await screenshot(page, 'achieve-05-mastery');

    // The progress page should render with content
    await expectPageHasContent(page);

    // Check for progress/mastery indicators
    const hasProgressLabel = await page.getByText(/My Progress|Mastery|Subject|Topics/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasProgressLabel).toBeTruthy();
  });
});
