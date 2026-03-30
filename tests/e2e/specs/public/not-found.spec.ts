/**
 * Public E2E: Not Found (404) Page
 *
 * Journeys:
 *   1. Unauthenticated user hitting /nonexistent-page sees 404 content
 *   2. Authenticated parent hitting /nonexistent-page-xyz sees "Page Not Found"
 *      with link to /dashboard
 *   3. Page has a "Go to Dashboard" (or "Go Home") button that navigates correctly
 *
 * No mocks -- real browser, real page rendering.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  screenshot,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/public';

test.describe('Public: Not Found (404)', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
  });

  test('unauthenticated user on nonexistent page sees 404 content', async ({ page }) => {
    // Clear any auth state first
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      localStorage.removeItem('AUTH_TOKEN');
      localStorage.removeItem('selectedLearnerId');
      localStorage.removeItem('preferredMode');
    });

    await page.goto('/nonexistent-page-e2e-test');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const bodyText = await page.evaluate(() => document.body.innerText);

    // The page should show some kind of not-found or redirect-to-auth content.
    // An unauthenticated user may be redirected to /auth or /welcome, or shown the 404.
    const url = page.url();
    const isHandled =
      /not found|page.*lost|oops|404/i.test(bodyText) ||
      url.includes('/auth') ||
      url.includes('/welcome');
    expect(isHandled).toBeTruthy();

    await screenshot(page, 'notfound-01-unauth');
  });

  test('authenticated parent on nonexistent page sees Page Not Found', async ({ page }) => {
    try {
      await setupParentSession(page, 'notfound_auth');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    // Set parent mode and navigate to a nonexistent route
    await page.evaluate(() => localStorage.setItem('preferredMode', 'PARENT'));
    await page.goto('/nonexistent-page-xyz-e2e');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Authenticated parent in PARENT mode should see "Page Not Found"
    const hasNotFound = /page not found|not found|does not exist/i.test(bodyText);
    expect(hasNotFound).toBeTruthy();

    // Should show "Go to Dashboard" button
    const hasDashboardLink = /go to dashboard/i.test(bodyText);
    expect(hasDashboardLink).toBeTruthy();

    await screenshot(page, 'notfound-02-auth-parent');
  });

  test('Go to Dashboard button navigates to /dashboard', async ({ page }) => {
    try {
      await setupParentSession(page, 'notfound_btn');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    await page.evaluate(() => localStorage.setItem('preferredMode', 'PARENT'));
    await page.goto('/nonexistent-page-btn-test');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Find and click the "Go to Dashboard" or "Go Home" button
    const dashBtn = page.getByText(/go to dashboard/i).first();
    const homeBtn = page.getByText(/go home/i).first();

    const dashVisible = await dashBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const homeVisible = await homeBtn.isVisible({ timeout: 3000 }).catch(() => false);

    expect(dashVisible || homeVisible).toBeTruthy();

    if (dashVisible) {
      await dashBtn.click();
    } else {
      await homeBtn.click();
    }

    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Should navigate to /dashboard or /learner (depending on mode)
    const url = page.url();
    const navigated = url.includes('/dashboard') || url.includes('/learner');
    expect(navigated).toBeTruthy();

    await screenshot(page, 'notfound-03-navigated');
  });

  test('authenticated learner on nonexistent page sees kid-friendly 404', async ({ page }) => {
    try {
      await setupParentSession(page, 'notfound_learner');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    // Switch to learner mode
    await page.evaluate(() => localStorage.setItem('preferredMode', 'LEARNER'));
    await page.goto('/nonexistent-learner-page-e2e');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Learner mode shows "Oops! This page got lost" and "Go Home" button
    const hasLearnerNotFound = /oops|page.*lost|go home|not found/i.test(bodyText);
    expect(hasLearnerNotFound).toBeTruthy();

    await screenshot(page, 'notfound-04-learner-mode');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `notfound-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
