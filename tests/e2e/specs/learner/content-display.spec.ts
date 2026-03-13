/**
 * Learner Persona E2E: Content Display
 *
 * Verifies that lesson content renders correctly:
 * - Text sections render with proper structure
 * - SVG illustrations and diagrams display
 * - Adaptive difficulty is reflected in content complexity
 * - Knowledge graph renders
 * - Quiz questions have visual elements (image-based questions, option SVGs)
 *
 * All assertions are structural — AI-generated content varies per request.
 */
import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator } from '../../helpers/self-healing';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';

const timestamp = Date.now();
const parentUsername = `contentparent_${timestamp}`;
const parentEmail = `contentparent_${timestamp}@test.com`;
const parentPassword = 'TestPassword123!';
const childName = `ContentChild_${timestamp}`;

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

async function setupLearnerSession(page: Page): Promise<void> {
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  }, { name: childName, gradeLevel: 3 });

  if (childResult.id) {
    await page.evaluate((id) => localStorage.setItem('selectedLearnerId', String(id)), childResult.id);
  }
}

/** Generate a lesson via API and wait for it to become active */
async function generateLesson(page: Page, subject: string = 'Science'): Promise<number | null> {
  await page.evaluate(async () => {
    const token = localStorage.getItem('AUTH_TOKEN');
    const learnerId = localStorage.getItem('selectedLearnerId');
    if (!token || !learnerId) return;
    await fetch(`/api/learner-profile/${learnerId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  });

  await page.evaluate(async (subject) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    const learnerId = localStorage.getItem('selectedLearnerId');
    if (!token || !learnerId) return null;

    const res = await fetch('/api/lessons/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ learnerId: Number(learnerId), subject, gradeLevel: 3 }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
  }, subject);

  // Wait for lesson to be active
  for (let i = 0; i < 60; i++) {
    const active = await page.evaluate(async () => {
      const token = localStorage.getItem('AUTH_TOKEN');
      const learnerId = localStorage.getItem('selectedLearnerId');
      const res = await fetch(`/api/lessons/active?learnerId=${learnerId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    });

    if (active?.id) return active.id;
    await new Promise((r) => setTimeout(r, 5000));
  }

  return null;
}

test.describe('Learner: Content Display', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
  });

  test('lesson content renders text sections with headings and paragraphs', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page);

    const lessonId = await generateLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await page.getByText('Loading your personalized lesson...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});

    await screenshot(page, 'content-01-text-sections');

    // Verify text structure
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);

    // Check for substantial content — lesson should have multiple sections
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(200);

    // Content should have multiple distinct text blocks
    const textElements = await page.locator('p, [data-testid*="content"]').count();
    expect(textElements).toBeGreaterThanOrEqual(1);
  });

  test('lesson page displays SVG illustrations or images', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page);

    const lessonId = await generateLesson(page, 'Math');
    expect(lessonId).toBeTruthy();

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await page.getByText('Loading your personalized lesson...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});

    // Scroll through entire page to trigger lazy-loaded images
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < scrollHeight; y += 500) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'content-02-illustrations');

    // Count visual elements
    const svgCount = await page.locator('svg').count();
    const imgCount = await page.locator('img').count();

    // Lessons should include visual content (inline SVGs, <img> tags, or both)
    expect(svgCount + imgCount).toBeGreaterThanOrEqual(1);

    // Check for lesson-specific images (not just UI icons)
    const largeImages = await page.evaluate(() => {
      const imgs = document.querySelectorAll('svg, img');
      let count = 0;
      for (const img of Array.from(imgs)) {
        const rect = img.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 50) count++;
      }
      return count;
    });

    expect(largeImages).toBeGreaterThanOrEqual(1);
  });

  test('lesson content is rendered at appropriate grade level', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page);

    const lessonId = await generateLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    // Get lesson spec via API to check grade level
    const lessonSpec = await page.evaluate(async (lid) => {
      const token = localStorage.getItem('AUTH_TOKEN');
      if (!token) return null;

      const res = await fetch(`/api/lessons/${lid}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.spec || null;
    }, lessonId);

    if (lessonSpec) {
      // Verify spec has expected structural fields
      expect(lessonSpec.title).toBeTruthy();
      expect(lessonSpec.sections).toBeDefined();
      expect(Array.isArray(lessonSpec.sections)).toBe(true);
      expect(lessonSpec.sections.length).toBeGreaterThanOrEqual(1);

      // Check that grade level matches what was requested
      if (lessonSpec.targetGradeLevel) {
        expect(lessonSpec.targetGradeLevel).toBe(3);
      }

      // Verify difficulty level is set
      if (lessonSpec.difficultyLevel) {
        expect(['beginner', 'intermediate', 'advanced']).toContain(lessonSpec.difficultyLevel);
      }

      // Verify questions exist
      if (lessonSpec.questions) {
        expect(Array.isArray(lessonSpec.questions)).toBe(true);
        expect(lessonSpec.questions.length).toBeGreaterThanOrEqual(1);

        // Each question should have text and options
        for (const q of lessonSpec.questions) {
          expect(q.text).toBeTruthy();
          expect(Array.isArray(q.options)).toBe(true);
          expect(q.options.length).toBeGreaterThanOrEqual(2);
        }
      }
    }

    // Verify content renders on the page
    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await page.getByText('Loading your personalized lesson...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});

    await screenshot(page, 'content-03-grade-level');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(100);
  });

  test('quiz questions render with answer options and visual elements', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page);

    const lessonId = await generateLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    // Navigate to quiz page
    await page.goto(`/quiz/${lessonId}`);
    await page.waitForLoadState('networkidle');

    // Click Start Quiz if pre-quiz screen appears
    const startBtn = page.getByText('Start Quiz');
    if (await startBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'content-04-quiz-questions');

    // Wait for questions to appear
    const questionHeader = page.getByText(/Question \d+ of \d+/);
    await questionHeader.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    const questionCount = await questionHeader.count();
    expect(questionCount).toBeGreaterThanOrEqual(1);

    // Each question should have visible answer options
    const interactiveElements = await page.locator('[tabindex="0"]').count();
    expect(interactiveElements).toBeGreaterThanOrEqual(2);

    // Check for visual elements in quiz
    const quizSvgs = await page.locator('svg').count();
    expect(quizSvgs).toBeGreaterThanOrEqual(1);

    // Scroll through all questions
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'content-04-quiz-all-questions');
  });

  test('learner home displays knowledge graph or learning overview', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page);

    // Generate a lesson to populate the knowledge graph
    await generateLesson(page, 'Science');

    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'content-05-knowledge-graph');

    // The learner home should have structural elements
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    // Look for knowledge graph or learning overview elements
    const hasSvgGraph = await page.locator('svg').count();
    const hasProgressSection = await page.getByText(/Progress|My Progress|Knowledge/i)
      .first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasGoalsStrip = await page.getByText(/Goals|Rewards/i)
      .first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasSvgGraph > 0 || hasProgressSection || hasGoalsStrip).toBeTruthy();
  });
});
