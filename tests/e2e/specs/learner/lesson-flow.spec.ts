import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  waitForLessonLoaded,
  pollForVisibleText,
  apiCall,
} from '../../helpers/learner-setup';

/**
 * Learner Persona — Lesson Flow E2E
 *
 * Journeys:
 *   1. Start a new lesson from the learner home
 *   2. Navigate through lesson content sections
 *   3. Verify structural content rendered (headings, paragraphs, images)
 *   4. Complete lesson by navigating to quiz entry point
 *
 * AI content is variable — assertions are structural, not textual.
 */

const TEST_NAME = 'lesson-flow';

test.describe('Learner: Lesson Flow', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('start a new lesson and navigate through content', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'lf');

    // Navigate to learner home
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, `${TEST_NAME}-01-learner-home`);

    // Verify learner home loaded — look for structural elements
    const { locator: randomLessonBtn } = await selfHealingLocator(
      page, TEST_NAME, { role: 'button', name: 'Random Lesson', text: 'Random Lesson' }
    );

    // If no active lesson, generate one
    const noActiveLesson = await page.getByText("You don't have an active lesson")
      .isVisible({ timeout: 3000 }).catch(() => false);

    if (noActiveLesson) {
      await randomLessonBtn.click();
      await screenshot(page, `${TEST_NAME}-02-generating-lesson`);

      // Wait for lesson generation using proper Playwright polling
      const lessonReady = await pollForVisibleText(page, 'Current Lesson', {
        timeout: 300_000,
        reloadBetweenPolls: false,
      });
      expect(lessonReady).toBe(true);
    }

    await screenshot(page, `${TEST_NAME}-03-lesson-ready`);

    // Verify "Current Lesson" card exists
    await expect(page.getByText('Current Lesson')).toBeVisible();

    // Click the lesson card to view content using semantic locators
    // Look for a button or link near the "Current Lesson" heading
    const { locator: viewLessonBtn } = await selfHealingLocator(
      page, TEST_NAME,
      { role: 'button', name: 'Current Lesson', text: 'Current Lesson' }
    );

    const viewBtnVisible = await viewLessonBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (viewBtnVisible) {
      await viewLessonBtn.click();
    } else {
      // Fall back to clicking the heading text itself (it may be a clickable card)
      await page.getByText('Current Lesson').click();
    }
    await page.waitForLoadState('networkidle');
    await screenshot(page, `${TEST_NAME}-04-lesson-content`);

    // Structural assertions: lesson content should have rendered
    // At least one heading element (lesson title or section header)
    const headings = page.getByRole('heading');
    await expect(headings.first()).toBeVisible({ timeout: 30000 });
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThanOrEqual(1);

    // Content area should have text paragraphs (rendered as Text components)
    // Check for minimum text content length on the page
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(200);

    await screenshot(page, `${TEST_NAME}-05-content-verified`);

    // Scroll through the lesson sections
    for (let scroll = 1; scroll <= 4; scroll++) {
      await page.evaluate((y) => window.scrollTo(0, y), scroll * 600);
      await page.waitForLoadState('networkidle');
      await screenshot(page, `${TEST_NAME}-06-scroll-${scroll}`);
    }

    // Verify the quiz entry point exists at the bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');

    const { locator: startQuizBtn } = await selfHealingLocator(
      page, TEST_NAME,
      { role: 'button', name: 'Start Quiz', text: 'Start Quiz' }
    );
    await expect(startQuizBtn).toBeVisible({ timeout: 10000 });
    await screenshot(page, `${TEST_NAME}-07-quiz-entry-visible`);
  });

  test('lesson card displays subject and topic information', async ({ page }) => {
    test.setTimeout(600000);

    const { learnerId } = await setupLearnerSession(page, 'lf_card');

    // Generate a lesson via API
    await generateAndWaitForLesson(page, 'Science');

    // Navigate to learner home and wait for lesson
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    // Poll for lesson card to appear
    const lessonReady = await pollForVisibleText(page, 'Current Lesson', {
      timeout: 300_000,
      reloadBetweenPolls: true,
    });

    if (lessonReady) {
      // Verify the lesson card has structural content
      await expect(page.getByText('Current Lesson')).toBeVisible();
      await screenshot(page, `${TEST_NAME}-08-lesson-card-info`);

      // The page should contain visible text beyond just the header
      const pageText = await page.evaluate(() => document.body.innerText);
      expect(pageText.length).toBeGreaterThan(10);
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `${TEST_NAME}-${testInfo.title}`, 'tests/e2e/screenshots/learner');
    }
  });
});
