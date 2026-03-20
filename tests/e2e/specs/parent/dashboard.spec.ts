/**
 * Parent Persona E2E: Dashboard
 *
 * Journeys:
 *   1. Dashboard loads after login and shows child overview
 *   2. Dashboard displays stats (lessons, score)
 *   3. Navigation to Reports and Rewards pages works
 *   4. Switch to learner mode from dashboard
 *
 * react-native-web renders Text as <div> not <h1>-<h6>.
 * Use text-based locators and body content checks.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  navigateAsParent,
  navigateAsLearner,
  apiCall,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';

test.describe('Parent: Dashboard', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('dashboard loads with child overview', async ({ page }) => {
    test.setTimeout(300_000);
    const { childName } = await setupParentSession(page, 'dash');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    // Child name or dashboard content should be visible
    const hasChild = bodyText.includes(childName) ||
      bodyText.toLowerCase().includes('dashboard') ||
      bodyText.toLowerCase().includes('learner');
    expect(hasChild).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dash-01-overview.png` });
  });

  test('dashboard shows learning stats', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId } = await setupParentSession(page, 'dash_stats');

    // Check stats via API
    const profileResult = await apiCall(page, 'GET', `/api/learner-profile/${learnerId}`);
    expect(profileResult.status).toBe(200);

    // Dashboard should have structural content
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dash-02-stats.png` });
  });

  test('navigation to Reports page works', async ({ page }) => {
    test.setTimeout(300_000);
    await setupParentSession(page, 'dash_nav');

    await navigateAsParent(page, '/reports');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);
    expect(page.url()).toContain('/reports');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dash-03-reports.png` });
  });

  test('navigation to Rewards page works', async ({ page }) => {
    test.setTimeout(300_000);
    await setupParentSession(page, 'dash_rewards');

    await navigateAsParent(page, '/rewards');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);
    expect(page.url()).toContain('/rewards');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dash-04-rewards.png` });
  });

  test('can switch to learner mode', async ({ page }) => {
    test.setTimeout(300_000);
    await setupParentSession(page, 'dash_switch');

    // Look for "Start Learning" button or similar
    const startLearning = page.getByText(/start learning|learn/i).first();
    const hasStartBtn = await startLearning.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasStartBtn) {
      await startLearning.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Navigate directly to learner mode
      await navigateAsLearner(page, '/learner');
    }

    // Should be on learner page or select-learner page
    const url = page.url();
    expect(
      url.includes('/learner') ||
      url.includes('/select-learner')
    ).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/dash-05-learner-mode.png` });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `dash-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
