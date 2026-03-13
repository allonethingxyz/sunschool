import { test, expect } from '@playwright/test';
import { selfHealingLocator } from '../../helpers/self-healing';

test.describe('Authentication flow', () => {
  test('should display login form', async ({ page }) => {
    await page.goto('/');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Check that the login form is displayed using semantic locators
    const { locator: signInHeading } = await selfHealingLocator(page, 'should display login form', {
      role: 'heading', name: 'Sign In', text: 'Sign In',
    });
    await expect(signInHeading).toBeVisible();

    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('should show error message with invalid credentials', async ({ page }) => {
    await page.goto('/');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Fill in invalid credentials using semantic locators
    await page.getByPlaceholder(/username/i).fill('invaliduser');
    await page.getByPlaceholder(/password/i).fill('invalidpassword');

    // Accept disclaimer if visible
    const disclaimer = page.getByText(/I confirm I am at least 18 years old/);
    if (await disclaimer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await disclaimer.click();
    }

    // Submit the form using self-healing locator
    const { locator: signInButton } = await selfHealingLocator(page, 'should show error message', {
      role: 'button', name: 'Sign In', text: 'Sign In',
    });
    await signInButton.click();

    // Check that error message is displayed
    await expect(page.getByText(/invalid username or password/i)).toBeVisible({ timeout: 10000 });
  });
});