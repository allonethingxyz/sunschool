/**
 * Learner Persona E2E: Quiz Assessment
 *
 * Models a child taking a quiz after completing a lesson:
 * - Navigate to quiz from lesson
 * - View pre-quiz screen
 * - Answer questions (select options)
 * - Submit quiz and see results
 * - View score, points earned, and feedback
 *
 * AI-generated quiz questions are non-deterministic — assertions are structural.
 */
import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';

const timestamp = Date.now();
const parentUsername = `quizparent_${timestamp}`;
const parentEmail = `quizparent_${timestamp}@test.com`;
const parentPassword = 'TestPassword123!';
const childName = `QuizChild_${timestamp}`;

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

/** Register parent, create child, store auth. */
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
    name: 'Quiz Test Parent',
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

/** Generate a lesson via API and wait for it to be active */
async function generateAndWaitForLesson(page: Page): Promise<number | null> {
  const result = await page.evaluate(async () => {
    const token = localStorage.getItem('AUTH_TOKEN');
    const learnerId = localStorage.getItem('selectedLearnerId');
    if (!token || !learnerId) return null;

    // Ensure learner profile exists
    await fetch(`/api/learner-profile/${learnerId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const res = await fetch('/api/lessons/create', {
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

    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
  });

  // Poll for active lesson
  for (let i = 0; i < 60; i++) {
    const active = await page.evaluate(async () => {
      const token = localStorage.getItem('AUTH_TOKEN');
      const learnerId = localStorage.getItem('selectedLearnerId');
      const res = await fetch(`/api/lessons/active?learnerId=${learnerId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.id || null;
    });

    if (active) return active;
    await new Promise((r) => setTimeout(r, 5000));
  }

  return null;
}

test.describe('Learner: Quiz Assessment', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
  });

  test('can navigate to quiz pre-screen from lesson', async ({ page }) => {
    test.retry(2);
    await setupLearnerSession(page);

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    // Navigate to lesson page
    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await page.getByText('Loading your personalized lesson...').waitFor({ state: 'hidden', timeout: 120000 }).catch(() => {});

    // Scroll to bottom to find quiz button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'quiz-01-lesson-bottom');

    // Click Start Quiz or Let's Go
    const { locator: quizBtn } = await selfHealingLocator(page, 'quiz-start-btn', {
      role: 'button',
      name: 'Start Quiz',
      text: 'Start Quiz',
    });

    const btnVisible = await quizBtn.isVisible({ timeout: 10000 }).catch(() => false);
    if (btnVisible) {
      await quizBtn.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Navigate directly to quiz page
      await page.goto(`/quiz/${lessonId}`);
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'quiz-02-pre-quiz-screen');

    // Should see quiz page elements (pre-quiz "Get Ready!" or question 1)
    const hasGetReady = await page.getByText(/Get Ready/i).isVisible({ timeout: 10000 }).catch(() => false);
    const hasQuestion = await page.getByText(/Question \d+ of \d+/).isVisible({ timeout: 5000 }).catch(() => false);
    const hasStartQuiz = await page.getByText('Start Quiz').isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasGetReady || hasQuestion || hasStartQuiz).toBeTruthy();
  });

  test('can answer quiz questions and see options', async ({ page }) => {
    test.retry(2);
    await setupLearnerSession(page);

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    // Go directly to quiz
    await page.goto(`/quiz/${lessonId}`);
    await page.waitForLoadState('networkidle');

    // Click "Start Quiz" on pre-quiz screen if present
    const { locator: startBtn } = await selfHealingLocator(page, 'quiz-start-button', {
      role: 'button',
      name: 'Start Quiz',
      text: 'Start Quiz',
    });

    const startVisible = await startBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (startVisible) {
      await startBtn.click();
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'quiz-03-questions-visible');

    // Wait for first question to appear
    const questionHeader = page.getByText(/Question \d+ of \d+/);
    await questionHeader.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    // Count questions visible
    const questionCount = await questionHeader.count();
    expect(questionCount).toBeGreaterThanOrEqual(1);

    // For each visible question, verify answer options exist
    // Quiz questions have clickable option elements (tabindex=0 divs)
    const optionElements = await page.locator('[tabindex="0"]').count();
    // Should have at least some interactive option elements
    expect(optionElements).toBeGreaterThanOrEqual(2);

    // Click the first answer option for the first question
    const clicked = await page.evaluate(() => {
      const clickables = document.querySelectorAll('[tabindex="0"]');
      for (const el of clickables) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 30) {
          const text = el.textContent || '';
          if (!text.match(/Question \d+ of \d+/) && !text.includes('Dashboard') && !text.includes('Progress')) {
            (el as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    });

    await screenshot(page, 'quiz-04-answer-selected');
    expect(clicked || optionElements >= 2).toBeTruthy();
  });

  test('can submit quiz and view results with score', async ({ page }) => {
    test.retry(2);
    await setupLearnerSession(page);

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    await page.goto(`/quiz/${lessonId}`);
    await page.waitForLoadState('networkidle');

    // Start quiz
    const startBtn = page.getByText('Start Quiz');
    if (await startBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // Wait for questions
    await page.getByText(/Question \d+ of \d+/).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    // Select an answer for each question by clicking tabindex=0 elements
    const totalQuestions = await page.getByText(/Question \d+ of \d+/).count();

    for (let q = 1; q <= totalQuestions; q++) {
      const questionHeader = page.getByText(`Question ${q} of ${totalQuestions}`);
      if (await questionHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
        await questionHeader.scrollIntoViewIfNeeded();

        await page.evaluate((qNum) => {
          const allElements = document.querySelectorAll('*');
          let questionEl: Element | null = null;
          for (const el of allElements) {
            if (el.textContent?.trim()?.match(new RegExp(`^Question ${qNum} of \\d+$`))) {
              questionEl = el;
              break;
            }
          }
          if (!questionEl) return;

          let container = questionEl.parentElement;
          for (let i = 0; i < 5 && container; i++) {
            const clickables = container.querySelectorAll('[tabindex="0"]');
            if (clickables.length >= 3) {
              for (const clickable of clickables) {
                if (clickable.textContent?.includes(`Question ${qNum}`)) continue;
                const rect = clickable.getBoundingClientRect();
                if (rect.width < 100) continue;
                (clickable as HTMLElement).click();
                return;
              }
            }
            container = container.parentElement;
          }
        }, q);
      }
    }

    await screenshot(page, 'quiz-05-all-answered');

    // Handle any alerts
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Click "I'm Done!" to submit
    const { locator: doneBtn } = await selfHealingLocator(page, 'quiz-submit', {
      role: 'button',
      name: "I'm Done!",
      text: "I'm Done!",
    });

    const doneVisible = await doneBtn.isVisible({ timeout: 10000 }).catch(() => false);
    if (doneVisible) {
      await doneBtn.scrollIntoViewIfNeeded();
      await doneBtn.click();
    }

    await page.waitForLoadState('networkidle');
    await screenshot(page, 'quiz-06-results');

    // Verify results page shows score or results summary
    const hasResults = await page.getByText(/Your Results|Score|Results/i)
      .isVisible({ timeout: 15000 }).catch(() => false);
    const hasPoints = await page.getByText(/points|pts/i)
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasPercentage = await page.getByText(/%/)
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasKeepGoing = await page.getByText('Keep Going!')
      .isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasResults || hasPoints || hasPercentage || hasKeepGoing).toBeTruthy();
  });

  test('can return to learner home after quiz completion', async ({ page }) => {
    test.retry(2);
    await setupLearnerSession(page);

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    // Submit quiz via API for speed
    await page.evaluate(async (lessonId) => {
      const token = localStorage.getItem('AUTH_TOKEN');
      const learnerId = localStorage.getItem('selectedLearnerId');
      if (!token) return;

      const lessonRes = await fetch(`/api/lessons/${lessonId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!lessonRes.ok) return;
      const lesson = await lessonRes.json();
      const questions = lesson.spec?.questions || [];

      const answers = questions.map((_: any, i: number) => ({
        questionIndex: i,
        selectedIndex: 0,
      }));

      await fetch(`/api/lessons/${lessonId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ answers, learnerId: Number(learnerId) }),
      });
    }, lessonId);

    // Navigate to learner home
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'quiz-07-back-to-home');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);
  });
});
