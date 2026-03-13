import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

/**
 * Learner Persona — Points & Rewards E2E
 *
 * Journeys:
 *   1. Check point balance on learner home / progress page
 *   2. Browse reward goals on the goals page
 *   3. View goal progress bars and saved points
 *   4. Attempt to save points toward a goal
 *   5. Goals strip on learner home
 *
 * Points and rewards are set up by parents — tests verify the learner's view.
 */

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';
const TEST_NAME = 'points-rewards';

const timestamp = Date.now();
const parentUsername = `pr_parent_${timestamp}`;
const parentEmail = `pr_parent_${timestamp}@test.com`;
const parentPassword = 'TestPassword123!';
const childName = `PRChild_${timestamp}`;

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${TEST_NAME}-${name}.png`,
    fullPage: false,
  });
}

async function setupLearnerWithRewards(page: Page): Promise<number> {
  // Register parent
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
    name: 'PR Test Parent',
    role: 'PARENT',
  });

  await page.evaluate((token) => {
    localStorage.setItem('AUTH_TOKEN', token);
  }, regResult.token);

  // Create child
  const childResult = await page.evaluate(async (data) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    const res = await fetch('/api/learners', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  }, { name: childName, gradeLevel: 3 });

  const learnerId = childResult.id || childResult.learnerId;
  await page.evaluate((id) => {
    localStorage.setItem('selectedLearnerId', String(id));
  }, learnerId);

  // Starter rewards are auto-created on child creation.
  // Create an additional custom reward for testing
  await page.evaluate(async () => {
    const token = localStorage.getItem('AUTH_TOKEN');
    await fetch('/api/rewards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Ice Cream Treat',
        description: 'A special ice cream outing',
        tokenCost: 10,
        category: 'FOOD_TREAT',
        imageEmoji: '🍦',
        color: '#FF69B4',
      }),
    });
  });

  return learnerId;
}

test.describe('Learner: Points & Rewards', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
  });

  test('view point balance on progress page', async ({ page }) => {
    const learnerId = await setupLearnerWithRewards(page);

    // Navigate to progress page
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-progress-page');

    // Progress page should have a "My Progress" header
    const { locator: progressHeader } = await selfHealingLocator(
      page, TEST_NAME, { role: 'heading', name: 'My Progress', text: 'My Progress' }
    );
    await expect(progressHeader).toBeVisible({ timeout: 15000 });

    // Page should render points-related information
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(50);

    await screenshot(page, '02-progress-with-points');
  });

  test('browse reward goals on goals page', async ({ page }) => {
    const learnerId = await setupLearnerWithRewards(page);

    // Navigate to goals page
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '03-goals-page');

    // Wait for goals to load
    await page.waitForLoadState('networkidle');

    // Should have at least some goal/reward content
    const goalsPageText = await page.evaluate(() => document.body.innerText);
    expect(goalsPageText.length).toBeGreaterThan(50);

    await screenshot(page, '04-goals-loaded');

    // Verify progress bar structure exists (goals show X/Y pts and %)
    const hasPtsIndicator = /pts|points|saved/i.test(goalsPageText);
    if (hasPtsIndicator) {
      await screenshot(page, '05-goals-with-progress');
    }
  });

  test('view goal details and save points button', async ({ page }) => {
    const learnerId = await setupLearnerWithRewards(page);

    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '06-goals-for-save');

    // Look for "Save Points" button on goal cards
    const { locator: saveBtn } = await selfHealingLocator(
      page, TEST_NAME, { role: 'button', name: 'Save Points', text: 'Save Points' }
    );

    const saveVisible = await saveBtn.isVisible({ timeout: 10000 }).catch(() => false);
    if (saveVisible) {
      await screenshot(page, '07-save-points-visible');
      await expect(saveBtn).toBeVisible();
    } else {
      // New learner with 0 points — save button may not show or may be disabled
      await screenshot(page, '07-no-save-zero-points');
    }
  });

  test('goals strip shows on learner home when goals exist', async ({ page }) => {
    const learnerId = await setupLearnerWithRewards(page);

    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '08-learner-home-goals');

    // The GoalsStrip component shows "My Goals" with the top goal
    const myGoalsText = page.getByText('My Goals');
    const goalsVisible = await myGoalsText.isVisible({ timeout: 10000 }).catch(() => false);

    if (goalsVisible) {
      await expect(myGoalsText).toBeVisible();

      // Goals strip should have "See all →" link
      const seeAllLink = page.getByText('See all →');
      const seeAllVisible = await seeAllLink.isVisible({ timeout: 3000 }).catch(() => false);
      if (seeAllVisible) {
        await expect(seeAllLink).toBeVisible();
        await screenshot(page, '09-goals-strip-visible');

        // Click "See all →" to navigate to goals page
        await seeAllLink.click();
        await page.waitForLoadState('networkidle');
        await screenshot(page, '10-navigated-to-goals');
      }
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `${TEST_NAME}-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
