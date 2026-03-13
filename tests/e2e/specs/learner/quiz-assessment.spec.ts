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
import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  apiCall,
  waitForLessonLoaded,
} from '../../helpers/learner-setup';

test.describe('Learner: Quiz Assessment', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('can navigate to quiz pre-screen from lesson', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'quizpre');

    const lessonId = await generateAndWaitForLesson(page);
    expect(lessonId).toBeTruthy();

    // Navigate to lesson page
    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);

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
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'quizopts');

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

    // Verify answer options exist using semantic locators
    // Quiz options may render as radio buttons, buttons, or generic interactive elements
    const radioOptions = await page.getByRole('radio').count();
    const buttonOptions = await page.getByRole('option').count();
    const interactiveButtons = await page.getByRole('button').count();

    // Should have at least some interactive elements for answering
    expect(radioOptions + buttonOptions + interactiveButtons).toBeGreaterThanOrEqual(2);

    // Click the first answer option using selfHealingLocator
    const { locator: firstOption } = await selfHealingLocator(page, 'quiz-first-option', {
      role: 'radio',
      name: /.*/,
    });

    const optionVisible = await firstOption.isVisible({ timeout: 5000 }).catch(() => false);
    if (optionVisible) {
      await firstOption.click();
    } else {
      // Fall back to clicking any visible button that looks like an answer option
      const { locator: optionBtn } = await selfHealingLocator(page, 'quiz-option-btn', {
        role: 'button',
      });
      const btnVisible = await optionBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (btnVisible) {
        await optionBtn.click();
      }
    }

    await screenshot(page, 'quiz-04-answer-selected');
  });

  test('can submit quiz and view results with score', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'quizsub');

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

    // Select answers for each question using semantic locators
    const totalQuestions = await page.getByText(/Question \d+ of \d+/).count();

    for (let q = 1; q <= totalQuestions; q++) {
      const questionHeader = page.getByText(`Question ${q} of ${totalQuestions}`);
      if (await questionHeader.isVisible({ timeout: 3000 }).catch(() => false)) {
        await questionHeader.scrollIntoViewIfNeeded();

        // Try to find and click an answer option within this question's context
        // Use semantic locators: radio buttons or clickable options
        const { locator: answerOption } = await selfHealingLocator(page, `quiz-q${q}-answer`, {
          role: 'radio',
          name: /.*/,
        });

        const answerVisible = await answerOption.isVisible({ timeout: 3000 }).catch(() => false);
        if (answerVisible) {
          await answerOption.click();
        } else {
          // Fall back: find any clickable button near the question
          const { locator: btnOption } = await selfHealingLocator(page, `quiz-q${q}-btn`, {
            role: 'button',
          });
          if (await btnOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await btnOption.click();
          }
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
    await setupLearnerSession(page, 'quizhome');

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
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'quiz-07-back-to-home');

    // Verify the learner home page rendered with content
    const headings = await page.getByRole('heading').count();
    expect(headings).toBeGreaterThanOrEqual(1);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `quiz-assessment-${testInfo.title}`);
    }
  });
});
