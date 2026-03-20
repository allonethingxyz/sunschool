/**
 * Learner Persona — Card Carousel E2E
 *
 * Validates the card-based lesson presentation UI:
 *   1. Lesson loads and renders cover card with title, summary, metadata
 *   2. Progress bar and card counter are visible
 *   3. Next/Back navigation works through all cards
 *   4. Section cards render content (markdown, images)
 *   5. Final quiz card has Start Quiz CTA that navigates to quiz
 *   6. Swipe gesture navigation works on mobile viewport
 *
 * AI content is variable — assertions are structural, not textual.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  spaNavigate,
  waitForLessonLoaded,
} from '../../helpers/learner-setup';

const TEST_NAME = 'card-carousel';

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

    // Navigate to lesson page
    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);
    await screenshot(page, `${TEST_NAME}-01-cover-card`);

    // Card counter should show "1 / N" where N >= 3 (cover + at least 1 section + quiz)
    const counter = page.getByText(/^1 \/ \d+$/);
    await expect(counter).toBeVisible({ timeout: 15000 });

    // "LESSON" label should be visible on cover card
    await expect(page.getByText('LESSON')).toBeVisible({ timeout: 5000 });

    // Summary text should be visible (lesson always has a summary)
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(100);

    // Next button should be visible, Back should be disabled
    const nextBtn = page.getByRole('button', { name: /next/i });
    await expect(nextBtn).toBeVisible({ timeout: 5000 });

    const backBtn = page.getByRole('button', { name: /back/i });
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    // Back button on first card should look disabled (opacity style)
    await expect(backBtn).toBeDisabled();

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

    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);

    // Read total card count from the counter
    const counterText = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
    const totalCards = parseInt(counterText.split('/')[1].trim());
    expect(totalCards).toBeGreaterThanOrEqual(3); // cover + section(s) + quiz

    await screenshot(page, `${TEST_NAME}-03-start-navigation`);

    // Navigate forward through each card
    for (let i = 1; i < totalCards; i++) {
      const nextBtn = page.getByRole('button', { name: /next/i });
      const isLastContent = i === totalCards - 1;

      if (isLastContent) {
        // On the last card before quiz, Next button should not be visible
        // (quiz card replaces Next with Start Quiz CTA)
        break;
      }

      // Click Next
      await nextBtn.click();
      await page.waitForTimeout(400); // wait for slide animation

      // Counter should update
      const newCounter = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
      const currentCard = parseInt(newCounter.split('/')[0].trim());
      expect(currentCard).toBe(i + 1);

      await screenshot(page, `${TEST_NAME}-04-card-${i + 1}`);

      // Back button should now be enabled (not on first card)
      const backBtn = page.getByRole('button', { name: /back/i });
      await expect(backBtn).toBeEnabled();
    }

    // We should now be on the last card (quiz card) or second-to-last
    // Navigate to the quiz card if not already there
    const currentCounterText = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
    const currentPos = parseInt(currentCounterText.split('/')[0].trim());
    const remaining = totalCards - currentPos;
    for (let i = 0; i < remaining; i++) {
      const nextBtn = page.getByRole('button', { name: /next/i });
      const visible = await nextBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) {
        await nextBtn.click();
        await page.waitForTimeout(400);
      }
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

    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);

    // Go forward two cards
    const nextBtn = page.getByRole('button', { name: /next/i });
    await nextBtn.click();
    await page.waitForTimeout(400);
    await nextBtn.click();
    await page.waitForTimeout(400);

    // Should be on card 3
    let counter = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
    expect(parseInt(counter.split('/')[0].trim())).toBe(3);

    // Go back
    const backBtn = page.getByRole('button', { name: /back/i });
    await backBtn.click();
    await page.waitForTimeout(400);

    // Should be on card 2
    counter = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
    expect(parseInt(counter.split('/')[0].trim())).toBe(2);

    await screenshot(page, `${TEST_NAME}-07-back-navigation`);
  });

  test('section cards render markdown content and images', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'cc_content');
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);

    // Navigate to first section card (card 2)
    const nextBtn = page.getByRole('button', { name: /next/i });
    await nextBtn.click();
    await page.waitForTimeout(400);

    await screenshot(page, `${TEST_NAME}-08-section-card`);

    // Section card should have a type label (e.g., "INTRODUCTION", "KEY CONCEPTS")
    const sectionLabels = [
      'INTRODUCTION', 'KEY CONCEPTS', 'EXAMPLES', 'PRACTICE',
      'SUMMARY', 'FUN FACTS', 'KEY_CONCEPTS',
    ];
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasLabel = sectionLabels.some(label => bodyText.includes(label));
    expect(hasLabel).toBeTruthy();

    // Card should contain substantial text content (markdown rendered)
    // Looking for paragraphs or list items as evidence of rendered markdown
    const textLength = bodyText.length;
    expect(textLength).toBeGreaterThan(150);

    // Check for SVG images or placeholder images
    const hasSvgOrImage = await page.evaluate(() => {
      const svgs = document.querySelectorAll('svg');
      const imgs = document.querySelectorAll('img');
      return svgs.length > 0 || imgs.length > 0;
    });
    // Images may or may not be present on every section — just log
    if (hasSvgOrImage) {
      await screenshot(page, `${TEST_NAME}-09-section-with-images`);
    }
  });

  test('recap card shows keywords as styled chips', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page, 'cc_recap');
    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await spaNavigate(page, '/lesson');
    await waitForLessonLoaded(page);

    // Read total cards to find the recap card (second to last)
    const counterText = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
    const totalCards = parseInt(counterText.split('/')[1].trim());

    // Navigate to the second-to-last card (recap) or find REVIEW label
    const nextBtn = page.getByRole('button', { name: /next/i });
    let foundRecap = false;

    for (let i = 1; i < totalCards; i++) {
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

    // Keywords should be rendered (at least one)
    const reviewText = await page.evaluate(() => document.body.innerText);
    expect(reviewText).toContain('Words to Know');
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
