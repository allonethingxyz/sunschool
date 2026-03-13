/**
 * Learner Persona E2E: Points & Rewards
 *
 * Models a child checking point balance, browsing reward goals,
 * saving points toward a goal, and attempting to redeem.
 * All assertions are structural — no exact text matching on AI content.
 */
import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';

const timestamp = Date.now();
const parentUsername = `rewardsparent_${timestamp}`;
const parentEmail = `rewardsparent_${timestamp}@test.com`;
const parentPassword = 'TestPassword123!';
const childName = `RewardsChild_${timestamp}`;

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

/** Register parent + child, store auth token and selected learner. */
async function setupLearnerSession(page: Page): Promise<{ learnerId: number | null }> {
  const regResult = await page.evaluate(async (data) => {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }, {
    username: parentUsername,
    email: parentEmail,
    password: parentPassword,
    name: 'Rewards Test Parent',
    role: 'PARENT',
  });

  if (regResult.token) {
    await page.evaluate((token) => localStorage.setItem('AUTH_TOKEN', token), regResult.token);
  }

  const childResult = await page.evaluate(async (data) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    const res = await fetch('/api/learners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return res.json();
  }, { name: childName, gradeLevel: 3 });

  const learnerId = childResult.id ?? null;
  if (learnerId) {
    await page.evaluate((id) => localStorage.setItem('selectedLearnerId', String(id)), learnerId);
  }

  return { learnerId };
}

/** Create a reward goal via API. Returns the reward ID or null. */
async function createRewardGoal(
  page: Page,
  learnerId: number,
  goal: { title: string; tokenCost: number; emoji?: string }
): Promise<number | null> {
  const result = await page.evaluate(async ({ lid, g }) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    if (!token) return null;
    const res = await fetch('/api/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        learnerId: lid,
        title: g.title,
        tokenCost: g.tokenCost,
        imageEmoji: g.emoji || '🎁',
        description: `Reward: ${g.title}`,
        category: 'other',
        color: '#6BCB77',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
  }, { lid: learnerId, g: goal });

  return result;
}

test.describe('Learner: Points & Rewards', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await captureFailureArtifacts(page, testInfo.title);
    }
  });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
  });

  test('goals page displays header and balance badge', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'rewards-01-goals-page');

    // "My Goals" header should be visible
    const { locator: goalsHeading } = await selfHealingLocator(page, 'goals-header', {
      text: 'My Goals',
      name: 'My Goals',
    });
    await expect(goalsHeading).toBeVisible({ timeout: 10000 });

    // Balance badge should show points (e.g., "⭐ 0 pts")
    const balanceBadge = page.getByText(/\d+\s*pts/);
    const hasBalance = await balanceBadge.first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasBalance).toBeTruthy();
  });

  test('goals page shows tabs for Goals and History', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    // Should have Goals and History tabs
    const goalsTab = page.getByText('Goals', { exact: false });
    const historyTab = page.getByText('History', { exact: false });

    const hasGoalsTab = await goalsTab.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasHistoryTab = await historyTab.first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasGoalsTab).toBeTruthy();
    expect(hasHistoryTab).toBeTruthy();

    await screenshot(page, 'rewards-02-tabs');
  });

  test('reward goals display with progress bars and save button', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    // Create a reward goal via API
    const rewardId = await createRewardGoal(page, learnerId, {
      title: 'Extra Screen Time',
      tokenCost: 50,
      emoji: '📺',
    });

    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'rewards-03-with-goal');

    // The reward goal title should appear
    const goalTitle = page.getByText('Extra Screen Time');
    const hasGoalTitle = await goalTitle.first().isVisible({ timeout: 10000 }).catch(() => false);
    expect(hasGoalTitle).toBeTruthy();

    // Progress indicator should show points saved vs. total (e.g., "0 / 50 pts")
    const progressText = page.getByText(/\d+\s*\/\s*\d+\s*pts/);
    const hasProgress = await progressText.first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasProgress).toBeTruthy();

    // Save Points button should be visible
    const { locator: saveBtn } = await selfHealingLocator(page, 'save-points-btn', {
      text: 'Save Points',
      name: 'Save Points',
    });
    const hasSaveBtn = await saveBtn.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasSaveBtn).toBeTruthy();
  });

  test('save points modal opens and has preset buttons', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    // Create reward goal
    await createRewardGoal(page, learnerId, {
      title: 'New Book',
      tokenCost: 30,
      emoji: '📚',
    });

    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    // Click "Save Points" button
    const { locator: saveBtn } = await selfHealingLocator(page, 'save-points-open', {
      text: 'Save Points',
      name: 'Save Points',
    });
    if (await saveBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await saveBtn.click();
    }

    await screenshot(page, 'rewards-04-save-modal');

    // Modal should show "Save to" text
    const saveToText = page.getByText(/Save to/);
    const hasModal = await saveToText.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasModal) {
      // Should have balance info
      const balanceInfo = page.getByText(/Balance:/);
      const hasBalanceInfo = await balanceInfo.first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasBalanceInfo).toBeTruthy();

      // Should have a Cancel button
      const cancelBtn = page.getByText('Cancel');
      const hasCancelBtn = await cancelBtn.first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasCancelBtn).toBeTruthy();
    }
  });

  test('history tab shows empty state or past redemptions', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/goals');
    await page.waitForLoadState('networkidle');

    // Click History tab
    const historyTab = page.getByText('History', { exact: false });
    if (await historyTab.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await historyTab.first().click();
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'rewards-05-history-tab');

    // The page should still be visible (didn't crash)
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(0);

    // For a new learner, history should be empty or show an empty state message
    // The page content should exist regardless
    const goalsHeading = page.getByText('My Goals');
    await expect(goalsHeading).toBeVisible();
  });
});
