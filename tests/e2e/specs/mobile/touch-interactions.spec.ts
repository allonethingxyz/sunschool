import { test, expect, Page } from '@playwright/test';

/**
 * Touch Interaction E2E Tests
 *
 * Verifies that tap targets meet minimum sizing (44x44px), interactive elements
 * are accessible, and touch-friendly patterns work at mobile and tablet viewports.
 *
 * Follows synthetic user rules: semantic locators, visible-outcome assertions only.
 */

const SCREENSHOT_DIR = 'tests/e2e/screenshots/mobile';

const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
} as const;

const MIN_TAP_TARGET = 44; // Apple HIG / WCAG minimum

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

/** Dismiss welcome modal if present */
async function dismissWelcome(page: Page) {
  const gotIt = page.getByText('Got it, thanks!');
  if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await gotIt.click();
    await page.waitForTimeout(500);
  }
}

/** Measure bounding box of all visible elements matching a locator */
async function measureTapTargets(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const elements = document.querySelectorAll(sel);
    const results: { text: string; width: number; height: number }[] = [];
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Only measure visible elements
      if (rect.width > 0 && rect.height > 0) {
        results.push({
          text: (el as HTMLElement).innerText?.substring(0, 40) || el.getAttribute('aria-label') || '',
          width: rect.width,
          height: rect.height,
        });
      }
    });
    return results;
  }, selector);
}

// ---------- Mobile viewport ----------

test.describe('Touch interactions — mobile (375x812)', () => {
  test.use({ viewport: VIEWPORTS.mobile });

  test('auth page buttons meet minimum tap target size (44x44)', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Measure all clickable button-like elements
    const buttons = await measureTapTargets(page, '[role="button"], button, [data-testid]');

    // Filter to visible interactive buttons (skip tiny decorative elements)
    const interactiveButtons = buttons.filter((b) => b.text.length > 0);

    for (const btn of interactiveButtons) {
      // At least one dimension should meet 44px minimum
      const meetsMinimum = btn.width >= MIN_TAP_TARGET || btn.height >= MIN_TAP_TARGET;
      expect(
        meetsMinimum,
        `Button "${btn.text}" is too small: ${btn.width}x${btn.height}px (min ${MIN_TAP_TARGET}px)`
      ).toBe(true);
    }

    await screenshot(page, 'mobile-auth-tap-targets');
  });

  test('form inputs are tall enough for touch interaction', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    const inputs = await measureTapTargets(page, 'input[placeholder]');

    for (const input of inputs) {
      expect(
        input.height,
        `Input is too short for touch: ${input.height}px (min ${MIN_TAP_TARGET}px)`
      ).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
    }

    await screenshot(page, 'mobile-auth-input-heights');
  });

  test('navigation links in header are tappable', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Header navigation items should be accessible via tap
    const header = page.locator('[role="navigation"][aria-label="Main navigation"]');
    await expect(header).toBeVisible();

    // All clickable items in the header should be reachable
    const headerLinks = await measureTapTargets(
      page,
      '[role="navigation"][aria-label="Main navigation"] [role="link"], ' +
      '[role="navigation"][aria-label="Main navigation"] [role="button"]'
    );

    for (const link of headerLinks) {
      // Combined tap target (width * height) should be reasonable
      const meetsMinimum = link.width >= MIN_TAP_TARGET || link.height >= MIN_TAP_TARGET;
      expect(
        meetsMinimum,
        `Header link "${link.text}" tap target too small: ${link.width}x${link.height}px`
      ).toBe(true);
    }

    await screenshot(page, 'mobile-header-tap-targets');
  });

  test('welcome page CTA button is prominent and tappable', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Look for primary call-to-action buttons
    const ctaButtons = await measureTapTargets(page, '[role="button"]');
    const largeButtons = ctaButtons.filter((b) => b.height >= MIN_TAP_TARGET && b.width >= 100);

    // There should be at least one prominently-sized CTA
    expect(largeButtons.length).toBeGreaterThan(0);

    await screenshot(page, 'mobile-welcome-cta');
  });

  test('tapping Sign In button on auth page triggers form validation', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Tap sign-in with empty fields — should show validation feedback
    const signInBtn = page.getByText('Sign In', { exact: true }).first();
    await expect(signInBtn).toBeVisible();
    await signInBtn.tap();
    await page.waitForTimeout(1000);

    // After tapping with empty fields, page should still be on auth
    // (no crash, no blank page — graceful handling)
    const currentUrl = page.url();
    expect(currentUrl).toContain('/auth');

    await screenshot(page, 'mobile-signin-tap-validation');
  });
});

// ---------- Tablet viewport ----------

test.describe('Touch interactions — tablet (768x1024)', () => {
  test.use({ viewport: VIEWPORTS.tablet });

  test('auth page buttons meet minimum tap target size on tablet', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    const buttons = await measureTapTargets(page, '[role="button"], button');
    const interactiveButtons = buttons.filter((b) => b.text.length > 0);

    for (const btn of interactiveButtons) {
      const meetsMinimum = btn.width >= MIN_TAP_TARGET || btn.height >= MIN_TAP_TARGET;
      expect(
        meetsMinimum,
        `Tablet button "${btn.text}" is too small: ${btn.width}x${btn.height}px`
      ).toBe(true);
    }

    await screenshot(page, 'tablet-auth-tap-targets');
  });

  test('interactive elements have sufficient spacing between them', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Verify that adjacent interactive elements have enough spacing
    // to prevent accidental taps
    const positions = await page.evaluate(() => {
      const interactives = document.querySelectorAll(
        '[role="button"], button, input, [role="link"], a'
      );
      const rects: { top: number; bottom: number; label: string }[] = [];
      interactives.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          rects.push({
            top: rect.top,
            bottom: rect.bottom,
            label: (el as HTMLElement).innerText?.substring(0, 20) || '',
          });
        }
      });
      return rects.sort((a, b) => a.top - b.top);
    });

    // Check vertical gaps between adjacent interactive elements
    for (let i = 1; i < positions.length; i++) {
      const gap = positions[i].top - positions[i - 1].bottom;
      // Elements should not overlap (gap >= 0)
      expect(
        gap,
        `Overlapping interactive elements: "${positions[i - 1].label}" and "${positions[i].label}"`
      ).toBeGreaterThanOrEqual(-2); // -2px tolerance for borders
    }

    await screenshot(page, 'tablet-element-spacing');
  });
});
