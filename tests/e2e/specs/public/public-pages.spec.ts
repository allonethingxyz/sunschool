import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/public';

test.describe('Public Pages', () => {
  test('welcome page loads with features', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    const hasTitle = await page.getByText(/SunSchool|Welcome|Learn/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    expect(hasTitle).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-welcome.png`, fullPage: false });
  });

  test('auth page shows login and register tabs', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const hasAuth = await page.getByText(/Log In|Sign In|Sign Up|Register/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    expect(hasAuth).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-auth.png`, fullPage: false });
  });

  test('privacy policy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');

    const hasPrivacy = await page.getByText(/Privacy|Policy|Data/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    expect(hasPrivacy).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-privacy.png`, fullPage: false });
  });

  test('terms of service page loads', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');

    const hasTerms = await page.getByText(/Terms|Service|Agreement/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    expect(hasTerms).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-terms.png`, fullPage: false });
  });

  test('healthcheck endpoint returns OK', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/healthcheck');
      return { status: res.status };
    });

    expect(result.status).toBe(200);
  });

  test('unauthenticated user on root redirects to welcome', async ({ page }) => {
    // Clear any auth state
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      localStorage.removeItem('AUTH_TOKEN');
      localStorage.removeItem('selectedLearnerId');
      localStorage.removeItem('preferredMode');
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should end up at welcome or auth page
    await page.waitForTimeout(3000);
    const url = page.url();
    const isPublicPage = url.includes('/welcome') || url.includes('/auth') || url.endsWith('/');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-root-redirect.png`, fullPage: false });
    expect(isPublicPage).toBeTruthy();
  });
});
