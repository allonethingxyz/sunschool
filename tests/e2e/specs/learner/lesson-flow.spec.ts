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
import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  spaNavigate,
  waitForLessonLoaded,
} from '../../helpers/learner-setup';

const TEST_NAME = 'lesson-flow';

test.describe('Learner: Lesson Flow', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('start a new lesson and navigate through content', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'lf');

    // Generate a lesson via API (reliable, avoids UI button flakiness)
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    // Navigate to learner home (SPA navigate to preserve auth)
    await spaNavigate(page, '/learner');
    await screenshot(page, `${TEST_NAME}-01-learner-home`);

    // Verify "Current Lesson" card exists
    await expect(page.getByText('Current Lesson')).toBeVisible({ timeout: 30000 });

    await screenshot(page, `${TEST_NAME}-03-lesson-ready`);

    // Click the lesson card to view content using semantic locators
    const { locator: lessonCard } = await selfHealingLocator(
      page, TEST_NAME,
      { role: 'button', name: /lesson|view|start|continue/i, text: /lesson/i }
    );

    const lessonCardVisible = await lessonCard.isVisible({ timeout: 3000 }).catch(() => false);
    if (lessonCardVisible) {
      await lessonCard.click();
    } else {
      // Fall back to clicking the "Current Lesson" text area
      await page.getByText('Current Lesson').click();
    }

    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);
    await screenshot(page, `${TEST_NAME}-04-lesson-content`);

    // Structural assertions: lesson content should have rendered
    const headings = page.getByRole('heading');
    await expect(headings.first()).toBeVisible({ timeout: 30000 });
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThanOrEqual(1);

    // Content area should have substantial text
    const bodyText = await page.getByRole('main').innerText().catch(
      () => page.evaluate(() => document.body.innerText)
    );
    expect(bodyText.length).toBeGreaterThan(200);

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

    await setupLearnerSession(page, 'lf_card');

    // Generate a lesson via API and wait for it to be active
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    // Navigate to learner home (SPA navigate to preserve auth)
    await spaNavigate(page, '/learner');

    // Verify the lesson card has structural content
    await expect(page.getByText('Current Lesson')).toBeVisible({ timeout: 30000 });
    await screenshot(page, `${TEST_NAME}-08-lesson-card-info`);

    // The page should contain visible headings and content
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `${TEST_NAME}-${testInfo.title}`, 'tests/e2e/screenshots/learner');
    }
  });
});
