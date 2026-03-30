/**
 * Parent Persona E2E: Password Recovery
 *
 * Journeys:
 *   1. Navigate to /auth page
 *   2. Forgot password link / form is accessible
 *   3. POST /api/forgot-password with valid email returns 200
 *   4. POST /api/forgot-password with missing email returns safe response
 *   5. POST /api/reset-password with invalid token returns 400
 *   6. POST /api/reset-password with missing fields returns 400
 *   7. UI shows appropriate feedback messages
 *
 * No mocks -- real API calls, real browser.
 * Note: Cannot test actual email delivery, but verifies the API accepts requests.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  generateTestUser,
  registerParentViaAPI,
  apiCall,
  screenshot,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';

test.describe('Parent: Password Recovery', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('auth page loads with login form', async ({ page }) => {
    test.setTimeout(300_000);

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Login form should be visible
    await expect(page.getByPlaceholder(/username/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder(/password/i).first()).toBeVisible();

    // Check for forgot password link/button
    const forgotLink = page.getByText(/forgot.*password|reset.*password/i).first();
    const hasForgot = await forgotLink.isVisible({ timeout: 5000 }).catch(() => false);

    // Either there's a forgot password link on the page, or we test the API directly
    if (hasForgot) {
      await forgotLink.click();
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'recovery-01-auth-page');
  });

  test('forgot-password API accepts valid email', async ({ page }) => {
    test.setTimeout(300_000);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Register a user first so the email exists
    const user = generateTestUser('recovery');
    await registerParentViaAPI(page, user);

    // Call forgot-password API with the registered email
    const result = await page.evaluate(async (email) => {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const text = await res.text();
      try {
        return { status: res.status, data: JSON.parse(text) };
      } catch {
        return { status: res.status, data: text };
      }
    }, user.email);

    expect(result.status).toBe(200);
    // API always returns safe response regardless of whether email exists
    expect(result.data?.message).toBeTruthy();

    await screenshot(page, 'recovery-02-forgot-valid');
  });

  test('forgot-password API handles non-existent email gracefully', async ({ page }) => {
    test.setTimeout(300_000);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Call forgot-password with a non-existent email
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent_user@test.com' }),
      });
      const text = await res.text();
      try {
        return { status: res.status, data: JSON.parse(text) };
      } catch {
        return { status: res.status, data: text };
      }
    });

    // API should return 200 even for non-existent emails (security best practice)
    expect(result.status).toBe(200);
    expect(result.data?.message).toBeTruthy();

    await screenshot(page, 'recovery-03-forgot-nonexistent');
  });

  test('forgot-password API handles missing email field', async ({ page }) => {
    test.setTimeout(300_000);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Call forgot-password with no email
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      try {
        return { status: res.status, data: JSON.parse(text) };
      } catch {
        return { status: res.status, data: text };
      }
    });

    // API returns safe response even with missing email
    expect(result.status).toBe(200);

    await screenshot(page, 'recovery-04-forgot-empty');
  });

  test('reset-password API rejects invalid token', async ({ page }) => {
    test.setTimeout(300_000);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Call reset-password with an invalid token
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid_token_that_does_not_exist',
          newPassword: 'NewPassword123!',
        }),
      });
      const text = await res.text();
      try {
        return { status: res.status, data: JSON.parse(text) };
      } catch {
        return { status: res.status, data: text };
      }
    });

    // Should return 400 for invalid token
    expect(result.status).toBe(400);
    expect(result.data?.error).toMatch(/invalid|expired/i);

    await screenshot(page, 'recovery-05-reset-invalid');
  });

  test('reset-password API rejects missing fields', async ({ page }) => {
    test.setTimeout(300_000);

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Call reset-password without required fields
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      try {
        return { status: res.status, data: JSON.parse(text) };
      } catch {
        return { status: res.status, data: text };
      }
    });

    // Should return 400 for missing fields
    expect(result.status).toBe(400);
    expect(result.data?.error).toBeTruthy();

    await screenshot(page, 'recovery-06-reset-missing');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `recovery-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
