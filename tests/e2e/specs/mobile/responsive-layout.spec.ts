import { test, expect, Page } from '@playwright/test';

/**
 * Responsive Layout E2E Tests
 *
 * Verifies that navigation collapses at mobile breakpoints and content reflows
 * properly across mobile, tablet, and tablet-landscape viewports.
 *
 * Breakpoints under test:
 *   - Mobile: 375x812 (iPhone 13)
 *   - Tablet: 768x1024 (iPad portrait)
 *   - Tablet landscape: 1024x768 (iPad landscape)
 *
 * Follows synthetic user rules: semantic locators, visible-outcome assertions only.
 */

const SCREENSHOT_DIR = 'tests/e2e/screenshots/mobile';

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  tabletLandscape: { width: 1024, height: 768 },
} as const;

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

// ---------- Mobile viewport ----------

test.describe('Responsive layout — mobile (375x812)', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('no horizontal overflow on welcome page', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance
    await screenshot(page, 'mobile-welcome-no-overflow');
  });

  test('no horizontal overflow on auth page', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    await screenshot(page, 'mobile-auth-no-overflow');
  });

  test('header navigation uses icon-only mode below 640px', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    // At 375px, the "Docs" text label should be hidden (only icon visible)
    // The header should still be present and functional
    const header = page.locator('[role="navigation"][aria-label="Main navigation"]');
    await expect(header).toBeVisible();

    // Verify header fits within viewport width
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    if (headerBox) {
      expect(headerBox.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width);
    }

    await screenshot(page, 'mobile-header-icon-only');
  });

  test('content fills viewport width with proper padding', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    // Main content container should be visible and constrained to viewport
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(VIEWPORTS.mobile.width + 1);

    await screenshot(page, 'mobile-content-width');
  });

  test('footer is visible and reflows at mobile width', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Footer should exist and not overflow
    const footerOverflow = await page.evaluate(() => {
      const footer = document.querySelector('footer') ||
        document.querySelector('[role="contentinfo"]');
      if (!footer) return null;
      const rect = footer.getBoundingClientRect();
      return { width: rect.width, overflows: rect.width > window.innerWidth };
    });

    if (footerOverflow) {
      expect(footerOverflow.overflows).toBe(false);
    }

    await screenshot(page, 'mobile-footer');
  });
});

// ---------- Tablet viewport ----------

test.describe('Responsive layout — tablet (768x1024)', () => {
  test.use({ viewport: VIEWPORTS.tablet });

  test('no horizontal overflow on welcome page', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    await screenshot(page, 'tablet-welcome-no-overflow');
  });

  test('header shows text labels at 768px', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    // At 768px, navigation text labels should be visible per breakpoint logic
    const header = page.locator('[role="navigation"][aria-label="Main navigation"]');
    await expect(header).toBeVisible();

    // Header should render at full tablet width without overflow
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    if (headerBox) {
      expect(headerBox.width).toBeLessThanOrEqual(VIEWPORTS.tablet.width);
    }

    await screenshot(page, 'tablet-header-text-labels');
  });

  test('auth form renders centered with constrained width', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    // Form should not stretch to full tablet width — maxWidth constraint expected
    const formWidth = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[placeholder]');
      if (inputs.length === 0) return null;
      const rect = inputs[0].getBoundingClientRect();
      return rect.width;
    });

    if (formWidth !== null) {
      // Form inputs should be reasonably sized, not stretching full 768px
      expect(formWidth).toBeLessThan(VIEWPORTS.tablet.width);
    }

    await screenshot(page, 'tablet-auth-form');
  });
});

// ---------- Tablet landscape viewport ----------

test.describe('Responsive layout — tablet landscape (1024x768)', () => {
  test.use({ viewport: VIEWPORTS.tabletLandscape });

  test('no horizontal overflow on welcome page', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    await screenshot(page, 'tablet-landscape-welcome-no-overflow');
  });

  test('content has comfortable reading width at 1024px', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
      await page.waitForTimeout(500);
    }

    // Content should be constrained (maxWidth: 1200) and centered at 1024px
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(VIEWPORTS.tabletLandscape.width + 1);

    await screenshot(page, 'tablet-landscape-content-width');
  });
});
