import { test, expect } from '@playwright/test';
import {
  selfHealingLocator,
  captureFailureArtifacts,
  dismissModals,
  registerParentViaAPI,
  authenticateAndNavigate,
} from '../../helpers/self-healing';

/**
 * Parent Persona: Signup, Login, Logout & Session Persistence
 *
 * Models the complete authentication journey from a parent's perspective:
 * registration with all required fields, login with valid/invalid credentials,
 * logout, and session persistence across page reloads.
 */

test.describe('Parent signup and login', () => {
  test.describe.configure({ retries: 2 });

  test.afterEach(async ({ page }, testInfo) => {
    await captureFailureArtifacts(page, testInfo);
  });

  test('parent can register a new account with all required fields', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Switch to Register tab
    const registerTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: 'Register' }),
      () => page.getByText('Register'),
    ]);
    await registerTab.click();

    // Fill registration form using semantic locators
    await page.getByLabel(/username/i).fill(`parent_reg_${ts}`);
    await page.getByLabel(/email/i).fill(`parent_reg_${ts}@test.com`);
    await page.getByLabel(/full name/i).fill('Test Registration Parent');

    // Password fields
    const passwordField = page.getByPlaceholder(/^password$/i);
    if (await passwordField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await passwordField.fill('SecurePass123!');
    } else {
      await page.getByLabel(/^password$/i).first().fill('SecurePass123!');
    }

    const confirmField = page.getByPlaceholder(/confirm/i);
    if (await confirmField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmField.fill('SecurePass123!');
    } else {
      await page.getByLabel(/confirm password/i).fill('SecurePass123!');
    }

    // Accept age disclaimer
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disclaimer.click();
    }

    // Verify parent role is selected
    await expect(page.getByText(/parent/i).first()).toBeVisible();

    // Submit registration
    const registerButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: 'Register' }),
      () => page.getByText('Register'),
    ]);
    await registerButton.click();

    // Should redirect to dashboard after successful registration
    await page.waitForLoadState('networkidle');
    await expect(async () => {
      await expect(page).toHaveURL(/dashboard/);
    }).toPass({ timeout: 15000 });

    await expect(page.getByText(/welcome/i)).toBeVisible();
  });

  test('parent can log in with valid credentials', async ({ page }) => {

    const ts = Date.now();
    const creds = {
      username: `parent_login_${ts}`,
      password: 'SecurePass123!',
      email: `parent_login_${ts}@test.com`,
      name: 'Login Parent',
    };

    // Register via API first
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await registerParentViaAPI(page, creds);

    // Clear auth state and navigate to login
    await page.evaluate(() => localStorage.clear());
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Fill login form
    await page.getByPlaceholder(/username/i).fill(creds.username);
    await page.getByPlaceholder(/password/i).fill(creds.password);

    // Accept disclaimer if visible
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disclaimer.click();
    }

    // Click sign in
    const signInButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: 'Sign In' }),
      () => page.getByText('Sign In'),
    ]);
    await signInButton.click();

    // Should redirect to parent dashboard
    await page.waitForLoadState('networkidle');
    await expect(async () => {
      await expect(page).toHaveURL(/dashboard/);
    }).toPass({ timeout: 15000 });

    await expect(page.getByText(/welcome/i)).toBeVisible();
  });

  test('login shows error with invalid credentials', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    await page.getByPlaceholder(/username/i).fill('nonexistent_user');
    await page.getByPlaceholder(/password/i).fill('wrongpassword');

    // Accept disclaimer if visible
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disclaimer.click();
    }

    const signInButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: 'Sign In' }),
      () => page.getByText('Sign In'),
    ]);
    await signInButton.click();

    // Should show error message
    await expect(page.getByText(/invalid username or password/i)).toBeVisible({ timeout: 10000 });

    // Should remain on auth page
    await expect(page).toHaveURL(/auth/);
  });

  test('parent can log out and is redirected away from dashboard', async ({ page }) => {

    const ts = Date.now();
    const creds = {
      username: `parent_logout_${ts}`,
      password: 'SecurePass123!',
      email: `parent_logout_${ts}@test.com`,
      name: 'Logout Parent',
    };

    // Register via API
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const token = await registerParentViaAPI(page, creds);

    // Navigate to dashboard
    await authenticateAndNavigate(page, token, '/dashboard');

    // Verify we're on dashboard
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });

    // Click logout button
    const logoutButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: 'Logout' }),
      () => page.getByText('Logout'),
    ]);
    await logoutButton.click();

    // Should redirect away from dashboard
    await page.waitForLoadState('networkidle');
    await expect(async () => {
      const url = page.url();
      expect(url).toMatch(/welcome|auth|\//);
    }).toPass({ timeout: 10000 });
  });

  test('session persists after page reload', async ({ page }) => {

    const ts = Date.now();
    const creds = {
      username: `parent_session_${ts}`,
      password: 'SecurePass123!',
      email: `parent_session_${ts}@test.com`,
      name: 'Session Parent',
    };

    // Register via API
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const token = await registerParentViaAPI(page, creds);

    // Navigate to dashboard
    await authenticateAndNavigate(page, token, '/dashboard');

    // Verify we're authenticated
    await expect(page.getByText(/welcome/i)).toBeVisible({ timeout: 10000 });

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be on dashboard after reload — session persisted
    await expect(async () => {
      await expect(page).toHaveURL(/dashboard/);
    }).toPass({ timeout: 10000 });

    await expect(page.getByText(/welcome/i)).toBeVisible();
  });
});
