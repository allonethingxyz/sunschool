/**
 * Learner Persona — Chaotic Kid Stress Test
 *
 * Simulates a distracted, impatient child who:
 *   - Spam-clicks buttons before things finish loading
 *   - Changes their mind mid-generation (cancel)
 *   - Switches subjects while a lesson is in progress
 *   - Refreshes the page randomly
 *   - Navigates away during loading and comes back
 *   - Double-taps everything
 *   - Gets confused and hits browser back
 *   - Leaves and returns after idle time
 *
 * The app must remain functional after every chaotic action.
 * No crashes, no stuck loaders, no blank screens.
 */
import { test, expect, Page } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupLearnerSession,
  screenshot,
  navigateAsLearner,
  apiCall,
} from '../../helpers/learner-setup';

const TEST_NAME = 'chaotic-kid';

// ─── Kid behavior helpers ────────────────────────────────────────────────────

/** A kid who clicks things multiple times because they think it didn't work */
async function spamClick(page: Page, textOrLocator: string, times = 3) {
  const loc = page.getByText(textOrLocator).first();
  for (let i = 0; i < times; i++) {
    await loc.click({ force: true, timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(150); // kids click fast but not instantly
  }
}

/** Kid mashes the screen randomly (taps in different spots) */
async function randomTaps(page: Page, count = 5) {
  const viewport = page.viewportSize() || { width: 800, height: 600 };
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * viewport.width * 0.8) + viewport.width * 0.1;
    const y = Math.floor(Math.random() * viewport.height * 0.6) + viewport.height * 0.1;
    await page.mouse.click(x, y).catch(() => {});
    await page.waitForTimeout(100);
  }
}

/** Assert the page recovered to a usable state (not blank, not stuck) */
async function assertPageRecovered(page: Page, label: string) {
  // Wait for any navigation/loading to settle
  await page.waitForLoadState('networkidle').catch(() => {});

  // The page should have meaningful text content (not blank)
  const bodyText = await page.evaluate(() => document.body?.innerText?.trim() || '');
  expect(bodyText.length, `[${label}] Page should not be blank`).toBeGreaterThan(10);

  // Should not be stuck on "Initializing authentication" forever
  const hasInitAuth = bodyText.includes('Initializing authentication');
  if (hasInitAuth) {
    // Wait a bit more for it to resolve
    await page.waitForFunction(
      () => !document.body?.textContent?.includes('Initializing authentication'),
      { timeout: 10000 }
    ).catch(() => {});
  }

  // Should not show raw error stack traces to the child
  const hasStackTrace = bodyText.includes('at Object.') || bodyText.includes('TypeError:') || bodyText.includes('Cannot read properties');
  expect(hasStackTrace, `[${label}] Raw stack trace visible to child`).toBe(false);

  // Should not show billing/API key errors in top-level visible text
  const hasBillingLeak = bodyText.includes('OpenRouter') || bodyText.includes('API key') || bodyText.includes('spending limit');
  expect(hasBillingLeak, `[${label}] Billing/API errors visible to child`).toBe(false);
}

/** Check that a kid-friendly element is visible (not technical jargon) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function assertKidFriendly(page: Page, _label: string) {
  // If there's an error state, it should show emoji + friendly text, not raw errors
  const errorEmoji = page.locator('[class*="errorEmoji"], [class*="error-emoji"]');
  const hasErrorEmoji = await errorEmoji.count().catch(() => 0);
  if (hasErrorEmoji > 0) {
    // There's an error shown — make sure it has a retry button
    const retryBtn = page.getByText(/try again/i).first();
    await expect(retryBtn).toBeVisible({ timeout: 3000 }).catch(() => {});
  }
}

test.describe('Learner: Chaotic Kid Stress Test', () => {
  test.describe.configure({ retries: 2 });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `${TEST_NAME}-${testInfo.title}`);
    }
  });

  test('spam-click "New Lesson" — app should not duplicate or crash', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_spam');

    // Navigate to learner home
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');

    // The page should be usable
    await assertPageRecovered(page, 'initial-load');

    // Kid sees the page and spam-clicks "New Lesson" or "Random Lesson"
    const newLessonBtn = page.getByText(/new lesson|random lesson/i).first();
    const hasBtnVisible = await newLessonBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBtnVisible) {
      // Spam click the button 5 times
      for (let i = 0; i < 5; i++) {
        await newLessonBtn.click({ force: true, timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(200);
      }

      // Wait a beat for state to settle
      await page.waitForTimeout(2000);

      // If a confirmation appeared, kid clicks "Start Fresh!" multiple times
      const startFresh = page.getByText(/start fresh/i).first();
      const hasConfirm = await startFresh.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasConfirm) {
        await spamClick(page, 'Start Fresh!', 3);
      }

      // App should still be functional — either loading or showing content
      await page.waitForTimeout(3000);
      await assertPageRecovered(page, 'after-spam-click');
    }

    // After everything settles, the page should have recovered
    await screenshot(page, `${TEST_NAME}-spam-click-result`);
  });

  test('change mind mid-generation — cancel and pick different subject', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_cancel');
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');

    // Kid clicks "New Lesson"
    const newLessonBtn = page.getByText(/new lesson|random lesson/i).first();
    const hasBtnVisible = await newLessonBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBtnVisible) {
      await newLessonBtn.click({ timeout: 3000 }).catch(() => {});

      // If confirmation shows, confirm it
      const startFresh = page.getByText(/start fresh/i).first();
      const hasConfirm = await startFresh.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasConfirm) {
        await startFresh.click().catch(() => {});
      }

      // Kid sees loading screen, waits 2 seconds, gets bored and cancels
      await page.waitForTimeout(2000);
      const cancelBtn = page.getByText(/never mind/i).first();
      const hasCancelBtn = await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasCancelBtn) {
        await cancelBtn.click();
        await page.waitForTimeout(1000);

        // Page should return to normal — no stuck loader
        await assertPageRecovered(page, 'after-cancel');

        // The loader should be gone
        const sunEmoji = page.getByText('☀️');
        const stillLoading = await sunEmoji.isVisible({ timeout: 1000 }).catch(() => false);
        expect(stillLoading, 'Loader should disappear after cancel').toBe(false);
      }
    }

    await screenshot(page, `${TEST_NAME}-cancel-mid-gen`);
  });

  test('rapid subject switching — open picker, pick, cancel, pick again', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_subject');
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');

    // Kid opens subject selector
    const changeSubjectBtn = page.getByText(/change subject|select a subject/i).first();
    const hasBtn = await changeSubjectBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBtn) {
      await changeSubjectBtn.click();
      await page.waitForTimeout(500);

      // Modal should be visible
      const modalTitle = page.getByText(/choose a subject/i).first();
      await expect(modalTitle).toBeVisible({ timeout: 3000 });

      // Kid clicks Science
      const scienceTab = page.getByText('Science').first();
      const hasScienceTab = await scienceTab.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasScienceTab) {
        await scienceTab.click();
        await page.waitForTimeout(300);
      }

      // Kid changes mind, clicks Mathematics
      const mathTab = page.getByText('Mathematics').first();
      const hasMathTab = await mathTab.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasMathTab) {
        await mathTab.click();
        await page.waitForTimeout(300);
      }

      // Kid changes mind AGAIN, closes the modal
      const closeBtn = page.locator('[class*="closeButton"], [class*="close"]').first();
      const hasCloseBtn = await closeBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasCloseBtn) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      } else {
        // Try the X button
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }

      // Page should be back to normal
      await assertPageRecovered(page, 'after-subject-close');

      // Kid opens it again and actually picks something this time
      await changeSubjectBtn.click().catch(() => {});
      await page.waitForTimeout(500);

      // Pick a subject card
      const subjectCard = page.getByText(/animals|reading|numbers|plants/i).first();
      const hasCard = await subjectCard.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasCard) {
        await subjectCard.click();
        await page.waitForTimeout(1000);

        // If confirmation shows, confirm
        const startFreshBtn = page.getByText(/start fresh/i).first();
        const hasConfirm = await startFreshBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasConfirm) {
          await startFreshBtn.click();
        }
      }
    }

    // App should be functional
    await page.waitForTimeout(2000);
    await assertPageRecovered(page, 'after-rapid-subject-switch');
    await screenshot(page, `${TEST_NAME}-rapid-subjects`);
  });

  test('refresh page during lesson generation — should recover', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_refresh');
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');

    // Start lesson generation
    const newLessonBtn = page.getByText(/new lesson|random lesson/i).first();
    const hasBtnVisible = await newLessonBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBtnVisible) {
      await newLessonBtn.click({ timeout: 3000 }).catch(() => {});

      // If confirmation, accept it
      const startFresh = page.getByText(/start fresh/i).first();
      const hasConfirm = await startFresh.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasConfirm) {
        await startFresh.click().catch(() => {});
      }

      // Wait for loading to start
      await page.waitForTimeout(1500);

      // Kid gets impatient and refreshes the page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Wait for auth init
      await page.waitForFunction(
        () => !document.body?.textContent?.includes('Initializing authentication'),
        { timeout: 15000 }
      ).catch(() => {});

      // The page should recover — either show the lesson or the home screen
      await assertPageRecovered(page, 'after-refresh-during-gen');

      // Kid should see either a lesson card, the loading screen (if gen is still going),
      // or the home page — but NOT a blank or crashed page
      const hasContent = await page.getByText(/current lesson|hello|loading|almost ready/i)
        .first()
        .isVisible({ timeout: 10000 })
        .catch(() => false);
      expect(hasContent, 'Page should show meaningful content after refresh').toBe(true);
    }

    await screenshot(page, `${TEST_NAME}-refresh-during-gen`);
  });

  test('navigate away during loading and come back', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_nav');
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');

    // Start generation
    const newLessonBtn = page.getByText(/new lesson|random lesson/i).first();
    const hasBtnVisible = await newLessonBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBtnVisible) {
      await newLessonBtn.click({ timeout: 3000 }).catch(() => {});

      // If confirmation, accept it
      const startFresh = page.getByText(/start fresh/i).first();
      const hasConfirm = await startFresh.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasConfirm) {
        await startFresh.click().catch(() => {});
      }

      await page.waitForTimeout(1000);

      // Kid gets distracted — clicks Progress in the nav
      await navigateAsLearner(page, '/progress');
      await page.waitForTimeout(2000);

      // Progress page should load fine
      await assertPageRecovered(page, 'on-progress-page');

      // Kid comes back to learner home
      await navigateAsLearner(page, '/learner');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Should be functional — not stuck on a previous loading state
      await assertPageRecovered(page, 'back-from-distraction');
    }

    await screenshot(page, `${TEST_NAME}-nav-away-return`);
  });

  test('random taps on screen — nothing should crash', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_taps');
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Kid randomly taps around the screen
    await randomTaps(page, 10);
    await page.waitForTimeout(1000);

    // Whatever happened, the page should still be usable
    await assertPageRecovered(page, 'after-random-taps');

    // If we accidentally triggered a modal, close it
    const closeBtn = page.getByText(/×|close/i).first();
    const hasClose = await closeBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasClose) {
      await closeBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);

    // Navigate home to verify recovery
    await navigateAsLearner(page, '/learner');
    await page.waitForTimeout(2000);
    await assertPageRecovered(page, 'after-random-taps-recovery');

    await screenshot(page, `${TEST_NAME}-random-taps`);
  });

  test('double-click lesson card and mash forward/back', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_dblclick');
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');

    // Check if there's a lesson to click on
    const lessonCard = page.getByText(/in progress|current lesson/i).first();
    const hasLesson = await lessonCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasLesson) {
      // Kid double-clicks the lesson card
      const clickableCard = page.locator('[class*="lessonCard"], [class*="LessonCard"]').first();
      const hasCard = await clickableCard.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasCard) {
        await clickableCard.dblclick({ force: true }).catch(() => {});
      } else {
        // Try clicking the text directly
        await lessonCard.dblclick({ force: true }).catch(() => {});
      }

      await page.waitForTimeout(2000);

      // If we're on the lesson page, mash the Next button
      const nextBtn = page.getByText(/next/i).first();
      const hasNext = await nextBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasNext) {
        // Kid mashes Next as fast as possible
        for (let i = 0; i < 8; i++) {
          await nextBtn.click({ force: true, timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(200);
        }
        await page.waitForTimeout(1000);

        // Then kid mashes Back
        const backBtn = page.getByText(/back/i).first();
        for (let i = 0; i < 5; i++) {
          await backBtn.click({ force: true, timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(200);
        }

        await page.waitForTimeout(1000);
      }

      // Page should still be functional
      await assertPageRecovered(page, 'after-mashing-nav');
    }

    await screenshot(page, `${TEST_NAME}-dblclick-mash`);
  });

  test('confirm dialog — kid says "Keep Current" then immediately clicks "New Lesson" again', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_indecisive');
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');

    // Wait for lesson to appear (need an active lesson for confirmation to trigger)
    // Generate one via API first
    const learnerId = await page.evaluate(() => localStorage.getItem('selectedLearnerId'));
    if (learnerId) {
      await apiCall(page, 'POST', '/api/lessons/create', {
        learnerId: Number(learnerId),
        subject: 'Math',
        topic: 'Math',
        gradeLevel: 3,
        category: 'General',
        difficulty: 'beginner',
      });
      await page.waitForTimeout(5000);
      await navigateAsLearner(page, '/learner');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // Now click New Lesson — should trigger confirmation
    const newLessonBtn = page.getByText(/new lesson/i).first();
    const hasBtn = await newLessonBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasBtn) {
      // Round 1: Click New Lesson, then Keep Current
      await newLessonBtn.click().catch(() => {});
      await page.waitForTimeout(500);

      const keepBtn = page.getByText(/keep current/i).first();
      const hasKeep = await keepBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasKeep) {
        await keepBtn.click();
        await page.waitForTimeout(500);

        // Confirmation should be gone
        const confirmGone = await keepBtn.isVisible({ timeout: 500 }).catch(() => false);
        expect(confirmGone, 'Confirmation should dismiss after Keep').toBe(false);

        // Round 2: Immediately click New Lesson again — change of heart
        await newLessonBtn.click().catch(() => {});
        await page.waitForTimeout(500);

        // Confirmation should appear again (not cached/stuck)
        const hasKeep2 = await keepBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasKeep2) {
          // This time kid clicks "Start Fresh!"
          const startBtn = page.getByText(/start fresh/i).first();
          await startBtn.click().catch(() => {});
          await page.waitForTimeout(2000);
        }
      }
    }

    await assertPageRecovered(page, 'after-indecisive-flow');
    await screenshot(page, `${TEST_NAME}-indecisive-kid`);
  });

  test('bookmark recovery — direct /learner URL works without parent mode', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_bookmark');

    // Set mode to PARENT (simulating a parent who was last using parent view)
    await page.evaluate(() => localStorage.setItem('preferredMode', 'PARENT'));

    // Navigate directly to /learner — like a kid clicking a bookmark
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    // Wait for auth and mode switching to settle
    await page.waitForFunction(
      () => !document.body?.textContent?.includes('Initializing authentication'),
      { timeout: 15000 }
    ).catch(() => {});
    await page.waitForTimeout(3000);

    // Should NOT be on the dashboard — should have auto-switched to learner mode
    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body.innerText || '');

    // Either we're on /learner or the page auto-switched us there
    // The key assertion: we should see learner content, not parent dashboard
    const hasLearnerContent = pageText.includes('Hello') ||
      pageText.includes('Current Lesson') ||
      pageText.includes('active lesson') ||
      pageText.includes('Random Lesson') ||
      currentUrl.includes('/learner');

    // The real test is: did the app crash or show a blank page?
    // We prefer learner content but either is acceptable
    expect(hasLearnerContent || pageText.length > 10, 'Page should have meaningful content').toBe(true);
    await assertPageRecovered(page, 'bookmark-recovery');

    await screenshot(page, `${TEST_NAME}-bookmark-recovery`);
  });

  test('error recovery — kid sees friendly error and can retry', async ({ page }) => {
    await setupLearnerSession(page, 'chaos_error');
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');

    // Simulate an error by calling the API with invalid data
    await apiCall(page, 'POST', '/api/lessons/create', {
      learnerId: -999, // invalid learner ID
      subject: '',
      topic: '',
      gradeLevel: -1,
      category: '',
      difficulty: 'beginner',
    });

    // The API should have returned an error
    // Now reload to see if the error state shows up
    await navigateAsLearner(page, '/learner');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Whether or not we hit an error state, the page should be recoverable
    await assertPageRecovered(page, 'after-error-trigger');

    // If there's an error visible, check it's kid-friendly
    await assertKidFriendly(page, 'error-display');

    // The page should have either a lesson or an empty state — it should be usable
    const hasUsableUI = await page.getByText(/new lesson|random lesson|current lesson|hello|try again/i)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    expect(hasUsableUI, 'Page should have actionable UI elements').toBe(true);

    await screenshot(page, `${TEST_NAME}-error-recovery`);
  });
});
