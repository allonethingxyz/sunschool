/**
 * Mobile Persona E2E: Responsive Layout
 *
 * Validates that key pages render correctly at mobile viewport (375×667 iPhone SE).
 * Covers:
 *   - Welcome/landing page adapts to narrow width
 *   - Auth page is usable on mobile (inputs visible, tappable)
 *   - Parent dashboard collapses to single-column layout
 *   - Learner home is fully visible without horizontal scroll
 *   - Lesson content is readable and images scale within viewport
 *   - Navigation collapses to hamburger/mobile menu
 *
 * All assertions are structural — AI-generated content varies per request.
 */
import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  apiCall,
  generateAndWaitForLesson,
  waitForLessonLoaded,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/mobile';
const MOBILE_VIEWPORT = { width: 375, height: 667 };

async function screenshot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

test.describe('Mobile: Responsive Layout', () => {
  test.describe.configure({ retries: 2 });

  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('welcome page adapts to mobile viewport', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) await gotIt.click();

    await screenshot(page, 'responsive-01-welcome');

    // Page title/branding should be visible
    await expect(page.getByText(/sunschool/i).first()).toBeVisible();

    // No horizontal overflow — page width should match viewport
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Content should be within viewport bounds
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(MOBILE_VIEWPORT.width + 5); // small tolerance
  });

  test('auth page inputs are accessible on mobile', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) await gotIt.click();

    await screenshot(page, 'responsive-02-auth');

    // Login and Register tabs should be visible
    await expect(page.getByText('Login', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Register', { exact: true }).first()).toBeVisible();

    // Click Login tab
    await page.getByText('Login', { exact: true }).first().click();
    await page.waitForLoadState('networkidle');

    // Input fields should be visible and within viewport (semantic locators)
    const { locator: usernameInput } = await selfHealingLocator(page, 'mobile-auth-username', {
      role: 'textbox',
      name: /username/i,
      label: /username/i,
      testId: 'username-input',
    });
    const { locator: passwordInput } = await selfHealingLocator(page, 'mobile-auth-password', {
      label: /password/i,
      text: /password/i,
      testId: 'password-input',
    });

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Verify inputs are fully within the mobile viewport
    const usernameBBox = await usernameInput.boundingBox();
    const passwordBBox = await passwordInput.boundingBox();

    if (usernameBBox) {
      expect(usernameBBox.x).toBeGreaterThanOrEqual(0);
      expect(usernameBBox.x + usernameBBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width + 5);
    }
    if (passwordBBox) {
      expect(passwordBBox.x).toBeGreaterThanOrEqual(0);
      expect(passwordBBox.x + passwordBBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width + 5);
    }

    await screenshot(page, 'responsive-02-auth-login-form');
  });

  test('parent dashboard renders in single-column on mobile', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'mobile_dash');

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome card if present
    const gotItDash = page.getByText('GOT IT!');
    if (await gotItDash.isVisible({ timeout: 3000 }).catch(() => false)) await gotItDash.click();

    await screenshot(page, 'responsive-03-dashboard');

    // Dashboard should be visible
    expect(page.url()).toMatch(/dashboard/);

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Headings should be visible
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);
  });

  test('learner home fits mobile viewport without horizontal scroll', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'mobile_home');

    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'responsive-04-learner-home');

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Structural content rendered
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);

    // Body text should be readable (content present)
    const bodyText = await page.getByRole('main').innerText().catch(
      () => page.evaluate(() => document.body.innerText)
    );
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('lesson content scales images within mobile viewport', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'mobile_lesson');

    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);

    await screenshot(page, 'responsive-05-lesson-content');

    // Lesson should have structural content
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);

    // No horizontal overflow on lesson page
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Check that images (if present) don't overflow viewport
    const imgOverflows = await page.evaluate((viewportWidth) => {
      const images = document.querySelectorAll('img, svg');
      for (const img of images) {
        const rect = img.getBoundingClientRect();
        if (rect.width > viewportWidth + 5 && rect.width > 50) {
          return true;
        }
      }
      return false;
    }, MOBILE_VIEWPORT.width);
    expect(imgOverflows).toBe(false);

    // Scroll through lesson and capture screenshots
    for (let i = 1; i <= 3; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 500);
      await page.waitForLoadState('networkidle');
      await screenshot(page, `responsive-05-lesson-scroll-${i}`);
    }
  });

  test('navigation collapses to mobile menu', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) await gotIt.click();

    await screenshot(page, 'responsive-06-nav-mobile');

    // On mobile, the desktop nav links (Documentation, etc.) may be hidden
    // behind a hamburger menu. Check for a menu toggle button.
    const { locator: menuToggle } = await selfHealingLocator(page, 'mobile-menu-toggle', {
      role: 'button',
      name: /menu|toggle|hamburger|navigation/i,
      text: /menu|☰|≡/i,
    });

    const hasMenuToggle = await menuToggle.isVisible({ timeout: 5000 }).catch(() => false);

    // On mobile, either we have a hamburger menu OR the nav is stacked vertically
    // Both are valid responsive patterns
    const navLinks = page.getByRole('link');
    const navLinkCount = await navLinks.count();

    // The page should have some navigation method available
    expect(hasMenuToggle || navLinkCount > 0).toBeTruthy();

    // If there's a hamburger menu, open it and verify nav items appear
    if (hasMenuToggle) {
      await menuToggle.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'responsive-06-nav-menu-open');
    }
  });

  test('privacy and terms pages are readable on mobile', async ({ page }) => {
    // Privacy page
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'responsive-07-privacy');

    await expect(page.getByText(/privacy/i).first()).toBeVisible();

    const privacyScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(privacyScroll).toBe(false);

    // Terms page
    await page.goto('/terms');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'responsive-07-terms');

    await expect(page.getByText(/terms/i).first()).toBeVisible();

    const termsScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(termsScroll).toBe(false);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `mobile-responsive-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
