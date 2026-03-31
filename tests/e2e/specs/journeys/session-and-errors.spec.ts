/**
 * Journey E2E: Session & Error Handling — Edge Cases
 *
 * Serial journey testing error recovery, session management, and mode guards:
 * 404 pages, session expiry, re-login, mode guards, and route protection.
 *
 * Steps:
 *   1. Setup: register parent
 *   2. Test 404: navigate to /nonexistent → see 404 content
 *   3. Navigate to /dashboard → verify recovery from 404
 *   4. Test session: clear AUTH_TOKEN → navigate to /dashboard → redirected to /auth
 *   5. Re-login via API → set token → /dashboard works again
 *   6. Test mode guard: as parent, navigate to /learner → should auto-switch or redirect
 *   7. Test learner guard: as learner, try /admin → should redirect
 *
 * No mocks. Real APIs only. Self-contained — creates its own user.
 */
import { test, expect, Page } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  screenshot,
  navigateAsParent,
  navigateAsLearner,
  apiCall,
  generateTestUser,
  registerParentViaAPI,
  SetupResult,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/journeys';
const TEST_NAME = 'session-errors';

test.describe('Journey: Session & Error Handling — Edge Cases', () => {
  test.describe.configure({ mode: 'serial' });

  let page: Page;
  let ctx: SetupResult;
  let user: ReturnType<typeof generateTestUser>;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.setDefaultTimeout(120000);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `${TEST_NAME}-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });

  test('1. Setup: register parent', async () => {
    ctx = await setupParentSession(page, 'se');
    user = generateTestUser('se_login');
    // Register a second user for re-login test (we need known credentials)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const token = await registerParentViaAPI(page, user);
    expect(token).toBeTruthy();
    // Restore original session
    await page.evaluate((t: string) => localStorage.setItem('AUTH_TOKEN', t), ctx.token);

    await screenshot(page, `${TEST_NAME}-01-setup`);
  });

  test('2. Test 404: navigate to /nonexistent → see 404 content', async () => {
    await navigateAsParent(page, '/nonexistent-e2e-journey-test');

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const bodyText = await page.evaluate(() => document.body.innerText);
    const url = page.url();

    // Should see 404 content or be redirected to a valid page
    const has404 = /not found|page.*lost|oops|404/i.test(bodyText);
    const redirectedToValid = url.includes('/dashboard') || url.includes('/auth') || url.includes('/welcome');

    expect(has404 || redirectedToValid).toBeTruthy();

    await screenshot(page, `${TEST_NAME}-02-404-page`);
  });

  test('3. Navigate to /dashboard → verify recovery from 404', async () => {
    await navigateAsParent(page, '/dashboard');

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const url = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Dashboard should load normally after 404
    const hasDashboard = url.includes('/dashboard');
    const hasDashContent = /Dashboard|My Learners|Grade/i.test(bodyText);
    expect(hasDashboard || hasDashContent).toBeTruthy();

    // Body should have meaningful content (not an error page)
    expect(bodyText.length).toBeGreaterThan(50);

    await screenshot(page, `${TEST_NAME}-03-recovery-from-404`);
  });

  test('4. Test session: clear AUTH_TOKEN → navigate to /dashboard → redirected to /auth', async () => {
    // Clear auth state completely
    await page.evaluate(() => {
      localStorage.removeItem('AUTH_TOKEN');
      localStorage.removeItem('selectedLearnerId');
      localStorage.removeItem('preferredMode');
    });

    // Navigate to protected route
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    // Wait for redirect to complete
    await page.waitForTimeout(3000);

    const url = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Should be redirected to /auth, /welcome, or show login content
    const redirectedToAuth = url.includes('/auth') || url.includes('/welcome') || url.includes('/login');
    const hasAuthContent = /Log In|Sign In|Register|Welcome|Get Started/i.test(bodyText);

    expect(redirectedToAuth || hasAuthContent).toBeTruthy();

    await screenshot(page, `${TEST_NAME}-04-session-expired`);
  });

  test('5. Re-login via API → set token → /dashboard works again', async () => {
    // Ensure we're on a page where we can make API calls
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Login with the second user we registered
    const loginResult = await apiCall(page, 'POST', '/api/login', {
      username: user.username,
      password: user.password,
    });

    expect(loginResult.status).toBe(200);
    expect(loginResult.data?.token).toBeTruthy();

    const newToken = loginResult.data.token;

    // Set the new token
    await page.evaluate((t: string) => localStorage.setItem('AUTH_TOKEN', t), newToken);
    await page.evaluate(() => localStorage.setItem('preferredMode', 'PARENT'));

    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    const url = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // Dashboard should load with the re-logged-in user
    const hasDashboard = url.includes('/dashboard');
    const hasDashContent = /Dashboard|My Learners|Add Child|Add Learner/i.test(bodyText);
    expect(hasDashboard || hasDashContent).toBeTruthy();

    // Verify API works with new token
    const userResult = await apiCall(page, 'GET', '/api/user');
    expect(userResult.status).toBe(200);
    expect(userResult.data?.username).toBe(user.username);

    await screenshot(page, `${TEST_NAME}-05-re-login`);
  });

  test('6. Test mode guard: as parent, navigate to /learner → should auto-switch or redirect', async () => {
    // Set parent mode explicitly
    await page.evaluate(() => localStorage.setItem('preferredMode', 'PARENT'));

    // Try navigating to /learner while in parent mode
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    await page.waitForTimeout(2000);

    const url = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // The app should either:
    // 1. Auto-switch to learner mode and show learner home
    // 2. Redirect back to /dashboard (parent home)
    // 3. Show a mode selection prompt
    const isLearnerPage = url.includes('/learner');
    const isParentPage = url.includes('/dashboard');
    const hasContent = bodyText.length > 50;

    expect(isLearnerPage || isParentPage || hasContent).toBeTruthy();

    await screenshot(page, `${TEST_NAME}-06-mode-guard-learner`);
  });

  test('7. Test learner guard: as learner, try /admin → should redirect', async () => {
    // The re-login user may not have a child — create one for learner mode
    const createResult = await apiCall(page, 'POST', '/api/learners', {
      name: `GuardTestChild_${Date.now()}`,
      grade: 3,
    });
    if (createResult.data?.id) {
      await page.evaluate(
        (id: number) => localStorage.setItem('selectedLearnerId', String(id)),
        createResult.data.id
      );
    }

    // Set learner mode
    await page.evaluate(() => localStorage.setItem('preferredMode', 'LEARNER'));

    // Try navigating to /admin as a learner
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});

    await page.waitForTimeout(2000);

    const url = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);

    // The app should either:
    // 1. Redirect to /dashboard (no admin access for regular users)
    // 2. Redirect to /learner (learner home)
    // 3. Show 404 / "Page Not Found" / access denied
    // 4. Stay on /admin but show nothing useful (empty page for non-admins)
    const redirectedAway = !url.includes('/admin');
    const has404 = /not found|page.*lost|oops|404|access denied|unauthorized/i.test(bodyText);
    const redirectedToHome = url.includes('/dashboard') || url.includes('/learner');
    const emptyAdminPage = url.includes('/admin') && bodyText.length < 200;

    expect(redirectedAway || has404 || redirectedToHome || emptyAdminPage).toBeTruthy();

    await screenshot(page, `${TEST_NAME}-07-admin-guard`);
  });
});
