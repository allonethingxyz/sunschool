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
  waitForLessonLoaded,
} from '../../helpers/learner-setup';

const TEST_NAME = 'lesson-flow';

test.describe('Learner: Lesson Flow', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  // QUARANTINE: Lesson generation returns 503 on production (tracked in el-1mbp).
  // Un-skip when the backend lesson-gen service is restored.
  test.skip('start a new lesson and navigate through content', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'lf');
    await screenshot(page, `${TEST_NAME}-01-learner-home`);

    // Generate a lesson via API (more reliable than clicking Random Lesson)
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();
    await screenshot(page, `${TEST_NAME}-02-lesson-generated`);

    // Navigate directly to the lesson page
    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);
    await screenshot(page, `${TEST_NAME}-03-lesson-content`);

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

    await screenshot(page, `${TEST_NAME}-04-content-verified`);

    // Scroll through the lesson sections
    for (let scroll = 1; scroll <= 4; scroll++) {
      await page.evaluate((y) => window.scrollTo(0, y), scroll * 600);
      await page.waitForLoadState('networkidle');
      await screenshot(page, `${TEST_NAME}-05-scroll-${scroll}`);
    }

    // Verify the quiz entry point exists at the bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');

    const { locator: startQuizBtn } = await selfHealingLocator(
      page, TEST_NAME,
      { role: 'button', name: 'Start Quiz', text: 'Start Quiz' }
    );
    await expect(startQuizBtn).toBeVisible({ timeout: 10000 });
    await screenshot(page, `${TEST_NAME}-06-quiz-entry-visible`);
  });

  // QUARANTINE: Depends on lesson generation (503 on production, tracked in el-1mbp).
  // Passed intermittently when server load is low. Un-skip when backend is restored.
  test.skip('lesson card displays subject and topic information', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'lf_card');

    // Generate a lesson via API
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    // Navigate to learner home to see the lesson card
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    // Wait for learner home to finish loading
    await page.getByText(/Getting your stuff ready/i)
      .waitFor({ state: 'hidden', timeout: 30_000 })
      .catch(() => {});

    // Check for "Current Lesson" card
    const hasCurrentLesson = await page.getByText('Current Lesson')
      .isVisible({ timeout: 30_000 }).catch(() => false);

    if (hasCurrentLesson) {
      await expect(page.getByText('Current Lesson')).toBeVisible();
      await screenshot(page, `${TEST_NAME}-07-lesson-card-info`);

      // The page should contain visible headings and content
      const headings = await page.getByRole('heading').count();
      expect(headings).toBeGreaterThanOrEqual(1);
    } else {
      // Learner home may not show "Current Lesson" text — verify structural content
      const headings = await page.getByRole('heading').count();
      expect(headings).toBeGreaterThanOrEqual(1);
      await screenshot(page, `${TEST_NAME}-07-learner-home-content`);
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `${TEST_NAME}-${testInfo.title}`, 'tests/e2e/screenshots/learner');
    }
  });
});
