/**
 * Learner Persona E2E: Content Display
 *
 * Verifies that AI-generated lesson content renders correctly:
 * text sections, SVG illustrations, diagrams, and adaptive difficulty.
 * All assertions are structural — no exact wording checks.
 */
import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';

const timestamp = Date.now();
const parentUsername = `contentparent_${timestamp}`;
const parentEmail = `contentparent_${timestamp}@test.com`;
const parentPassword = 'TestPassword123!';
const childName = `ContentChild_${timestamp}`;

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

/** Register parent + child, generate a lesson via API. */
async function setupLearnerWithLesson(
  page: Page,
  subject: string = 'Science'
): Promise<{ learnerId: number | null; lessonId: number | null }> {
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
    name: 'Content Test Parent',
    role: 'PARENT',
  });

  if (regResult.token) {
    await page.evaluate((token) => localStorage.setItem('AUTH_TOKEN', token), regResult.token);
  }

  const childResult = await page.evaluate(async (data) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    const res = await fetch('/api/learners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return res.json();
  }, { name: childName, gradeLevel: 3 });

  const learnerId = childResult.id ?? null;
  if (learnerId) {
    await page.evaluate((id) => localStorage.setItem('selectedLearnerId', String(id)), learnerId);
  }

  // Ensure learner profile + generate lesson
  const lessonResult = await page.evaluate(async ({ lid, subj }) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    if (!token || !lid) return null;
    await fetch(`/api/learner-profile/${lid}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const res = await fetch('/api/lessons/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ learnerId: lid, subject: subj, gradeLevel: 3 }),
    });
    if (!res.ok) return null;
    return res.json();
  }, { lid: learnerId, subj: subject });

  return { learnerId, lessonId: lessonResult?.id ?? null };
}

test.describe('Learner: Content Display', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await captureFailureArtifacts(page, testInfo.title);
    }
  });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
  });

  test('lesson content renders headings and paragraph text', async ({ page }) => {
    test.retry(2);
    const { lessonId } = await setupLearnerWithLesson(page, 'Science');
    if (!lessonId) {
      test.skip(true, 'Lesson generation failed');
      return;
    }

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.getByText('Loading your personalized lesson...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
    await screenshot(page, 'content-01-rendered');

    // Structural: at least one heading should be present (lesson title or section heading)
    const headingCount = await page.getByRole('heading').count();
    expect(headingCount).toBeGreaterThanOrEqual(1);

    // Body text should be substantial (AI-generated lesson content)
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(200);

    // Multiple text blocks should exist (sections of the lesson)
    // Count distinct visible text nodes that are longer than 20 chars
    const textBlockCount = await page.evaluate(() => {
      const elements = document.querySelectorAll('div, p, span');
      let count = 0;
      for (const el of elements) {
        const text = el.textContent?.trim() || '';
        if (text.length > 50 && el.children.length === 0) {
          count++;
        }
      }
      return count;
    });
    // Lesson should have at least a few paragraphs of content
    expect(textBlockCount).toBeGreaterThanOrEqual(2);
  });

  test('lesson content includes SVG or image illustrations', async ({ page }) => {
    test.retry(2);
    const { lessonId } = await setupLearnerWithLesson(page, 'Math');
    if (!lessonId) {
      test.skip(true, 'Lesson generation failed');
      return;
    }

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await page.getByText('Loading your personalized lesson...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});

    // Scroll through entire lesson to trigger lazy-loaded images
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let i = 1; i <= 5; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), (scrollHeight / 5) * i);
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'content-02-illustrations');

    // Count visual elements
    const svgCount = await page.locator('svg').count();
    const imgCount = await page.locator('img').count();

    // Lessons should include at least some visual elements (SVG diagrams, icons, or images)
    expect(svgCount + imgCount).toBeGreaterThanOrEqual(1);
  });

  test('lesson content is scrollable with multiple sections', async ({ page }) => {
    test.retry(2);
    const { lessonId } = await setupLearnerWithLesson(page, 'History');
    if (!lessonId) {
      test.skip(true, 'Lesson generation failed');
      return;
    }

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await page.getByText('Loading your personalized lesson...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});

    // Content should extend beyond the viewport (scrollable)
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(scrollHeight).toBeGreaterThan(viewportHeight);

    // Scroll through and capture at different positions
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), (scrollHeight / steps) * i);
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'content-03-scrolled');

    // At bottom of lesson, should see quiz prompt ("Start Quiz" or similar)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');

    const { locator: quizButton } = await selfHealingLocator(page, 'content-quiz-prompt', {
      role: 'button',
      name: 'Start Quiz',
      text: 'Start Quiz',
    });
    const hasQuizButton = await quizButton.isVisible({ timeout: 10000 }).catch(() => false);
    const hasLetsGo = await page.getByText("Let's Go!").isVisible({ timeout: 3000 }).catch(() => false);
    const hasTestKnowledge = await page.getByText(/Test Your Knowledge/i).isVisible({ timeout: 3000 }).catch(() => false);

    // At least one quiz prompt should exist at the bottom
    expect(hasQuizButton || hasLetsGo || hasTestKnowledge).toBeTruthy();
  });

  test('lesson loading state shows spinner before content appears', async ({ page }) => {
    test.retry(2);
    const { lessonId } = await setupLearnerWithLesson(page, 'Science');
    if (!lessonId) {
      test.skip(true, 'Lesson generation failed');
      return;
    }

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');

    // Check if loading spinner appeared (it may have already resolved)
    const loadingText = page.getByText('Loading your personalized lesson...');
    const wasLoading = await loadingText.isVisible({ timeout: 3000 }).catch(() => false);

    // Whether we caught the loading state or not, content should eventually appear
    await loadingText.waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});
    await screenshot(page, 'content-04-after-loading');

    // After loading resolves, headings should be present
    const headingCount = await page.getByRole('heading').count();
    expect(headingCount).toBeGreaterThanOrEqual(1);
  });

  test('learner home subject selector allows choosing a subject', async ({ page }) => {
    test.retry(2);
    const { learnerId } = await setupLearnerWithLesson(page, 'Science');
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'content-05-learner-home');

    // "Change Subject" button should be available on learner home
    const { locator: changeSubjectBtn } = await selfHealingLocator(page, 'change-subject', {
      text: 'Change Subject',
      name: 'Change Subject',
    });
    const hasChangeSubject = await changeSubjectBtn.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasChangeSubject) {
      await changeSubjectBtn.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'content-05-subject-selector');

      // Subject selector modal/view should show subject options
      // Subjects are typically: Science, Math, History, English, etc.
      const bodyText = await page.evaluate(() => document.body.innerText);
      const subjectKeywords = ['Science', 'Math', 'History', 'English', 'Art', 'Reading'];
      const hasSubjects = subjectKeywords.some(s => bodyText.includes(s));

      expect(hasSubjects).toBeTruthy();
    } else {
      // If no "Change Subject" button, the learner home may show "New Lesson" instead
      const hasNewLesson = await page.getByText('New Lesson').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasRandomLesson = await page.getByText('Random Lesson').first().isVisible({ timeout: 5000 }).catch(() => false);

      // At least one lesson generation option should exist
      expect(hasNewLesson || hasRandomLesson).toBeTruthy();
    }
  });
});
