import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

/**
 * Parent Persona: Signup, Login, Logout, Session Persistence
 *
 * Models the complete authentication journey from a parent's perspective:
 * registering a new account, logging in, verifying session, and logging out.
 */

const ts = Date.now();

test.describe('Parent signup and login', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await captureFailureArtifacts(page, testInfo.title);
    }
  });

  test('parent can register a new account and land on the dashboard', async ({ page }) => {
    const user = {
      username: `parent_signup_${ts}`,
      email: `parent_signup_${ts}@test.com`,
      password: 'TestPassword123!',
      name: 'Signup Test Parent',
    };

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Switch to Register tab
    const { locator: registerTab } = await selfHealingLocator(page, 'register tab', {
      role: 'tab', name: 'Register', text: 'Register',
    });
    await registerTab.click();

    // Fill registration form using semantic locators
    await page.getByLabel(/username/i).fill(user.username);
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByLabel(/full name/i).fill(user.name);

    // Password fields — there are two, use placeholder to disambiguate
    await page.getByPlaceholder(/create a password/i).fill(user.password);
    await page.getByPlaceholder(/confirm your password/i).fill(user.password);

    // Parent role should be selected by default (only option)
    await expect(page.getByRole('radio', { name: /parent/i })).toBeChecked();

    // Accept the disclaimer checkbox
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    await disclaimer.click();

    // Submit registration
    const { locator: registerButton } = await selfHealingLocator(page, 'register button', {
      role: 'button', name: 'Register', text: 'Register',
    });
    await registerButton.click();

    // Should redirect to the parent dashboard
    await page.waitForURL(/\/(dashboard)/, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // Verify we see the parent greeting
    await expect(async () => {
      await expect(page.getByText(/hello/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });
  });

  test('parent can log in with existing credentials', async ({ page }) => {
    const user = {
      username: `parent_login_${ts}`,
      email: `parent_login_${ts}@test.com`,
      password: 'TestPassword123!',
      name: 'Login Test Parent',
    };

    // Pre-register via API
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async (userData) => {
      await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, role: 'PARENT' }),
      });
    }, user);

    // Reload auth page for fresh login
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Ensure Login tab is active
    const { locator: loginTab } = await selfHealingLocator(page, 'login tab', {
      role: 'tab', name: 'Login', text: 'Login',
    });
    await loginTab.click();

    // Fill login credentials
    await page.getByPlaceholder(/enter your username/i).fill(user.username);
    await page.getByPlaceholder(/enter your password/i).fill(user.password);

    // Accept disclaimer if visible
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disclaimer.click();
    }

    // Click Login button
    const { locator: loginButton } = await selfHealingLocator(page, 'login button', {
      role: 'button', name: 'Login', text: 'Login',
    });
    await loginButton.click();

    // Should navigate to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    await expect(async () => {
      await expect(page.getByText(/hello/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });
  });

  test('parent sees error with invalid credentials', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Fill invalid credentials
    await page.getByPlaceholder(/enter your username/i).fill('nonexistent_user_xyz');
    await page.getByPlaceholder(/enter your password/i).fill('wrongpassword');

    // Accept disclaimer if visible
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disclaimer.click();
    }

    // Submit
    const { locator: loginButton } = await selfHealingLocator(page, 'login error button', {
      role: 'button', name: 'Login', text: 'Login',
    });
    await loginButton.click();

    // Should see error message
    await expect(async () => {
      await expect(page.getByText(/invalid/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Should remain on auth page
    expect(page.url()).toMatch(/\/auth/);
  });

  test('parent can log out and is redirected to auth', async ({ page }) => {
    const user = {
      username: `parent_logout_${ts}`,
      email: `parent_logout_${ts}@test.com`,
      password: 'TestPassword123!',
      name: 'Logout Test Parent',
    };

    // Register and login via API
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    const regResult = await page.evaluate(async (userData) => {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, role: 'PARENT' }),
      });
      return res.json();
    }, user);

    // Set token and navigate to dashboard
    await page.evaluate((t: string) => localStorage.setItem('AUTH_TOKEN', t), regResult.token);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome card if present
    const gotItDash = page.getByText('GOT IT!');
    if (await gotItDash.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotItDash.click();
    }

    // Verify we are on the dashboard
    await expect(async () => {
      await expect(page.getByText(/hello/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Click the logout button
    const { locator: logoutButton } = await selfHealingLocator(page, 'logout button', {
      role: 'button', name: 'Logout', text: 'Logout',
    });
    await logoutButton.click();

    // Should redirect to auth or welcome page
    await expect(async () => {
      expect(page.url()).toMatch(/\/(auth|welcome)/);
    }).toPass({ timeout: 15000 });
  });

  test('parent session persists across page reload', async ({ page }) => {
    const user = {
      username: `parent_session_${ts}`,
      email: `parent_session_${ts}@test.com`,
      password: 'TestPassword123!',
      name: 'Session Test Parent',
    };

    // Register via API
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    const regResult = await page.evaluate(async (userData) => {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, role: 'PARENT' }),
      });
      return res.json();
    }, user);

    // Set auth token and navigate to dashboard
    await page.evaluate((t: string) => localStorage.setItem('AUTH_TOKEN', t), regResult.token);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome card if present
    const gotItDash = page.getByText('GOT IT!');
    if (await gotItDash.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotItDash.click();
    }

    // Verify dashboard loaded
    await expect(async () => {
      await expect(page.getByText(/hello/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Dismiss welcome card again if present
    const gotItDash2 = page.getByText('GOT IT!');
    if (await gotItDash2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotItDash2.click();
    }

    // Should still be on dashboard with greeting visible (session persisted)
    await expect(async () => {
      await expect(page.getByText(/hello/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });

    expect(page.url()).toMatch(/\/dashboard/);
  });
});
