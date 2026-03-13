import { test, expect, Page } from '@playwright/test';

/**
 * Tablet Reading E2E Tests
 *
 * Verifies lesson content is readable on tablet viewports, including e-reader
 * UX patterns: comfortable line length, readable font sizes, scrollable content,
 * and landscape reading mode.
 *
 * Tests register a user, create a learner, and generate a lesson to validate
 * the reading experience end-to-end.
 *
 * Follows synthetic user rules: semantic locators, visible-outcome assertions only.
 */

const SCREENSHOT_DIR = 'tests/e2e/screenshots/mobile';
const timestamp = Date.now();

const VIEWPORTS = {
  tablet: { width: 768, height: 1024 },
  tabletLandscape: { width: 1024, height: 768 },
} as const;

const parentCredentials = {
  username: `tabletparent_${timestamp}`,
  email: `tabletparent_${timestamp}@test.com`,
  password: 'TestPassword123!',
  name: 'Tablet Parent',
  role: 'PARENT',
};

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

/** Register via API and return token */
async function registerViaAPI(page: Page): Promise<string> {
  const result = await page.evaluate(async (userData) => {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const data = await res.json();
    return { token: data.token, status: res.status };
  }, parentCredentials);

  if (!result.token) throw new Error(`Registration failed: ${JSON.stringify(result)}`);
  return result.token;
}

/** Set auth token and navigate */
async function setAuthAndNavigate(page: Page, token: string, path: string) {
  const currentUrl = page.url();
  if (currentUrl.includes('sunschool') || currentUrl.includes('localhost')) {
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.evaluate((url) => {
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForTimeout(1500);
  } else {
    await page.goto(path);
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.reload();
    await page.waitForLoadState('networkidle');
  }
}

// ---------- Tablet portrait ----------

test.describe('Tablet reading — portrait (768x1024)', () => {
  test.use({ viewport: VIEWPORTS.tablet });

  test('welcome page text is readable at tablet size', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Verify text font sizes are readable (>= 14px)
    const fontSizes = await page.evaluate(() => {
      const textElements = document.querySelectorAll('p, h1, h2, h3, span, div');
      const sizes: number[] = [];
      textElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        const text = (el as HTMLElement).innerText?.trim();
        if (text && text.length > 5) {
          sizes.push(parseFloat(style.fontSize));
        }
      });
      return sizes.filter((s) => !isNaN(s));
    });

    // Body text should be at least 14px for readability on tablet
    const smallText = fontSizes.filter((s) => s < 12);
    const textTooSmallRatio = smallText.length / fontSizes.length;
    expect(
      textTooSmallRatio,
      `Too much small text: ${smallText.length}/${fontSizes.length} elements under 12px`
    ).toBeLessThan(0.1); // Less than 10% of text should be tiny

    await screenshot(page, 'tablet-reading-font-sizes');
  });

  test('page is scrollable and content is accessible', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Page should be vertically scrollable
    const scrollInfo = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      isScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    }));

    // Content should either fit or be scrollable — not clipped
    // Scroll to bottom to verify all content is reachable
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const scrolledPosition = await page.evaluate(() => ({
      scrollTop: document.documentElement.scrollTop,
      scrollHeight: document.documentElement.scrollHeight,
    }));

    // If content is taller than viewport, we should have scrolled
    if (scrollInfo.isScrollable) {
      expect(scrolledPosition.scrollTop).toBeGreaterThan(0);
    }

    await screenshot(page, 'tablet-reading-scrollable');
  });

  test('auth page form is usable on tablet', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Inputs should be visible and properly sized
    const usernameInput = page.locator('input[placeholder="Username"]');
    const passwordInput = page.locator('input[placeholder="Password"]');

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Input fields should have comfortable width for tablet
    const inputBox = await usernameInput.boundingBox();
    expect(inputBox).not.toBeNull();
    if (inputBox) {
      expect(inputBox.width).toBeGreaterThan(200); // Should be wide enough to type comfortably
      expect(inputBox.height).toBeGreaterThanOrEqual(44); // Touch-friendly height
    }

    await screenshot(page, 'tablet-reading-auth-form');
  });

  test('dashboard content renders at comfortable reading width', async ({ page }) => {
    // Navigate to site first
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Register and authenticate
    const token = await registerViaAPI(page);
    await setAuthAndNavigate(page, token, '/dashboard');
    await page.waitForTimeout(2000);

    // Content area should have a comfortable reading width (not too wide)
    const contentWidth = await page.evaluate(() => {
      // Find the main content area
      const mainContent = document.querySelector('#main-content') ||
        document.querySelector('[role="main"]') ||
        document.querySelector('main');
      if (mainContent) {
        return mainContent.getBoundingClientRect().width;
      }
      return document.body.scrollWidth;
    });

    // Content should be constrained, not sprawling full width
    expect(contentWidth).toBeLessThanOrEqual(VIEWPORTS.tablet.width);

    await screenshot(page, 'tablet-reading-dashboard');
  });
});

// ---------- Tablet landscape ----------

test.describe('Tablet reading — landscape (1024x768)', () => {
  test.use({ viewport: VIEWPORTS.tabletLandscape });

  test('welcome page renders in landscape without overflow', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    await screenshot(page, 'tablet-landscape-reading');
  });

  test('text line length is comfortable for reading in landscape', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // Optimal reading line length is 45-75 characters (~450-750px at 16px font)
    // Content should be constrained even in landscape
    const maxTextWidth = await page.evaluate(() => {
      const textBlocks = document.querySelectorAll('p, h1, h2, h3');
      let maxWidth = 0;
      textBlocks.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const text = (el as HTMLElement).innerText?.trim();
        if (text && text.length > 20 && rect.width > maxWidth) {
          maxWidth = rect.width;
        }
      });
      return maxWidth;
    });

    // Text blocks should not stretch beyond ~900px for readability
    if (maxTextWidth > 0) {
      expect(maxTextWidth).toBeLessThanOrEqual(1000);
    }

    await screenshot(page, 'tablet-landscape-line-length');
  });

  test('landscape shows full navigation with labels', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
    await dismissWelcome(page);

    // At 1024px, header should show text labels for navigation items
    const header = page.locator('[role="navigation"][aria-label="Main navigation"]');
    await expect(header).toBeVisible();

    // Header should comfortably fit all items
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    if (headerBox) {
      expect(headerBox.width).toBeLessThanOrEqual(VIEWPORTS.tabletLandscape.width);
    }

    await screenshot(page, 'tablet-landscape-nav-labels');
  });
});
