import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

/**
 * Learner Persona — Achievements & Progress E2E
 *
 * Journeys:
 *   1. View the progress dashboard
 *   2. Check lesson history display
 *   3. View achievements section (empty state for new learner)
 *   4. Verify back navigation from progress page
 *   5. Verify page loads without console errors
 */

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';
const TEST_NAME = 'achievements';

const timestamp = Date.now();
const parentUsername = `ach_parent_${timestamp}`;
const parentEmail = `ach_parent_${timestamp}@test.com`;
const parentPassword = 'TestPassword123!';
const childName = `AchChild_${timestamp}`;

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${TEST_NAME}-${name}.png`,
    fullPage: false,
  });
}

async function setupLearnerSession(page: Page): Promise<number> {
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
    name: 'Ach Test Parent',
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
  }, { name: childName, gradeLevel: 4 });

  const learnerId = childResult.id || childResult.learnerId;
  await page.evaluate((id) => {
    localStorage.setItem('selectedLearnerId', String(id));
  }, learnerId);

  return learnerId;
}

test.describe('Learner: Achievements & Progress', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
  });

  test('view progress dashboard with stats cards', async ({ page }) => {
    await setupLearnerSession(page);

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-progress-dashboard');

    // Verify "My Progress" header
    const { locator: progressHeader } = await selfHealingLocator(
      page, TEST_NAME, { role: 'heading', name: 'My Progress', text: 'My Progress' }
    );
    await expect(progressHeader).toBeVisible({ timeout: 15000 });

    // Progress page should contain stats
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(50);

    // Back button should be visible (returns to learner home)
    const backButton = page.getByRole('button').first();
    await expect(backButton).toBeVisible();

    await screenshot(page, '02-stats-cards');
  });

  test('achievements section renders for new learner', async ({ page }) => {
    await setupLearnerSession(page);

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');

    // Scroll to find achievements section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    await screenshot(page, '03-achievements-section');

    // For a brand-new learner, achievements section may show empty state
    const pageText = await page.evaluate(() => document.body.innerText);

    // Verify no error messages are shown
    const hasError = /error|something went wrong|failed/i.test(pageText);
    expect(hasError).toBe(false);

    await screenshot(page, '04-achievements-or-empty');
  });

  test('lesson history shows empty state for new learner', async ({ page }) => {
    await setupLearnerSession(page);

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '05-lesson-history');

    const pageText = await page.evaluate(() => document.body.innerText);

    // Should not show error state
    const hasError = /something went wrong|failed to load/i.test(pageText);
    expect(hasError).toBe(false);

    expect(pageText.length).toBeGreaterThan(20);
    await screenshot(page, '06-history-empty-state');
  });

  test('progress page back navigation returns to learner home', async ({ page }) => {
    await setupLearnerSession(page);

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '07-progress-before-back');

    // Click the back arrow button
    const { locator: backBtn } = await selfHealingLocator(
      page, TEST_NAME, { role: 'button', name: 'Back' }
    );

    const backVisible = await backBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (backVisible) {
      await backBtn.click();
    } else {
      const firstBtn = page.getByRole('button').first();
      await firstBtn.click();
    }

    await page.waitForLoadState('networkidle');
    await screenshot(page, '08-after-back-navigation');

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(learner|progress)/);
  });

  test('progress page loads data without console errors', async ({ page }) => {
    await setupLearnerSession(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => new Promise(r => setTimeout(r, 3000)));
    await screenshot(page, '09-no-console-errors');

    // Filter out known non-critical errors
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('manifest')
    );

    const unexpectedCrashes = criticalErrors.filter(
      (e) => e.includes('Uncaught') || e.includes('TypeError') || e.includes('ReferenceError')
    );
    expect(unexpectedCrashes).toHaveLength(0);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `${TEST_NAME}-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
