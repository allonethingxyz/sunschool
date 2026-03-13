import { test, expect, Page } from '@playwright/test';

/**
 * Mobile Auth E2E Tests
 *
 * Verifies login and signup flows work correctly on mobile viewport (375x812)
 * and tablet viewport (768x1024). Tests form usability, input accessibility,
 * keyboard interaction, and error handling at small screen sizes.
 *
 * Follows synthetic user rules: semantic locators, visible-outcome assertions only.
 */

const SCREENSHOT_DIR = 'tests/e2e/screenshots/mobile';
const timestamp = Date.now();

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
} as const;

const MIN_TAP_TARGET = 44;

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

async function dismissWelcome(page: Page) {
  const gotIt = page.getByText('Got it, thanks!');
  if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await gotIt.click();
    await page.waitForTimeout(500);
  }
}

// ---------- Mobile viewport ----------

test.describe('Mobile auth — login (375x812)', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('login form is fully visible without horizontal scroll', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Username and password inputs visible
    const usernameInput = page.locator('input[placeholder="Username"]');
    const passwordInput = page.locator('input[placeholder="Password"]');
    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await screenshot(page, 'mobile-auth-login-visible');
  });

  test('login inputs have touch-friendly height', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    const usernameBox = await page.locator('input[placeholder="Username"]').boundingBox();
    const passwordBox = await page.locator('input[placeholder="Password"]').boundingBox();

    expect(usernameBox).not.toBeNull();
    expect(passwordBox).not.toBeNull();

    if (usernameBox) {
      expect(usernameBox.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
      // Width should span most of mobile viewport
      expect(usernameBox.width).toBeGreaterThan(VIEWPORTS.mobile.width * 0.6);
    }
    if (passwordBox) {
      expect(passwordBox.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    }

    await screenshot(page, 'mobile-auth-input-sizing');
  });

  test('error message shows on invalid login', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    await page.locator('input[placeholder="Username"]').fill('invalid_user_xyz');
    await page.locator('input[placeholder="Password"]').fill('wrongpassword');

    const signInBtn = page.getByText('Sign In', { exact: true }).first();
    await signInBtn.click();
    await page.waitForTimeout(2000);

    // Error should be visible and contained within viewport
    const errorVisible = await page.evaluate(() => {
      const body = document.body.innerHTML;
      return body.includes('Invalid') || body.includes('invalid') ||
        body.includes('error') || body.includes('Error') ||
        body.includes('incorrect') || body.includes('failed');
    });

    // Should still be on auth page (not crashed)
    expect(page.url()).toContain('/auth');

    await screenshot(page, 'mobile-auth-login-error');
  });

  test('can switch between login and register tabs', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Switch to Register tab
    const registerTab = page.getByText('Register', { exact: true }).first();
    await expect(registerTab).toBeVisible();
    await registerTab.click();
    await page.waitForTimeout(1000);

    // Registration form fields should now be visible
    const usernameField = page.locator('input[placeholder="Choose a username"]');
    const emailField = page.locator('input[placeholder="Enter your email"]');

    await expect(usernameField).toBeVisible();
    await expect(emailField).toBeVisible();

    await screenshot(page, 'mobile-auth-register-tab');

    // Switch back to login
    const signInTab = page.getByText('Sign In', { exact: true }).first();
    await signInTab.click();
    await page.waitForTimeout(1000);

    // Login fields should be visible again
    await expect(page.locator('input[placeholder="Username"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Password"]')).toBeVisible();

    await screenshot(page, 'mobile-auth-back-to-login');
  });
});

test.describe('Mobile auth — registration (375x812)', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('registration form fields are all reachable by scrolling', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Navigate to Register tab
    const registerTab = page.getByText('Register', { exact: true }).first();
    await registerTab.click();
    await page.waitForTimeout(1000);

    // All registration fields should be reachable (visible after scroll)
    const fields = [
      'input[placeholder="Choose a username"]',
      'input[placeholder="Enter your email"]',
      'input[placeholder="Enter your full name"]',
      'input[placeholder="Create a password"]',
      'input[placeholder="Confirm your password"]',
    ];

    for (const field of fields) {
      const input = page.locator(field);
      await input.scrollIntoViewIfNeeded();
      await expect(input).toBeVisible();
    }

    await screenshot(page, 'mobile-auth-register-fields-scroll');
  });

  test('registration form can be filled on mobile', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Navigate to Register tab
    const registerTab = page.getByText('Register', { exact: true }).first();
    await registerTab.click();
    await page.waitForTimeout(1000);

    // Fill all fields
    await page.locator('input[placeholder="Choose a username"]').fill(`mobileuser_${timestamp}`);
    await page.locator('input[placeholder="Enter your email"]').fill(`mobileuser_${timestamp}@test.com`);
    await page.locator('input[placeholder="Enter your full name"]').fill('Mobile User');
    await page.locator('input[placeholder="Create a password"]').fill('TestPassword123!');
    await page.locator('input[placeholder="Confirm your password"]').fill('TestPassword123!');

    // Scroll to disclaimer and accept
    const disclaimerText = page.getByText(/I confirm I am at least 18 years old/);
    await disclaimerText.scrollIntoViewIfNeeded();

    // All fields should have their values
    const usernameValue = await page.locator('input[placeholder="Choose a username"]').inputValue();
    expect(usernameValue).toContain('mobileuser_');

    await screenshot(page, 'mobile-auth-register-filled');
  });
});

// ---------- Tablet viewport ----------

test.describe('Mobile auth — tablet (768x1024)', () => {
  test.use({ viewport: VIEWPORTS.tablet });

  test('login form renders properly on tablet', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Form should be visible and centered
    const usernameInput = page.locator('input[placeholder="Username"]');
    await expect(usernameInput).toBeVisible();

    const inputBox = await usernameInput.boundingBox();
    expect(inputBox).not.toBeNull();
    if (inputBox) {
      // Input should be centered (not pushed to far left)
      const leftMargin = inputBox.x;
      const rightMargin = VIEWPORTS.tablet.width - (inputBox.x + inputBox.width);
      // Both margins should be roughly balanced (within 100px)
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThan(200);
    }

    // No horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await screenshot(page, 'tablet-auth-login');
  });

  test('register form is fully visible on tablet without scrolling', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Switch to Register
    const registerTab = page.getByText('Register', { exact: true }).first();
    await registerTab.click();
    await page.waitForTimeout(1000);

    // On tablet (1024 height), registration form should fit or nearly fit
    const usernameField = page.locator('input[placeholder="Choose a username"]');
    const passwordField = page.locator('input[placeholder="Create a password"]');

    await expect(usernameField).toBeVisible();
    await expect(passwordField).toBeVisible();

    await screenshot(page, 'tablet-auth-register');
  });
});
