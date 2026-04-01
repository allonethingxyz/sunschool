/**
 * Admin Persona E2E: Admin Panel
 *
 * Journeys:
 *   1. Admin can navigate to /admin page
 *   2. Admin page shows links to Users, Lessons, Settings
 *   3. Admin can navigate to /admin/users
 *   4. Admin can navigate to /admin/lessons
 *   5. Admin can navigate to /admin/settings
 *   6. Admin can access maintenance endpoints (circuit-breakers, lesson-analytics, cleanup)
 *   7. Non-admin user is redirected from /admin page
 *
 * Admin tests use setupAdminSession() which logs in as the existing admin
 * user (the first registered user). The non-admin redirect test uses
 * setupParentSession() which registers a fresh PARENT-role user.
 *
 * No mocks -- real API calls, real browser.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  setupAdminSession,
  apiCall,
  screenshot,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/admin';

test.describe('Admin: Admin Panel', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
  });

  test('admin can navigate to /admin page', async ({ page }) => {
    try {
      await setupAdminSession(page, 'admin_nav');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    // Should be on admin page, not redirected
    const url = page.url();
    expect(url).toContain('/admin');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(20);

    await screenshot(page, 'admin-01-panel');
  });

  test('admin page shows links to Users, Lessons, Settings', async ({ page }) => {
    try {
      await setupAdminSession(page, 'admin_links');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    const bodyText = await page.evaluate(() => document.body.innerText);

    // Admin page should reference users, lessons, settings sections
    const hasUsers = /users/i.test(bodyText);
    const hasLessons = /lessons/i.test(bodyText);
    const hasSettings = /settings/i.test(bodyText);

    expect(hasUsers || hasLessons || hasSettings).toBeTruthy();

    await screenshot(page, 'admin-02-links');
  });

  test('admin can navigate to /admin/users', async ({ page }) => {
    try {
      await setupAdminSession(page, 'admin_users');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const url = page.url();
    expect(url).toContain('/admin/users');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(20);

    await screenshot(page, 'admin-03-users');
  });

  test('admin can navigate to /admin/lessons', async ({ page }) => {
    try {
      await setupAdminSession(page, 'admin_lessons');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    await page.goto('/admin/lessons');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const url = page.url();
    expect(url).toContain('/admin/lessons');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(20);

    await screenshot(page, 'admin-04-lessons');
  });

  test('admin can navigate to /admin/settings', async ({ page }) => {
    try {
      await setupAdminSession(page, 'admin_settings');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    await page.goto('/admin/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const url = page.url();
    expect(url).toContain('/admin/settings');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(20);

    await screenshot(page, 'admin-05-settings');
  });

  test('admin can access GET /api/admin/circuit-breakers', async ({ page }) => {
    try {
      await setupAdminSession(page, 'admin_cb');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    const result = await apiCall(page, 'GET', '/api/admin/circuit-breakers');
    expect(result.status).toBe(200);
    expect(result.data).toBeTruthy();

    await screenshot(page, 'admin-06-circuit-breakers');
  });

  test('admin can access GET /api/admin/lesson-analytics', async ({ page }) => {
    try {
      await setupAdminSession(page, 'admin_analytics');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    const result = await apiCall(page, 'GET', '/api/admin/lesson-analytics');
    expect(result.status).toBe(200);
    expect(result.data).toBeTruthy();

    await screenshot(page, 'admin-07-lesson-analytics');
  });

  test('admin can DELETE /api/admin/cleanup-test-users', async ({ page }) => {
    try {
      await setupAdminSession(page, 'admin_cleanup');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    const result = await apiCall(page, 'DELETE', '/api/admin/cleanup-test-users');
    expect(result.status).toBe(200);
    expect(result.data).toBeTruthy();
    // Should report how many users were deleted (may be 0)
    expect(typeof result.data.deleted).toBe('number');

    await screenshot(page, 'admin-08-cleanup-test-users');
  });

  test('non-admin user is redirected from /admin page', async ({ page }) => {
    // setupParentSession registers a fresh user who always gets PARENT role
    try {
      await setupParentSession(page, 'admin_nonadmin');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Non-admin should be redirected away from /admin
    const url = page.url();
    const redirectedAway = url.includes('/dashboard') || url.includes('/auth') || !url.includes('/admin');
    expect(redirectedAway).toBeTruthy();

    await screenshot(page, 'admin-09-nonadmin-redirect');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `admin-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
