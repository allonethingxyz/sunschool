import { Page, expect } from '@playwright/test';

/**
 * Shared setup utilities for learner E2E tests.
 *
 * Handles registration, login, child creation, learner mode,
 * lesson generation, and quiz completion so each spec file
 * can focus on its own journeys.
 */

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';

export interface TestUser {
  username: string;
  email: string;
  password: string;
  name: string;
}

export interface SetupResult {
  token: string;
  learnerId: number;
  childName: string;
}

/** Generate unique test user credentials */
export function generateTestUser(prefix: string): TestUser {
  const ts = Date.now();
  return {
    username: `${prefix}_${ts}`,
    email: `${prefix}_${ts}@test.com`,
    password: 'TestPassword123!',
    name: `Test ${prefix} User`,
  };
}

/** Take a labelled screenshot */
export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: false,
  });
}

/** Register a parent via API from browser context */
export async function registerParentViaAPI(
  page: Page,
  user: TestUser
): Promise<string> {
  const result = await page.evaluate(async (userData) => {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return { token: data.token, status: res.status };
    } catch {
      return { token: null, status: res.status, body: text.substring(0, 200) };
    }
  }, { ...user, role: 'PARENT' });

  if (!result.token) {
    throw new Error(`Registration failed: ${JSON.stringify(result)}`);
  }
  return result.token;
}

/** Make an authenticated API call from browser context */
export async function apiCall(
  page: Page,
  method: string,
  url: string,
  body?: any
): Promise<any> {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = localStorage.getItem('AUTH_TOKEN') || '';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const text = await res.text();
        try {
          return { status: res.status, data: JSON.parse(text) };
        } catch {
          return { status: res.status, data: text };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        return { status: 0, error: err.message };
      }
    },
    { method, url, body }
  );
}

/** Create a child learner via API and return the learner ID */
export async function createChildViaAPI(
  page: Page,
  childName: string,
  grade: number = 3
): Promise<number> {
  const result = await apiCall(page, 'POST', '/api/learners', {
    name: childName,
    grade,
  });

  if (!result.data?.id) {
    throw new Error(`Failed to create child: ${JSON.stringify(result)}`);
  }
  return result.data.id;
}

/**
 * Full setup: register parent, create child, set auth, navigate to learner home.
 * Returns token, learnerId, and childName for use in tests.
 *
 * WORKAROUND: The app's auth init (use-auth.tsx) destructively clears
 * AUTH_TOKEN from AsyncStorage before reading it back. We install an
 * init script that prevents removeItem('AUTH_TOKEN') from working,
 * then reload so the auth system reads and validates the token.
 */
export async function setupLearnerSession(
  page: Page,
  prefix: string = 'learner'
): Promise<SetupResult> {
  const user = generateTestUser(prefix);
  const childName = `Child_${Date.now()}`;

  // Navigate to site first (needed for evaluate calls)
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Wait for auth initialization to complete
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});

  // Register parent via direct fetch (bypasses React auth system)
  const token = await registerParentViaAPI(page, user);

  // Set token in localStorage
  await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);

  // Create child learner via API
  const learnerId = await createChildViaAPI(page, childName);

  // Store learner ID for app to use
  await page.evaluate(
    (id) => localStorage.setItem('selectedLearnerId', String(id)),
    learnerId
  );

  // Ensure learner profile exists
  await apiCall(page, 'GET', `/api/learner-profile/${learnerId}`);

  // Set learner mode so LearnerRoute doesn't redirect to /dashboard
  await page.evaluate(() => localStorage.setItem('preferredMode', 'LEARNER'));

  // Reload so auth init reads the token and validates it against /api/user.
  // The fixed use-auth.tsx reads the token BEFORE clearing cached state.
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Wait for auth to complete — the user should now be authenticated
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});

  // Navigate to learner home with full page load (spaNavigate + wouter is unreliable)
  await page.evaluate(() => localStorage.setItem('preferredMode', 'LEARNER'));
  await page.goto('/learner');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});

  return { token, learnerId, childName };
}

/**
 * Generate a lesson via API and poll until it becomes active.
 * Retries the create call on transient failures (5xx, network errors).
 * Uses expect.poll() instead of setTimeout loops for proper Playwright waits.
 */
export async function generateAndWaitForLesson(
  page: Page,
  subject: string = 'Science'
): Promise<number> {
  const learnerId = await page.evaluate(() =>
    Number(localStorage.getItem('selectedLearnerId'))
  );

  // Retry lesson creation on transient failures (503, 500, network errors)
  const MAX_CREATE_RETRIES = 5;
  const BASE_DELAY_MS = 3000;
  let createSuccess = false;

  for (let attempt = 1; attempt <= MAX_CREATE_RETRIES; attempt++) {
    const createResult = await apiCall(page, 'POST', '/api/lessons/create', {
      learnerId,
      subject,
      gradeLevel: 3,
    });

    if (createResult.status >= 200 && createResult.status < 400) {
      createSuccess = true;
      break;
    }

    // Fast-fail on billing/auth errors — retries won't help
    const errorMsg = JSON.stringify(createResult.data || '');
    const isFatal = createResult.status === 402
      || /Insufficient credits/i.test(errorMsg)
      || createResult.status === 401
      || createResult.status === 403;
    if (isFatal) {
      throw new Error(
        `[E2E] Lesson create fatal error (status ${createResult.status}): ${errorMsg}`
      );
    }

    // Check if there's already an active lesson (maybe from a previous attempt)
    const activeCheck = await apiCall(page, 'GET',
      `/api/lessons/active?learnerId=${learnerId}`);
    if (activeCheck.data?.id) {
      createSuccess = true;
      break;
    }

    if (attempt < MAX_CREATE_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[E2E] Lesson create attempt ${attempt}/${MAX_CREATE_RETRIES} failed ` +
        `(status: ${createResult.status}). Retrying in ${delay}ms...`
      );
      await new Promise(r => setTimeout(r, delay));
    } else {
      console.error(
        `[E2E] Lesson create failed after ${MAX_CREATE_RETRIES} attempts. ` +
        `Last status: ${createResult.status}, data: ${errorMsg}`
      );
    }
  }

  // Poll for active lesson using expect.poll (no setTimeout)
  let activeLessonId: number | null = null;

  await expect
    .poll(
      async () => {
        const result = await apiCall(page, 'GET',
          `/api/lessons/active?learnerId=${learnerId}`);
        if (result.data?.id) {
          activeLessonId = result.data.id;
          return true;
        }
        // If create never succeeded and no lesson is active, re-attempt create
        if (!createSuccess) {
          const retryCreate = await apiCall(page, 'POST', '/api/lessons/create', {
            learnerId,
            subject,
            gradeLevel: 3,
          });
          if (retryCreate.status >= 200 && retryCreate.status < 400) {
            createSuccess = true;
          }
        }
        return false;
      },
      {
        message: 'Waiting for lesson to become active',
        timeout: 300_000,
        intervals: [5_000],
      }
    )
    .toBe(true);

  if (!activeLessonId) {
    throw new Error('Lesson did not become active');
  }

  return activeLessonId;
}

/**
 * Complete a lesson by submitting quiz answers via API.
 * Generates a lesson, waits for it, then submits answers.
 */
export async function completeOneLesson(
  page: Page,
  subject: string = 'Science'
): Promise<boolean> {
  let lessonId: number;
  try {
    lessonId = await generateAndWaitForLesson(page, subject);
  } catch {
    return false;
  }

  // Get lesson to extract questions
  const lessonResult = await apiCall(page, 'GET', `/api/lessons/${lessonId}`);
  if (lessonResult.status !== 200 || !lessonResult.data?.spec?.questions) {
    return false;
  }

  const questions = lessonResult.data.spec.questions;
  const answers = questions.map((q: any, i: number) => ({
    questionIndex: i,
    selectedIndex: q.correctIndex ?? 0,
  }));

  const learnerId = await page.evaluate(() =>
    Number(localStorage.getItem('selectedLearnerId'))
  );

  const submitResult = await apiCall(
    page,
    'POST',
    `/api/lessons/${lessonId}/answer`,
    { answers, learnerId }
  );

  return submitResult.status === 200;
}

/**
 * Enter learner context from the parent dashboard by clicking
 * "START LEARNING AS {childName}" or falling back to navigateAsLearner.
 */
export async function enterLearnerContext(page: Page, childName?: string): Promise<void> {
  // Try to click the "START LEARNING AS" button on parent dashboard
  const buttonText = childName
    ? new RegExp(`start learning as.*${childName}`, 'i')
    : /start learning as/i;
  const startBtn = page.getByText(buttonText).first();
  const visible = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (visible) {
    await startBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => {
      return !document.body.textContent?.includes('Initializing authentication');
    }, { timeout: 15000 }).catch(() => {});
    return;
  }
  // Fallback: navigate directly to learner home
  await navigateAsLearner(page, '/learner');
}

/**
 * Navigate to a learner route with learner mode enabled.
 * Sets preferredMode in localStorage, then does a full page.goto()
 * so that ModeContext initializes with LEARNER mode from the start.
 */
export async function navigateAsLearner(page: Page, path: string): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('preferredMode', 'LEARNER');
  });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});
}

/**
 * Navigate to a parent route with parent mode enabled.
 * Sets preferredMode in localStorage, then does a full page.goto()
 * so that ModeContext initializes with PARENT mode from the start.
 */
export async function navigateAsParent(page: Page, path: string): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('preferredMode', 'PARENT');
  });
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});
}

/**
 * Full setup for parent persona tests: register, create child, set auth,
 * navigate to parent dashboard. Same as setupLearnerSession but stays
 * in PARENT mode.
 */
export async function setupParentSession(
  page: Page,
  prefix: string = 'parent'
): Promise<SetupResult> {
  const user = generateTestUser(prefix);
  const childName = `Child_${Date.now()}`;

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});

  const token = await registerParentViaAPI(page, user);

  await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);

  const learnerId = await createChildViaAPI(page, childName);

  await page.evaluate(
    (id) => localStorage.setItem('selectedLearnerId', String(id)),
    learnerId
  );

  await page.evaluate(() => localStorage.setItem('preferredMode', 'PARENT'));

  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});

  await navigateAsParent(page, '/dashboard');

  return { token, learnerId, childName };
}

/**
 * Wait for lesson loading screen to finish.
 * Polls for the loading indicator to disappear using proper Playwright waits.
 */
export async function waitForLessonLoaded(page: Page): Promise<void> {
  const loadingText = page.getByText('Loading your personalized lesson...');
  await loadingText
    .waitFor({ state: 'hidden', timeout: 120_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle');
}

/**
 * Create a reward goal via API (as parent).
 * Returns the goal ID if successful, null otherwise.
 */
export async function createRewardGoal(
  page: Page,
  title: string,
  cost: number
): Promise<number | null> {
  const result = await apiCall(page, 'POST', '/api/rewards', {
    title,
    tokenCost: cost,
    imageEmoji: '🎮',
    color: '#4CAF50',
  });

  return result.data?.id || null;
}
