/**
 * Learner Persona — Lesson Flow E2E
 *
 * Journeys:
 *   1. Start a new lesson from the learner home
 *   2. Navigate through lesson content cards
 *   3. Verify structural content rendered (headings, text)
 *   4. Complete lesson by navigating to quiz entry point via card carousel
 *
 * AI content is variable — assertions are structural, not textual.
 */
import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  spaNavigate,
  waitForLessonLoaded,
} from '../../helpers/learner-setup';

/**
 * Switch to learner mode so LearnerRoute paths render properly.
 * Sets preferredMode in localStorage and reloads to re-initialize ModeContext.
 */
async function switchToLearnerMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('preferredMode', 'LEARNER');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});
}

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

    // Switch to learner mode and navigate to learner home
    await switchToLearnerMode(page);
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

    // Card carousel: cover card should be visible with lesson title
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(200);
    // Card counter should show "1 / N"
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible({ timeout: 15000 });

    await screenshot(page, `${TEST_NAME}-05-content-verified`);

    // Navigate through cards using Next button
    const nextBtn = page.getByRole('button', { name: /next/i });

    // Read total card count
    const counterText = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
    const totalCards = parseInt(counterText.split('/')[1].trim());

    for (let i = 1; i < totalCards; i++) {
      const visible = await nextBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (!visible) break; // quiz card hides Next
      await nextBtn.click();
      await page.waitForTimeout(400);
      await screenshot(page, `${TEST_NAME}-06-card-${i + 1}`);
    }

    // Verify the quiz entry point — "Start Quiz" button on final card
    const { locator: startQuizBtn } = await selfHealingLocator(
      page, TEST_NAME,
      { role: 'button', name: /start quiz/i, text: /Start Quiz/i }
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

    // Switch to learner mode and navigate to learner home
    await switchToLearnerMode(page);
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
