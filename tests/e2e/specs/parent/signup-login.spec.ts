import { test, expect } from '@playwright/test';
import {
  selfHealingLocator,
  captureFailureArtifacts,
  dismissModals,
  registerParentViaAPI,
  loginViaAPI,
  authenticateAndNavigate,
} from '../../helpers/self-healing';

/**
 * Parent Persona: Signup, Login, Logout & Session Persistence
 *
 * Models the complete authentication journey a parent experiences
 * when first discovering Sunschool through to ongoing sessions.
 */

const ts = Date.now();
const parentUser = {
  username: `parent_signup_${ts}`,
  email: `parent_signup_${ts}@test.com`,
  password: 'TestPassword123!',
  name: 'Test Parent',
};

test.describe('Parent Signup & Login', () => {
  test.afterEach(async ({ page }, testInfo) => {
    await captureFailureArtifacts(page, testInfo);
  });

  test('full registration flow creates a parent account and lands on dashboard', async ({ page }) => {
    test.retry(2);

    // Navigate to the auth page
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Click the Register tab
    const registerTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: 'Register' }),
      () => page.getByText('Register', { exact: true }).first(),
    ]);
    await registerTab.click();

    // Fill out the registration form using semantic locators
    const usernameField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Choose a username'),
      () => page.getByLabel('Username'),
    ]);
    await usernameField.fill(parentUser.username);

    const emailField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Enter your email'),
      () => page.getByLabel('Email'),
    ]);
    await emailField.fill(parentUser.email);

    const nameField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Enter your full name'),
      () => page.getByLabel('Full Name'),
    ]);
    await nameField.fill(parentUser.name);

    const passwordField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Create a password'),
      () => page.getByLabel('Password').first(),
    ]);
    await passwordField.fill(parentUser.password);

    const confirmPasswordField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Confirm your password'),
      () => page.getByLabel('Confirm Password'),
    ]);
    await confirmPasswordField.fill(parentUser.password);

    // Ensure "Parent" account type is selected
    const parentOption = await selfHealingLocator(page, [
      () => page.getByText('Parent', { exact: true }),
      () => page.getByLabel('Parent'),
    ], { timeout: 5000 });
    await parentOption.click().catch(() => {
      // May already be selected by default
    });

    // Accept age disclaimer
    const disclaimer = await selfHealingLocator(page, [
      () => page.getByText(/I confirm I am at least 18 years old/),
      () => page.getByRole('checkbox', { name: /18 years old/ }),
    ]);
    await disclaimer.click();

    // Submit registration
    const registerButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /^Register$/ }),
      () => page.getByRole('button', { name: /Registering/ }),
    ]);
    await registerButton.click();

    // Should land on dashboard after successful registration
    await expect(async () => {
      const url = page.url();
      expect(url).toMatch(/\/(dashboard|learner|add-learner)/);
    }).toPass({ timeout: 30000 });

    // Dashboard should show welcome content
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    const welcomeText = await selfHealingLocator(page, [
      () => page.getByText(/Welcome/i),
      () => page.getByText(parentUser.name),
    ], { timeout: 10000 });
    await expect(welcomeText).toBeVisible();
  });

  test('login with valid credentials navigates to dashboard', async ({ page }) => {
    test.retry(2);

    // First register via API to ensure account exists
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    const loginTs = Date.now();
    const loginUser = {
      username: `parent_login_${loginTs}`,
      email: `parent_login_${loginTs}@test.com`,
      password: 'TestPassword123!',
      name: 'Login Test Parent',
    };
    await registerParentViaAPI(page, loginUser);

    // Now login through the UI
    const loginTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: 'Login' }),
      () => page.getByText('Login', { exact: true }).first(),
    ]);
    await loginTab.click();

    const usernameField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Enter your username'),
      () => page.getByLabel('Username'),
    ]);
    await usernameField.fill(loginUser.username);

    const passwordField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Enter your password'),
      () => page.getByLabel('Password'),
    ]);
    await passwordField.fill(loginUser.password);

    // Accept age disclaimer if present
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disclaimer.click();
    }

    // Click Login button
    const loginButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /^Login$/ }),
      () => page.getByRole('button', { name: /Logging in/ }),
    ]);
    await loginButton.click();

    // Should navigate to dashboard
    await expect(async () => {
      expect(page.url()).toMatch(/\/(dashboard|learner)/);
    }).toPass({ timeout: 30000 });
  });

  test('login with invalid credentials shows error message', async ({ page }) => {
    test.retry(2);

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Ensure we're on Login tab
    const loginTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: 'Login' }),
      () => page.getByText('Login', { exact: true }).first(),
    ]);
    await loginTab.click();

    const usernameField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Enter your username'),
      () => page.getByLabel('Username'),
    ]);
    await usernameField.fill('nonexistent_user_xyz');

    const passwordField = await selfHealingLocator(page, [
      () => page.getByPlaceholder('Enter your password'),
      () => page.getByLabel('Password'),
    ]);
    await passwordField.fill('WrongPassword999!');

    // Accept disclaimer if visible
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disclaimer.click();
    }

    const loginButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /^Login$/ }),
      () => page.getByRole('button', { name: /Logging in/ }),
    ]);
    await loginButton.click();

    // Should display an error message visible to the user
    await expect(async () => {
      const errorVisible =
        await page.getByText(/invalid/i).isVisible().catch(() => false) ||
        await page.getByText(/error/i).isVisible().catch(() => false) ||
        await page.getByText(/failed/i).isVisible().catch(() => false) ||
        await page.getByRole('alert').isVisible().catch(() => false);
      expect(errorVisible).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test('session persists across page reload', async ({ page }) => {
    test.retry(2);

    // Register and login via API
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const sessionTs = Date.now();
    const sessionUser = {
      username: `parent_session_${sessionTs}`,
      email: `parent_session_${sessionTs}@test.com`,
      password: 'TestPassword123!',
      name: 'Session Test Parent',
    };
    const token = await registerParentViaAPI(page, sessionUser);

    // Set auth and navigate to dashboard
    await authenticateAndNavigate(page, token, '/dashboard');
    await dismissModals(page);

    // Verify we're on dashboard
    await expect(async () => {
      expect(page.url()).toMatch(/dashboard/);
    }).toPass({ timeout: 15000 });

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Session should persist — still on dashboard (not redirected to /auth)
    await expect(async () => {
      const url = page.url();
      expect(url).toMatch(/\/(dashboard|learner|welcome)/);
      expect(url).not.toMatch(/\/auth/);
    }).toPass({ timeout: 15000 });
  });

  test('logout returns to public page', async ({ page }) => {
    test.retry(2);

    // Register and login via API
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const logoutTs = Date.now();
    const logoutUser = {
      username: `parent_logout_${logoutTs}`,
      email: `parent_logout_${logoutTs}@test.com`,
      password: 'TestPassword123!',
      name: 'Logout Test Parent',
    };
    const token = await registerParentViaAPI(page, logoutUser);

    // Navigate to dashboard
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Find and click logout — look for logout button in header/nav
    const logoutBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /logout/i }),
      () => page.getByRole('button', { name: /sign out/i }),
      () => page.getByText(/logout/i),
      () => page.getByLabel(/logout/i),
    ], { timeout: 10000 });
    await logoutBtn.click();

    // Should redirect to auth or welcome page
    await expect(async () => {
      const url = page.url();
      expect(url).toMatch(/\/(auth|welcome|login)/);
    }).toPass({ timeout: 15000 });
  });
});
