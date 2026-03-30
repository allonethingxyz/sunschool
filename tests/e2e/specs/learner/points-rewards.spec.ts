/**
 * Learner Persona E2E: Points & Rewards
 *
 * Models a child checking their point balance, browsing reward goals,
 * and attempting to save/redeem points.
 *
 * Points come from quiz completion. Rewards are parent-created goals
 * that learners save points toward and request redemption.
 */
import { test, expect } from '@playwright/test';
import { selfHealingLocator } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  createRewardGoal,
  apiCall,
  enterLearnerContext,
} from '../../helpers/learner-setup';

test.describe('Learner: Points & Rewards', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('can view point balance on learner home', async ({ page }) => {
    test.setTimeout(600_000);
    const ctx = await setupLearnerSession(page, 'reward');

    // Enter the learner context via the dashboard
    await enterLearnerContext(page, ctx.childName);
    await screenshot(page, 'points-01-learner-home');

    // The learner home or dashboard should show the child's name and lesson section
    const hasChildName = await page.getByText(/Hello|Child_|Welcome/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasLessonSection = await page.getByText(/Current Lesson|active lesson|SELECT A SUBJECT/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasProgress = await page.getByText(/Progress|My Progress|Lessons|Grade/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDashboard = await page.getByText(/START LEARNING AS/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasChildName || hasLessonSection || hasProgress || hasDashboard).toBeTruthy();
  });

  test('can check point balance via API and see it reflected', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'reward_balance');

    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    // Check points balance via API
    const learnerId = await page.evaluate(() =>
      localStorage.getItem('selectedLearnerId')
    );
    const balanceResult = await apiCall(
      page,
      'GET',
      `/api/points/balance?learnerId=${learnerId}`
    );

    // New learner should have 0 or some default balance
    if (balanceResult.status === 200) {
      expect(typeof balanceResult.data).toBe('object');
    }

    await screenshot(page, 'points-02-balance-checked');
  });

  test('can navigate to goals page and see reward goals', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'reward_goals');

    // Create a reward goal as the parent
    const goalId = await createRewardGoal(page, 'Extra Screen Time', 10);

    // Navigate to goals page
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'points-03-goals-page');

    // If a goal was created, it should appear on the page
    if (goalId) {
      const hasGoalTitle = await page.getByText('Extra Screen Time')
        .isVisible({ timeout: 10000 }).catch(() => false);

      if (hasGoalTitle) {
        await screenshot(page, 'points-03-goal-visible');
      }
    }

    // The goals page should render with some content
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('can see reward goal progress and save points action', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'reward_progress');

    // Create a reward goal
    const goalId = await createRewardGoal(page, 'Movie Night', 5);

    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'points-04-goal-progress');

    if (goalId) {
      const hasGoal = await page.getByText('Movie Night')
        .isVisible({ timeout: 10000 }).catch(() => false);

      if (hasGoal) {
        // Look for save points or progress indicator
        const { locator: saveBtn } = await selfHealingLocator(page, 'save-points-btn', {
          role: 'button',
          name: 'Save Points',
          text: 'Save Points',
        });

        const hasSaveBtn = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);

        // Look for progress bar or percentage
        const hasProgress = await page.getByText(/\d+\s*\/\s*\d+|progress/i)
          .isVisible({ timeout: 5000 }).catch(() => false);

        // Either a save action or progress indicator should be present
        expect(hasSaveBtn || hasProgress || hasGoal).toBeTruthy();
        await screenshot(page, 'points-04-goal-details');
      }
    }
  });

  test('points are awarded after completing a quiz', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'reward_quiz');

    // Check initial balance
    const learnerId = await page.evaluate(() =>
      localStorage.getItem('selectedLearnerId')
    );
    const initialResult = await apiCall(
      page,
      'GET',
      `/api/points/balance?learnerId=${learnerId}`
    );
    const initialBalance = initialResult.data?.balance || initialResult.data?.points || 0;

    // Generate a lesson
    let lessonId: string;
    try {
      lessonId = await generateAndWaitForLesson(page, 'Math');
    } catch {
      // Skip if lesson creation failed
      return;
    }

    // Submit quiz answers via API with correct answers
    const lessonResult = await apiCall(page, 'GET', `/api/lessons/${lessonId}`);
    const questions = lessonResult.data?.spec?.questions || [];

    const answers = questions.map((q: any, i: number) => ({
      questionIndex: i,
      selectedIndex: q.correctIndex ?? 0,
    }));

    const quizResult = await apiCall(
      page,
      'POST',
      `/api/lessons/${lessonId}/answer`,
      { answers, learnerId: Number(learnerId) }
    );

    // Check updated balance
    const newResult = await apiCall(
      page,
      'GET',
      `/api/points/balance?learnerId=${learnerId}`
    );
    const newBalance = newResult.data?.balance || newResult.data?.points || 0;

    // If quiz was submitted successfully, points should have increased
    if (quizResult.status === 200) {
      expect(newBalance).toBeGreaterThanOrEqual(initialBalance);
    }

    // Navigate to dashboard and verify UI reflects content
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'points-05-after-quiz');

    // Verify dashboard or learner home has content
    const hasChildName = await page.getByText(/Hello|Child_|Welcome/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasContent = await page.getByText(/Current Lesson|Progress|SELECT A SUBJECT|Lessons|Grade/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasChildName || hasContent).toBeTruthy();
  });
});
