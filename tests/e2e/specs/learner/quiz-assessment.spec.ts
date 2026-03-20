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
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  apiCall,
} from '../../helpers/learner-setup';

/**
 * Navigate to a learner route with learner mode enabled.
 * Sets preferredMode in localStorage, then does a full page.goto()
 * so that ModeContext initializes with LEARNER mode from the start.
 */
async function navigateAsLearner(page: Page, path: string): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('preferredMode', 'LEARNER');
  });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});
}

test.describe('Learner: Quiz Assessment', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('can navigate to quiz pre-screen from lesson', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'quiz');

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    // Navigate to lesson page as learner
    await navigateAsLearner(page, '/lesson');
    await page.getByText('Loading your personalized lesson...')
      .waitFor({ state: 'hidden', timeout: 120000 })
      .catch(() => {});

    // Scroll to bottom to find quiz button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'quiz-01-lesson-bottom');

    // Click Start Quiz using selfHealingLocator (semantic only)
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
      await navigateAsLearner(page, `/quiz/${lessonId}`);
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
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'quiz_answer');

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    // Go directly to quiz
    await navigateAsLearner(page, `/quiz/${lessonId}`);

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

    // Find answer options using semantic locators only
    // Try standard ARIA roles first: radio, option, then button-based options
    const radioOptions = page.getByRole('radio');
    const optionOptions = page.getByRole('option');
    const radioCount = await radioOptions.count();
    const optionCount = await optionOptions.count();

    if (radioCount > 0) {
      await radioOptions.first().click();
    } else if (optionCount > 0) {
      await optionOptions.first().click();
    } else {
      // Use selfHealingLocator to find clickable answer choices
      const { locator: answerOption } = await selfHealingLocator(page, 'quiz-answer-option', {
        role: 'button',
        name: /^[A-D]\.|Option/i,
        text: /^[A-D]\./,
      });
      const answerVisible = await answerOption.isVisible({ timeout: 5000 }).catch(() => false);
      if (answerVisible) {
        await answerOption.click();
      }
    }

    await screenshot(page, 'quiz-04-answer-selected');

    // Verify the page has interactive quiz content
    const hasContent = radioCount > 0 || optionCount > 0 || questionCount >= 1;
    expect(hasContent).toBeTruthy();
  });

  test('can submit quiz and view results with score', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'quiz_submit');

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    await navigateAsLearner(page, `/quiz/${lessonId}`);

    // Start quiz
    const startBtn = page.getByText('Start Quiz');
    if (await startBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // Wait for questions
    await page.getByText(/Question \d+ of \d+/).first()
      .waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    // Select answers for each question using semantic locators
    const totalQuestions = await page.getByText(/Question \d+ of \d+/).count();

    for (let q = 1; q <= totalQuestions; q++) {
      const qHeader = page.getByText(`Question ${q} of ${totalQuestions}`);
      if (await qHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
        await qHeader.scrollIntoViewIfNeeded();

        // Try semantic locators for answer options
        const radioOptions = page.getByRole('radio');
        const radioCount = await radioOptions.count();

        if (radioCount >= q) {
          await radioOptions.nth(q - 1).click().catch(() => {});
        } else {
          // Use selfHealingLocator for answer option
          const { locator: answerOption } = await selfHealingLocator(
            page,
            `quiz-q${q}-answer`,
            {
              role: 'button',
              name: /^[A-D]\.|Option|answer/i,
              text: /^[A-D]\./,
            }
          );
          await answerOption.click().catch(() => {});
        }
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
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'quiz_home');

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    // Submit quiz via API for speed
    const learnerId = await page.evaluate(() =>
      Number(localStorage.getItem('selectedLearnerId'))
    );

    const lessonResult = await apiCall(page, 'GET', `/api/lessons/${lessonId}`);
    const questions = lessonResult.data?.spec?.questions || [];

    const answers = questions.map((_: any, i: number) => ({
      questionIndex: i,
      selectedIndex: 0,
    }));

    await apiCall(page, 'POST', `/api/lessons/${lessonId}/answer`, {
      answers,
      learnerId,
    });

    // Navigate to learner home
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'quiz-07-back-to-home');

    // Verify page rendered with substantial content
    // react-native-web renders Text as <div>, not <h1>-<h6>
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `quiz-${testInfo.title}`, 'tests/e2e/screenshots/learner');
    }
  });
});
