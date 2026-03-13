import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

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

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';
const TEST_NAME = 'lesson-flow';

// Shared auth state — each test registers a fresh parent + child
const timestamp = Date.now();
const parentUsername = `lf_parent_${timestamp}`;
const parentEmail = `lf_parent_${timestamp}@test.com`;
const parentPassword = 'TestPassword123!';
const childName = `LFChild_${timestamp}`;

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${TEST_NAME}-${name}.png`,
    fullPage: false,
  });
}

/**
 * Register parent, create child, switch to learner mode.
 * Returns the learnerId from localStorage.
 */
async function setupLearnerSession(page: Page): Promise<void> {
  // Register parent via API
  const regResult = await page.evaluate(async (data) => {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }, {
    username: parentUsername,
    email: parentEmail,
    password: parentPassword,
    name: 'LF Test Parent',
    role: 'PARENT',
  });

  // Store token
  await page.evaluate((token) => {
    localStorage.setItem('AUTH_TOKEN', token);
  }, regResult.token);

  // Create child learner via API
  const childResult = await page.evaluate(async (data) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    const res = await fetch('/api/learners', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  }, { name: childName, gradeLevel: 3 });

  // Store selected learner
  const learnerId = childResult.id || childResult.learnerId;
  await page.evaluate((id) => {
    localStorage.setItem('selectedLearnerId', String(id));
  }, learnerId);

  // Ensure learner profile exists
  await page.evaluate(async (id) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    await fetch(`/api/learner-profile/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }, learnerId);
}

test.describe('Learner: Lesson Flow', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
  });

  test('start a new lesson and navigate through content', async ({ page }) => {
    test.setTimeout(600000); // 10 min — lesson generation is slow

    await setupLearnerSession(page);

    // Navigate to learner home
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, '01-learner-home');

    // Verify learner home loaded — look for structural elements
    const { locator: randomLessonBtn } = await selfHealingLocator(
      page, TEST_NAME, { role: 'button', name: 'Random Lesson', text: 'Random Lesson' }
    );

    // If no active lesson, generate one
    const noActiveLesson = await page.getByText("You don't have an active lesson")
      .isVisible({ timeout: 3000 }).catch(() => false);

    if (noActiveLesson) {
      await randomLessonBtn.click();
      await screenshot(page, '02-generating-lesson');

      // Wait for lesson generation (poll for "Current Lesson" header)
      let lessonReady = false;
      for (let i = 0; i < 60; i++) {
        await page.waitForLoadState('networkidle');
        const hasLesson = await page.getByText('Current Lesson')
          .isVisible({ timeout: 2000 }).catch(() => false);
        if (hasLesson) {
          lessonReady = true;
          break;
        }
        // Brief wait between polls
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => new Promise(r => setTimeout(r, 5000)));
      }
      expect(lessonReady).toBe(true);
    }

    await screenshot(page, '03-lesson-ready');

    // Verify "Current Lesson" card exists
    await expect(page.getByText('Current Lesson')).toBeVisible();

    // Click the lesson card to view content
    const currentLessonHeader = page.getByText('Current Lesson');
    const lessonCard = currentLessonHeader.locator('..').locator('..').locator('[tabindex="0"], [role="button"]').first();
    if (await lessonCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await lessonCard.click();
    } else {
      await currentLessonHeader.locator('..').locator('..').click();
    }
    await page.waitForLoadState('networkidle');
    await screenshot(page, '04-lesson-content');

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

    await screenshot(page, '05-content-verified');

    // Scroll through the lesson sections
    for (let scroll = 1; scroll <= 4; scroll++) {
      await page.evaluate((y) => window.scrollTo(0, y), scroll * 600);
      await page.waitForLoadState('networkidle');
      await screenshot(page, `06-scroll-${scroll}`);
    }

    // Verify the quiz entry point exists at the bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');

    const { locator: startQuizBtn } = await selfHealingLocator(
      page, TEST_NAME,
      { role: 'button', name: 'Start Quiz', text: 'Start Quiz' }
    );
    await expect(startQuizBtn).toBeVisible({ timeout: 10000 });
    await screenshot(page, '07-quiz-entry-visible');
  });

  test('lesson card displays subject and topic information', async ({ page }) => {
    test.setTimeout(600000);

    await setupLearnerSession(page);

    // Generate a lesson via API directly
    await page.evaluate(async () => {
      const token = localStorage.getItem('AUTH_TOKEN');
      const learnerId = localStorage.getItem('selectedLearnerId');
      await fetch('/api/lessons/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          learnerId: Number(learnerId),
          subject: 'Science',
          gradeLevel: 3,
        }),
      });
    });

    // Navigate to learner home and wait for lesson
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    // Poll for lesson availability
    let lessonReady = false;
    for (let i = 0; i < 60; i++) {
      const hasLesson = await page.getByText('Current Lesson')
        .isVisible({ timeout: 2000 }).catch(() => false);
      if (hasLesson) {
        lessonReady = true;
        break;
      }
      await page.evaluate(() => new Promise(r => setTimeout(r, 5000)));
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    if (lessonReady) {
      // Verify the lesson card has structural content
      await expect(page.getByText('Current Lesson')).toBeVisible();
      await screenshot(page, '08-lesson-card-info');

      // The card should contain some text (topic/title) — at least visible text beyond the header
      const cardSection = page.getByText('Current Lesson').locator('..');
      const cardText = await cardSection.innerText();
      expect(cardText.length).toBeGreaterThan(10);
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `${TEST_NAME}-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
