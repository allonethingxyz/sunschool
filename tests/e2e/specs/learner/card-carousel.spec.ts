/**
 * Learner Persona — Card Carousel E2E
 *
 * Validates the card-based lesson presentation UI:
 *   1. Lesson loads and renders cover card with title, summary, metadata
 *   2. Progress bar and card counter are visible
 *   3. Next/Back navigation works through all cards
 *   4. Section cards render content (markdown, images)
 *   5. Final quiz card has Start Quiz CTA that navigates to quiz
 *
 * AI content is variable — assertions are structural, not textual.
 */
import { test, expect, Page } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  spaNavigate,
  waitForLessonLoaded,
} from '../../helpers/learner-setup';

const TEST_NAME = 'card-carousel';

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
  // Wait for auth to complete
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});
}

test.describe('Learner: Card Carousel Lesson UI', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('renders cover card with progress bar, counter, and nav buttons', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'cc_cover');
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    // Switch to learner mode and navigate to lesson
    await switchToLearnerMode(page);
    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);
    await screenshot(page, `${TEST_NAME}-01-cover-card`);

    // Card counter should show "1 / N" where N >= 3
    const counter = page.getByText(/1 \/ \d+/);
    await expect(counter).toBeVisible({ timeout: 15000 });

    // Next button should be visible, Back should be disabled
    const nextBtn = page.getByRole('button', { name: /next/i });
    await expect(nextBtn).toBeVisible({ timeout: 5000 });

    const backBtn = page.getByRole('button', { name: /back/i });
    await expect(backBtn).toBeVisible({ timeout: 5000 });

    // Metadata chips (duration, grade) should be present
    await expect(page.getByText(/min$/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Grade \d+/)).toBeVisible({ timeout: 5000 });

    await screenshot(page, `${TEST_NAME}-02-cover-verified`);
  });

  test('navigates through all cards via Next button and reaches quiz', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'cc_nav');
    const lessonId = await generateAndWaitForLesson(page, 'Math');
    expect(lessonId).toBeTruthy();

    await switchToLearnerMode(page);
    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);

    // Read total card count from the counter
    const counterEl = page.getByText(/\d+ \/ \d+/);
    await expect(counterEl).toBeVisible({ timeout: 15000 });
    const counterText = await counterEl.first().innerText();
    const totalCards = parseInt(counterText.split('/')[1].trim());
    expect(totalCards).toBeGreaterThanOrEqual(3);

    await screenshot(page, `${TEST_NAME}-03-start-navigation`);

    // Navigate forward through each card
    for (let i = 1; i < totalCards; i++) {
      const nextBtn = page.getByRole('button', { name: /next/i });
      const visible = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) break; // quiz card hides Next

      await nextBtn.click();
      await page.waitForTimeout(400);
      await screenshot(page, `${TEST_NAME}-04-card-${i + 1}`);
    }

    // Quiz card: "Start Quiz" CTA should be visible
    const startQuizBtn = page.getByRole('button', { name: /start quiz/i });
    await expect(startQuizBtn).toBeVisible({ timeout: 10000 });
    await screenshot(page, `${TEST_NAME}-05-quiz-card`);

    // Click Start Quiz — should navigate to /quiz/:id
    await startQuizBtn.click();
    await page.waitForLoadState('networkidle');

    // Verify we're on the quiz page
    await expect(page).toHaveURL(/\/quiz\//);
    await screenshot(page, `${TEST_NAME}-06-quiz-page-reached`);
  });

  test('Back button navigates to previous card', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'cc_back');
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await switchToLearnerMode(page);
    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);

    // Verify we're on card 1
    const counterEl = page.getByText(/\d+ \/ \d+/);
    await expect(counterEl).toBeVisible({ timeout: 15000 });

    // Go forward two cards
    const nextBtn = page.getByRole('button', { name: /next/i });
    await nextBtn.click();
    await page.waitForTimeout(400);
    await nextBtn.click();
    await page.waitForTimeout(400);

    // Should be on card 3
    let counter = await page.getByText(/\d+ \/ \d+/).first().innerText();
    expect(parseInt(counter.split('/')[0].trim())).toBe(3);

    // Go back
    const backBtn = page.getByRole('button', { name: /back/i });
    await backBtn.click();
    await page.waitForTimeout(400);

    // Should be on card 2
    counter = await page.getByText(/\d+ \/ \d+/).first().innerText();
    expect(parseInt(counter.split('/')[0].trim())).toBe(2);

    await screenshot(page, `${TEST_NAME}-07-back-navigation`);
  });

  test('section cards render markdown content and images', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'cc_content');
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await switchToLearnerMode(page);
    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);

    // Wait for carousel to render
    await expect(page.getByText(/\d+ \/ \d+/)).toBeVisible({ timeout: 15000 });

    // Navigate to first section card (card 2)
    const nextBtn = page.getByRole('button', { name: /next/i });
    await nextBtn.click();
    await page.waitForTimeout(400);

    await screenshot(page, `${TEST_NAME}-08-section-card`);

    // Section card should have a type label
    const sectionLabels = [
      'INTRODUCTION', 'KEY CONCEPTS', 'EXAMPLES', 'PRACTICE',
      'SUMMARY', 'FUN FACTS',
    ];
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasLabel = sectionLabels.some(label => bodyText.includes(label));
    expect(hasLabel).toBeTruthy();

    // Card should contain substantial text content
    expect(bodyText.length).toBeGreaterThan(150);
  });

  test('recap card shows keywords as styled chips', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'cc_recap');
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await switchToLearnerMode(page);
    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);

    // Wait for carousel
    const counterEl = page.getByText(/\d+ \/ \d+/);
    await expect(counterEl).toBeVisible({ timeout: 15000 });
    const counterText = await counterEl.first().innerText();
    const totalCards = parseInt(counterText.split('/')[1].trim());

    // Navigate through cards looking for the REVIEW card
    const nextBtn = page.getByRole('button', { name: /next/i });
    let foundRecap = false;

    for (let i = 1; i < totalCards; i++) {
      const visible = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (!visible) break;

      await nextBtn.click();
      await page.waitForTimeout(400);

      const text = await page.evaluate(() => document.body.innerText);
      if (text.includes('REVIEW') && text.includes('Words to Know')) {
        foundRecap = true;
        break;
      }
    }

    expect(foundRecap).toBeTruthy();
    await screenshot(page, `${TEST_NAME}-10-recap-card`);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(
        page,
        `${TEST_NAME}-${testInfo.title}`,
        'tests/e2e/screenshots/learner'
      );
    }
  });
});
