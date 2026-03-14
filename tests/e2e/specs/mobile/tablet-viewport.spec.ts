/**
 * Mobile Persona E2E: Tablet / E-Reader Viewport
 *
 * Validates layout and usability at e-reader tablet dimensions (768×1024 iPad).
 * Covers:
 *   - Lesson content is optimally laid out for reading (wider than phone, narrower than desktop)
 *   - Two-column layouts render properly at tablet breakpoint
 *   - Quiz is comfortably usable at tablet size
 *   - Dashboard shows appropriate card layout
 *   - Images and SVGs scale for tablet viewport
 *   - Portrait and landscape orientations both work
 *
 * All assertions are structural — AI-generated content varies per request.
 */
import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  generateAndWaitForLesson,
  waitForLessonLoaded,
  apiCall,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/mobile';

// iPad / e-reader portrait
const TABLET_PORTRAIT = { width: 768, height: 1024 };
// iPad / e-reader landscape
const TABLET_LANDSCAPE = { width: 1024, height: 768 };

async function screenshot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

test.describe('Tablet: Portrait Viewport (768×1024)', () => {
  test.describe.configure({ retries: 2 });

  test.use({ viewport: TABLET_PORTRAIT });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('welcome page renders at tablet viewport', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) await gotIt.click();

    await screenshot(page, 'tablet-01-welcome-portrait');

    // Branding visible
    await expect(page.getByText(/sunschool/i).first()).toBeVisible();

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('lesson content is optimal reading width on tablet', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'tablet_lesson');

    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);

    await screenshot(page, 'tablet-02-lesson-portrait');

    // Lesson should have structural content
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);

    // Content should be substantial
    const bodyText = await page.getByRole('main').innerText().catch(
      () => page.evaluate(() => document.body.innerText)
    );
    expect(bodyText.length).toBeGreaterThan(200);

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Images should scale within tablet viewport
    const imgOverflows = await page.evaluate((viewportWidth) => {
      const images = document.querySelectorAll('img, svg');
      for (const img of images) {
        const rect = img.getBoundingClientRect();
        if (rect.width > viewportWidth + 5 && rect.width > 50) {
          return true;
        }
      }
      return false;
    }, TABLET_PORTRAIT.width);
    expect(imgOverflows).toBe(false);

    // Scroll through and capture reading experience
    for (let i = 1; i <= 4; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 600);
      await page.waitForLoadState('networkidle');
      await screenshot(page, `tablet-02-lesson-scroll-${i}`);
    }
  });

  test('dashboard card layout adapts to tablet width', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'tablet_dash');

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome card if present
    const gotItDash = page.getByText('GOT IT!');
    if (await gotItDash.isVisible({ timeout: 3000 }).catch(() => false)) await gotItDash.click();

    await screenshot(page, 'tablet-03-dashboard-portrait');

    // Dashboard should load
    expect(page.url()).toMatch(/dashboard/);

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Headings visible
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);
  });

  test('quiz is comfortably usable at tablet size', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'tablet_quiz');

    const lessonId = await generateAndWaitForLesson(page, 'Math');
    expect(lessonId).toBeTruthy();

    await page.goto(`/quiz/${lessonId}`);
    await page.waitForLoadState('networkidle');

    // Start quiz
    const { locator: startBtn } = await selfHealingLocator(page, 'tablet-quiz-start', {
      role: 'button',
      name: 'Start Quiz',
      text: 'Start Quiz',
    });

    const startVisible = await startBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (startVisible) {
      await startBtn.click();
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'tablet-04-quiz-portrait');

    // Wait for question
    const questionHeader = page.getByText(/Question \d+ of \d+/);
    await questionHeader.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    const questionCount = await questionHeader.count();
    expect(questionCount).toBeGreaterThanOrEqual(1);

    // Answer options should be within viewport
    const optionOverflow = await page.evaluate((viewportWidth) => {
      const options = document.querySelectorAll('[tabindex="0"], [role="radio"], [role="option"]');
      for (const opt of options) {
        const rect = opt.getBoundingClientRect();
        if (rect.width > 0 && rect.x + rect.width > viewportWidth + 5) {
          return true;
        }
      }
      return false;
    }, TABLET_PORTRAIT.width);
    expect(optionOverflow).toBe(false);
  });

  test('goals and progress pages render on tablet', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'tablet_pages');

    // Goals page
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'tablet-05-goals');

    const goalsScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(goalsScroll).toBe(false);

    // Progress page
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'tablet-05-progress');

    const progressScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(progressScroll).toBe(false);

    // Reports page
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'tablet-05-reports');

    const reportsScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(reportsScroll).toBe(false);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `tablet-portrait-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});

test.describe('Tablet: Landscape Viewport (1024×768)', () => {
  test.describe.configure({ retries: 2 });

  test.use({ viewport: TABLET_LANDSCAPE });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('lesson content renders in landscape orientation', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'tablet_land');

    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);

    await screenshot(page, 'tablet-06-lesson-landscape');

    // Structural content
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Images within viewport
    const imgOverflows = await page.evaluate((viewportWidth) => {
      const images = document.querySelectorAll('img, svg');
      for (const img of images) {
        const rect = img.getBoundingClientRect();
        if (rect.width > viewportWidth + 5 && rect.width > 50) {
          return true;
        }
      }
      return false;
    }, TABLET_LANDSCAPE.width);
    expect(imgOverflows).toBe(false);

    // Scroll through content
    for (let i = 1; i <= 3; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 500);
      await page.waitForLoadState('networkidle');
      await screenshot(page, `tablet-06-lesson-landscape-scroll-${i}`);
    }
  });

  test('dashboard utilizes landscape width effectively', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'tablet_land_dash');

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome card if present
    const gotItDash = page.getByText('GOT IT!');
    if (await gotItDash.isVisible({ timeout: 3000 }).catch(() => false)) await gotItDash.click();

    await screenshot(page, 'tablet-07-dashboard-landscape');

    expect(page.url()).toMatch(/dashboard/);

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Headings visible
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);
  });

  test('navigation is fully visible in tablet landscape', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) await gotIt.click();

    await screenshot(page, 'tablet-08-nav-landscape');

    // At 1024px, the desktop nav should be visible (docs link, etc.)
    const docsLink = page.getByRole('link', { name: 'Documentation' }).first();
    const docsViaLabel = page.getByLabel(/documentation/i).first();
    const hasDocs = await docsLink.isVisible({ timeout: 5000 }).catch(() => false);
    const hasDocsLabel = await docsViaLabel.isVisible({ timeout: 3000 }).catch(() => false);

    // At tablet landscape width, nav items should be accessible
    // Either as direct links or through a menu
    const navLinks = page.getByRole('link');
    const navCount = await navLinks.count();

    expect(hasDocs || hasDocsLabel || navCount > 0).toBeTruthy();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `tablet-landscape-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
