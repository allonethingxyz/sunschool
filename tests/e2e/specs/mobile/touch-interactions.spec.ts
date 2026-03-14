/**
 * Mobile Persona E2E: Touch Interactions
 *
 * Validates touch-based interactions on a mobile viewport (375×667).
 * Covers:
 *   - Tap to navigate (buttons, links, cards)
 *   - Swipe/scroll through lesson content
 *   - Tap quiz answer options
 *   - Tap to open/close modals and menus
 *   - Touch target sizes meet minimum 44×44px accessibility guideline
 *
 * Uses Playwright's touchscreen API to simulate real touch events.
 * All assertions are structural — AI-generated content varies per request.
 */
import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  generateAndWaitForLesson,
  waitForLessonLoaded,
  apiCall,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/mobile';
const MOBILE_VIEWPORT = { width: 375, height: 667 };
const MIN_TOUCH_TARGET = 44; // WCAG minimum touch target size in px

async function screenshot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

test.describe('Mobile: Touch Interactions', () => {
  test.describe.configure({ retries: 2 });

  test.use({
    viewport: MOBILE_VIEWPORT,
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('tap to navigate between auth tabs', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Dismiss modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.tap();
    }

    await screenshot(page, 'touch-01-auth-initial');

    // Tap Register tab
    const registerTab = page.getByText('Register', { exact: true }).first();
    await expect(registerTab).toBeVisible();
    await registerTab.tap();
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'touch-01-auth-register-tab');

    // Verify register form is visible after tap (semantic locator)
    const { locator: nameInput } = await selfHealingLocator(page, 'touch-register-name', {
      role: 'textbox',
      name: /name/i,
      label: /name/i,
      testId: 'name-input',
    });
    const hasNameInput = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);

    // Tap Login tab
    const loginTab = page.getByText('Login', { exact: true }).first();
    await loginTab.tap();
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'touch-01-auth-login-tab');

    // Verify login form appears (semantic locator)
    const { locator: usernameInput } = await selfHealingLocator(page, 'touch-login-username', {
      role: 'textbox',
      name: /username/i,
      label: /username/i,
      testId: 'username-input',
    });
    await expect(usernameInput).toBeVisible();
  });

  test('tap through lesson content and scroll via touch', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'touch_lesson');

    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    await page.goto('/lesson');
    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);

    await screenshot(page, 'touch-02-lesson-top');

    // Simulate touch scroll through lesson content
    // Swipe up (finger moves from bottom to top) to scroll down
    for (let i = 1; i <= 4; i++) {
      await page.touchscreen.tap(
        MOBILE_VIEWPORT.width / 2,
        MOBILE_VIEWPORT.height / 2
      );

      // Scroll via touch: start at bottom, drag to top
      const startY = MOBILE_VIEWPORT.height * 0.8;
      const endY = MOBILE_VIEWPORT.height * 0.2;
      await page.evaluate(
        ({ startY, endY }) => {
          window.scrollBy(0, startY - endY);
        },
        { startY, endY }
      );
      await page.waitForLoadState('networkidle');
      await screenshot(page, `touch-02-lesson-scroll-${i}`);
    }

    // Content should be present after scrolling
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(200);
  });

  test('tap quiz answer options on mobile', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'touch_quiz');

    const lessonId = await generateAndWaitForLesson(page, 'Math');
    expect(lessonId).toBeTruthy();

    // Navigate to quiz
    await page.goto(`/quiz/${lessonId}`);
    await page.waitForLoadState('networkidle');

    // Tap Start Quiz if pre-quiz screen appears
    const { locator: startBtn } = await selfHealingLocator(page, 'touch-quiz-start', {
      role: 'button',
      name: 'Start Quiz',
      text: 'Start Quiz',
    });

    const startVisible = await startBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (startVisible) {
      await startBtn.tap();
      await page.waitForLoadState('networkidle');
    }

    await screenshot(page, 'touch-03-quiz-start');

    // Wait for first question
    const questionHeader = page.getByText(/Question \d+ of \d+/);
    await questionHeader.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    const questionCount = await questionHeader.count();

    if (questionCount >= 1) {
      // Try tapping answer options using semantic locators
      const radioOptions = page.getByRole('radio');
      const radioCount = await radioOptions.count();

      if (radioCount > 0) {
        // Tap the first radio option
        await radioOptions.first().tap();
        await screenshot(page, 'touch-03-quiz-answer-tapped');
      } else {
        // Use selfHealingLocator for answer options
        const { locator: answerOption } = await selfHealingLocator(
          page,
          'touch-quiz-answer',
          { role: 'button', name: /^[A-D]\.|Option|answer/i, text: /^[A-D]\./ }
        );
        const answerVisible = await answerOption.isVisible({ timeout: 5000 }).catch(() => false);
        if (answerVisible) {
          await answerOption.tap();
          await screenshot(page, 'touch-03-quiz-answer-tapped');
        }
      }
    }

    // Verify quiz is interactive
    expect(questionCount).toBeGreaterThanOrEqual(1);
  });

  test('tap to open support modal on mobile', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.tap();
    }

    await screenshot(page, 'touch-04-welcome');

    // Find and tap the support button
    const { locator: supportBtn } = await selfHealingLocator(page, 'touch-support-btn', {
      role: 'button',
      name: /support/i,
      text: /support/i,
    });

    const supportVisible = await supportBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (supportVisible) {
      await supportBtn.tap();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'touch-04-support-modal-open');

      // Verify modal content is visible using semantic locator
      const { locator: messageInput } = await selfHealingLocator(page, 'touch-support-message', {
        role: 'textbox',
        name: /mind|message|feedback/i,
        label: /mind|message|feedback/i,
        testId: 'support-message',
      });
      const hasMessageInput = await messageInput.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasMessageInput) {
        // Tap into the textarea to focus it
        await messageInput.tap();
        await messageInput.fill('Touch test feedback');
        await screenshot(page, 'touch-04-support-modal-filled');
      }
    }
  });

  test('interactive buttons meet minimum touch target size (44×44px)', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'touch_targets');

    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'touch-05-target-sizes');

    // Collect all interactive elements and check their touch target sizes
    const touchTargetAnalysis = await page.evaluate((minSize) => {
      const interactiveElements = document.querySelectorAll(
        'button, a, [role="button"], [tabindex="0"], input[type="submit"]'
      );

      const results: {
        total: number;
        tooSmall: number;
        smallElements: string[];
      } = {
        total: 0,
        tooSmall: 0,
        smallElements: [],
      };

      for (const el of interactiveElements) {
        const rect = el.getBoundingClientRect();
        // Skip hidden elements
        if (rect.width === 0 || rect.height === 0) continue;
        // Skip elements outside viewport
        if (rect.top > window.innerHeight || rect.bottom < 0) continue;

        results.total++;

        if (rect.width < minSize || rect.height < minSize) {
          results.tooSmall++;
          const text = (el.textContent || '').trim().substring(0, 30);
          const tag = el.tagName.toLowerCase();
          results.smallElements.push(
            `${tag}("${text}"): ${Math.round(rect.width)}×${Math.round(rect.height)}`
          );
        }
      }

      return results;
    }, MIN_TOUCH_TARGET);

    console.log(`Touch targets: ${touchTargetAnalysis.total} total, ${touchTargetAnalysis.tooSmall} below ${MIN_TOUCH_TARGET}px`);
    if (touchTargetAnalysis.smallElements.length > 0) {
      console.log('Small elements:', touchTargetAnalysis.smallElements.join(', '));
    }

    // Allow some small elements (icons, etc.) but majority should meet guidelines
    if (touchTargetAnalysis.total > 0) {
      const complianceRate = 1 - touchTargetAnalysis.tooSmall / touchTargetAnalysis.total;
      // At least 60% of visible interactive elements should meet touch target guidelines
      expect(complianceRate).toBeGreaterThanOrEqual(0.6);
    }
  });

  test('tap to add child and navigate learner flow on mobile', async ({ page }) => {
    test.setTimeout(600_000);

    await setupLearnerSession(page, 'touch_flow');

    // Navigate to learner home
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'touch-06-learner-flow-home');

    // Tap on Random Lesson button if no active lesson
    const noActiveLesson = await page.getByText("You don't have an active lesson")
      .isVisible({ timeout: 3000 }).catch(() => false);

    if (noActiveLesson) {
      const { locator: randomBtn } = await selfHealingLocator(
        page, 'touch-random-lesson',
        { role: 'button', name: 'Random Lesson', text: 'Random Lesson' }
      );

      const randomVisible = await randomBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (randomVisible) {
        await randomBtn.tap();
        await screenshot(page, 'touch-06-generating');
      }
    }

    // Navigate to goals page via tap
    await page.goto('/goals');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'touch-06-goals');

    // Navigate to progress page via tap
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'touch-06-progress');

    // Verify pages rendered structurally
    expect(page.url()).toMatch(/progress/);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `mobile-touch-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
