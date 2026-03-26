import { test, expect } from '@playwright/test';
import {
  createTestUser as generateTestUser,
  registerParent as registerParentViaAPI,
  loginParent as loginViaAPI,
  spaNavigate,
  apiCall,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/auth';

test.describe('Auth: Registration & Login', () => {
  test('can register a new parent account via UI form', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Auth page should show login/register tabs
    const hasAuthForm = await page.getByText(/Register|Login/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    expect(hasAuthForm).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-auth-page.png`, fullPage: false });

    // Click Register tab (React Native uses accessibilityRole="tab")
    const registerTab = page.getByRole('tab', { name: /Register/i });
    if (await registerTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registerTab.click();
      await page.waitForTimeout(1000);
    }

    // Fill registration form using accessibility labels (React Native TextInputs)
    const ts = Date.now();
    const username = `e2e_reg_${ts}`;
    const email = `e2e_reg_${ts}@test.com`;
    const password = 'TestPassword123!';

    // React Native renders TextInput as <input> on web — use placeholder text
    const usernameField = page.getByPlaceholder(/choose a username/i);
    const emailField = page.getByPlaceholder(/enter your email/i);
    const nameField = page.getByPlaceholder(/enter your full name/i);
    const passwordField = page.getByPlaceholder(/create a password/i);
    const confirmField = page.getByPlaceholder(/confirm your password/i);

    await usernameField.fill(username);
    await emailField.fill(email);
    await nameField.fill(`E2E Test User ${ts}`);
    await passwordField.fill(password);
    await confirmField.fill(password);

    // Check the age disclaimer checkbox (required)
    const disclaimer = page.getByRole('checkbox').first();
    if (await disclaimer.isVisible({ timeout: 3000 }).catch(() => false)) {
      await disclaimer.click();
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-register-filled.png`, fullPage: false });

    // Submit the form
    const submitBtn = page.getByRole('button', { name: /Register|Sign Up|Create Account/i }).first();
    await submitBtn.click();
    await page.waitForLoadState('networkidle');

    // Should redirect to dashboard after registration
    await page.waitForTimeout(5000);
    const url = page.url();
    const onDashboard = url.includes('/dashboard') || url.includes('/welcome') || url.includes('/learner');
    const hasWelcomeContent = await page.getByText(/Dashboard|Welcome|Get Started|My Learners/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-post-register.png`, fullPage: false });
    expect(onDashboard || hasWelcomeContent).toBeTruthy();
  });

  test('can register and login via API', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const user = generateTestUser('api_auth');

    // Register
    const token = await registerParentViaAPI(page, user);
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(20);

    // Login with same credentials
    const loginToken = await loginViaAPI(page, user);
    expect(loginToken).toBeTruthy();
    expect(loginToken.length).toBeGreaterThan(20);
  });

  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Register a user first
    const user = generateTestUser('login_flow');
    const token = await registerParentViaAPI(page, user);

    // Set token and navigate to dashboard
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should be authenticated - navigate to dashboard
    await spaNavigate(page, '/dashboard');

    const hasDashContent = await page.getByText(/Dashboard|My Learners|Children/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-dashboard-after-login.png`, fullPage: false });
    expect(hasDashContent).toBeTruthy();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to login with non-existent user
    const result = await page.evaluate(async () => {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nonexistent_user_xyz', password: 'wrong' }),
      });
      return { status: res.status };
    });

    expect(result.status).toBeGreaterThanOrEqual(400);
  });

  test('authenticated user can access /api/user', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const user = generateTestUser('api_user');
    const token = await registerParentViaAPI(page, user);
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);

    const result = await apiCall(page, 'GET', '/api/user');
    expect(result.status).toBe(200);
    expect(result.data.username).toBe(user.username);
  });

  test('unauthenticated request to protected route returns 401', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Clear any existing token
    await page.evaluate(() => localStorage.removeItem('AUTH_TOKEN'));

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/learners', {
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: res.status };
    });

    expect(result.status).toBe(401);
  });

  test('full registration journey: register → add child → see learner', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Register
    const user = generateTestUser('journey');
    const token = await registerParentViaAPI(page, user);
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);

    // Create a child
    const childName = `JourneyKid_${Date.now()}`;
    const childResult = await apiCall(page, 'POST', '/api/learners', {
      name: childName,
      grade: 3,
    });
    expect(childResult.status).toBeLessThan(300);
    expect(childResult.data.id).toBeTruthy();

    // Verify child appears in learners list
    const learnersResult = await apiCall(page, 'GET', '/api/learners');
    expect(learnersResult.status).toBe(200);
    const childFound = Array.isArray(learnersResult.data)
      ? learnersResult.data.some((l: any) => l.name === childName)
      : false;
    expect(childFound).toBeTruthy();

    // Navigate to dashboard and verify child shows
    await page.reload();
    await page.waitForLoadState('networkidle');
    await spaNavigate(page, '/dashboard');

    const hasChild = await page.getByText(new RegExp(childName.slice(0, 10), 'i'))
      .first().isVisible({ timeout: 15000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-journey-dashboard-with-child.png`, fullPage: false });
    expect(hasChild).toBeTruthy();
  });
});
