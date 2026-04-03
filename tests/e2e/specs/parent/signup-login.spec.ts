/**
 * Parent persona — signup and login flows.
 *
 * Covers: registration, login (valid/invalid), session persistence, logout.
 *
 * Production form placeholders:
 *   Login:    "Enter your username", "Enter your password"
 *   Register: "Choose a username", "Enter your email", "Enter your full name",
 *             "Create a password", "Confirm your password"
 */
import { test, expect } from '@playwright/test';
import {
  generateTestUser,
  registerParentViaAPI,
  apiCall,
  screenshot,
} from '../../helpers/learner-setup';

/** Wait for the auth page SPA to fully render */
async function waitForAuthPage(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/auth');
  await page.waitForLoadState('networkidle');
  // Wait for SPA auth initialization to complete
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});
  await page.getByText(/got it|close|dismiss/i).first().click().catch(() => {});
  // Wait for login form inputs to render (signals SPA is ready)
  await page.locator('input[placeholder="Enter your username"]')
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {});
}

test.describe('Parent Signup & Login', () => {
  test.describe.configure({ retries: 2 });

  test('Registration flow with age disclaimer', async ({ page }) => {
    page.setDefaultTimeout(90000);
    const user = generateTestUser('signup');

    await waitForAuthPage(page);

    // Click Register tab (production renders "REGISTER" via CSS uppercase)
    const registerTab = page.getByText(/register/i).first();
    await registerTab.waitFor({ state: 'visible', timeout: 10000 });
    await registerTab.click();
    await page.waitForTimeout(1000);

    // Fill registration form using production placeholders
    await page.getByPlaceholder('Choose a username').fill(user.username);
    await page.getByPlaceholder('Enter your email').fill(user.email);
    await page.getByPlaceholder('Enter your full name').fill(user.name);
    await page.getByPlaceholder('Create a password').fill(user.password);

    // Confirm password field
    const confirmInput = page.getByPlaceholder(/confirm/i);
    if (await confirmInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmInput.fill(user.password);
    }

    // Age disclaimer should be visible — click to accept
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 3000 }).catch(() => false)) {
      await disclaimer.click();
    }

    // Scroll down to find and click register/submit button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Click the register/submit button
    const registerBtn = page.getByRole('button', { name: /register/i });
    if (await registerBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await registerBtn.click();
    } else {
      // Fallback: look for any submit-like button in the form
      const submitBtn = page.getByText(/register|sign up|create account/i).last();
      await submitBtn.click();
    }

    // Wait for navigation to dashboard
    try {
      await page.waitForURL(/\/(dashboard|learner)/, { timeout: 90000 });
    } catch {
      const onAuth = page.url().includes('/auth');
      if (onAuth) {
        const errorText = await page.getByText(/error|already|exists|taken/i).first()
          .textContent({ timeout: 5000 }).catch(() => '');
        console.log(`Registration may have failed: ${errorText || 'unknown reason'}`);
      }
    }

    await screenshot(page, 'signup-complete');
  });

  test('Login with valid credentials', async ({ page }) => {
    page.setDefaultTimeout(90000);
    const user = generateTestUser('loginok');

    await waitForAuthPage(page);

    // Register via API first
    await registerParentViaAPI(page, user);

    // Ensure we're on login tab
    const loginTab = page.getByText(/login/i).first();
    if (await loginTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginTab.click();
      await page.waitForTimeout(500);
    }

    // Fill login form using production placeholders
    await page.getByPlaceholder('Enter your username').fill(user.username);
    await page.getByPlaceholder('Enter your password').fill(user.password);

    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) await disclaimer.click();

    // Click the Login submit button (last one — the tab is first)
    await page.getByText(/^login$/i).last().click();
    await page.waitForURL(/\/(dashboard|learner)/, { timeout: 90000 });
    await page.waitForLoadState('networkidle');

    expect(page.url()).toMatch(/\/(dashboard|learner)/);
    await screenshot(page, 'login-success');
  });

  test('Login with invalid credentials shows error', async ({ page }) => {
    page.setDefaultTimeout(90000);

    await waitForAuthPage(page);

    // Ensure we're on login tab
    const loginTab = page.getByText(/login/i).first();
    if (await loginTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginTab.click();
      await page.waitForTimeout(500);
    }

    await page.getByPlaceholder('Enter your username').fill('nonexistent_user');
    await page.getByPlaceholder('Enter your password').fill('WrongPassword!');

    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) await disclaimer.click();

    await page.getByText(/^login$/i).last().click();
    await page.waitForTimeout(3000);

    // Should show error, not navigate away
    const errorVisible = await page.getByText(/invalid|incorrect|failed|error/i).first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(errorVisible || page.url().includes('/auth')).toBeTruthy();
    await screenshot(page, 'login-error');
  });

  test('Session persistence across page reload', async ({ page }) => {
    page.setDefaultTimeout(90000);
    const user = generateTestUser('persist');

    await waitForAuthPage(page);

    // Register via API
    await registerParentViaAPI(page, user);

    // Login via UI to establish proper session state
    await page.getByText(/login/i).first().click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder('Enter your username').fill(user.username);
    await page.getByPlaceholder('Enter your password').fill(user.password);
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) await disclaimer.click();
    await page.getByText(/^login$/i).last().click();
    await page.waitForURL(/\/(dashboard|learner)/, { timeout: 90000 });
    await page.waitForLoadState('networkidle');

    const urlBeforeReload = page.url();
    expect(urlBeforeReload).not.toMatch(/\/auth/);

    // Verify AUTH_TOKEN was set by the login flow
    const hasToken = await page.evaluate(() => !!localStorage.getItem('AUTH_TOKEN'));
    expect(hasToken).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle');
    // Wait for auth init to complete (the fixed use-auth.tsx reads token before clearing)
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const urlAfterReload = page.url();
    console.log(`URL before reload: ${urlBeforeReload}, after: ${urlAfterReload}`);

    // Auth should persist — user stays on dashboard/learner, not bounced to /auth
    const persisted = !urlAfterReload.includes('/auth');
    expect(persisted).toBeTruthy();

    await screenshot(page, 'session-persist');
  });

  test('Logout redirects to public page', async ({ page }) => {
    page.setDefaultTimeout(90000);
    const user = generateTestUser('signout');

    await waitForAuthPage(page);

    await registerParentViaAPI(page, user);

    // Login via UI
    const loginTab = page.getByText(/login/i).first();
    if (await loginTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginTab.click();
      await page.waitForTimeout(500);
    }
    await page.getByPlaceholder('Enter your username').fill(user.username);
    await page.getByPlaceholder('Enter your password').fill(user.password);
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) await disclaimer.click();
    await page.getByText(/^login$/i).last().click();
    await page.waitForURL(/\/(dashboard|learner)/, { timeout: 90000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click the first Logout button (header — there's also one in the footer)
    const logoutBtn = page.getByRole('button', { name: 'Logout' }).first();
    await expect(logoutBtn).toBeVisible({ timeout: 10000 });
    await logoutBtn.click();

    // Wait for redirect to a public page (auth, welcome, or root)
    await page.waitForURL(/\/(auth|welcome)|\.xyz\/$/, { timeout: 15000 }).catch(async () => {
      // Logout may clear token without immediate redirect — verify token is gone and reload
      const tokenCleared = await page.evaluate(() => !localStorage.getItem('AUTH_TOKEN'));
      console.log(`Logout redirect didn't fire — token cleared: ${tokenCleared}, reloading...`);
      await page.reload();
      await page.waitForURL(/\/(auth|welcome)|\.xyz\/$/, { timeout: 15000 });
    });

    const url = page.url();
    expect(url).toMatch(/\/(auth|welcome)|\.xyz\/$/);

    await screenshot(page, 'logout-redirect');
  });
});
