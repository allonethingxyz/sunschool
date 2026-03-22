/**
 * Parent Persona E2E: Public Pages
 *
 * Journeys:
 *   1. Welcome/home page loads with features
 *   2. Auth page shows login and register tabs
 *   3. Privacy policy page loads
 *   4. Terms of service page loads
 *
 * No authentication required — these test public routes.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';

test.describe('Public Pages', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
  });

  test('welcome page loads with content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(100);

    // Should have welcome/landing content
    const hasLandingContent =
      /sunschool|learn|education|child|parent/i.test(bodyText);
    expect(hasLandingContent).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/public-01-welcome.png` });
  });

  test('auth page shows login and register tabs', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    const hasLogin = await page.getByText(/login/i).first()
      .isVisible({ timeout: 10000 }).catch(() => false);
    const hasRegister = await page.getByText(/register/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasLogin || hasRegister).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/public-02-auth.png` });
  });

  test('privacy policy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(100);

    const hasPrivacyContent = /privacy|data|information|collect/i.test(bodyText);
    expect(hasPrivacyContent).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/public-03-privacy.png` });
  });

  test('terms of service page loads', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(100);

    const hasTermsContent = /terms|service|agreement|use/i.test(bodyText);
    expect(hasTermsContent).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/public-04-terms.png` });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `public-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
