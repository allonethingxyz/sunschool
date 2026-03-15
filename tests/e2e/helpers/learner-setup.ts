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
    const data = await res.json();
    return { token: data.token, status: res.status };
  }, { ...user, role: 'PARENT' });

  if (!result.token) {
    throw new Error(`Registration failed: ${JSON.stringify(result)}`);
  }
  return result.token;
}

/** Login via API from browser context */
export async function loginViaAPI(
  page: Page,
  user: Pick<TestUser, 'username' | 'password'>
): Promise<string> {
  const result = await page.evaluate(async (creds) => {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const data = await res.json();
    return { token: data.token, status: res.status };
  }, { username: user.username, password: user.password });

  if (!result.token) {
    throw new Error(`Login failed: ${JSON.stringify(result)}`);
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

/** Navigate within the SPA without full page reload (preserves auth state) */
export async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((url) => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await page.waitForLoadState('networkidle');
}

/** Set auth token and navigate to a path */
export async function setAuthAndNavigate(
  page: Page,
  token: string,
  path: string
): Promise<void> {
  const currentUrl = page.url();
  if (
    currentUrl.includes('sunschool.xyz') ||
    currentUrl.includes('localhost')
  ) {
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await spaNavigate(page, path);
  } else {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
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
 * The app's auth init effect clears AUTH_TOKEN from localStorage on every page load,
 * then reads it back to validate. We use addInitScript to prevent the removal so
 * the token survives page.goto() navigations.
 */
export async function setupLearnerSession(
  page: Page,
  prefix: string = 'learner'
): Promise<SetupResult> {
  const user = generateTestUser(prefix);
  const childName = `Child_${Date.now()}`;

  // Prevent the auth init effect from clearing our token on page loads.
  // The init flow: clear token → read token → validate → authenticate.
  // By blocking removal, the read step finds our token and validates it.
  // We also protect preferredMode and selectedLearnerId from session-expiry cleanup.
  await page.addInitScript(() => {
    const PROTECTED_KEYS = new Set([
      'AUTH_TOKEN', 'AUTH_TOKEN_DATA',
      'preferredMode', 'selectedLearnerId',
    ]);
    const origRemove = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = function (key: string) {
      if (PROTECTED_KEYS.has(key)) {
        return; // preserve during E2E tests
      }
      return origRemove(key);
    };
  });

  // Navigate to site first (needed for evaluate calls)
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Register parent
  const token = await registerParentViaAPI(page, user);

  // Set auth token and metadata in localStorage so the app's init validates it
  await page.evaluate((t) => {
    localStorage.setItem('AUTH_TOKEN', t);
    localStorage.setItem('AUTH_TOKEN_DATA', JSON.stringify({
      token: t,
      timestamp: Date.now(),
      origin: window.location.origin,
      isSunschool: window.location.origin.includes('sunschool.xyz'),
    }));
  }, token);

  // Create child learner
  const learnerId = await createChildViaAPI(page, childName);

  // Store learner ID for app to use
  await page.evaluate(
    (id) => {
      localStorage.setItem('selectedLearnerId', String(id));
      localStorage.setItem('preferredMode', 'LEARNER');
    },
    learnerId
  );

  // Ensure learner profile exists
  await apiCall(page, 'GET', `/api/learner-profile/${learnerId}`);

  // Navigate to app — auth init validates our token and shows parent dashboard.
  // We then click "Start Learning" to enter learner mode (just like a real user).
  // The element is a TouchableOpacity (renders as <div>, not <button>), so use getByText.
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Wait for parent dashboard child card to load, then click "Start Learning"
  const startLearningText = page.getByText(/Start Learning/i);
  try {
    await startLearningText.first().waitFor({ state: 'visible', timeout: 30_000 });
    await startLearningText.first().click();
    // Wait for the app to navigate to learner mode
    await page.waitForURL(/\/learner/, { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState('networkidle');
  } catch {
    // Fallback: navigate directly (mode may have been set via localStorage)
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
  }

  return { token, learnerId, childName };
}

/**
 * Generate a lesson via API and poll until it becomes active.
 * Uses expect.poll() instead of setTimeout loops for proper Playwright waits.
 *
 * Includes retry logic for the initial create call (production may return 503
 * under load) and a re-create fallback if the lesson doesn't become active
 * within the first polling window.
 */
export async function generateAndWaitForLesson(
  page: Page,
  subject: string = 'Science'
): Promise<number> {
  const learnerId = await page.evaluate(() =>
    Number(localStorage.getItem('selectedLearnerId'))
  );

  // Retry the create POST up to 3 times with exponential backoff on 5xx errors
  let createResult: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    createResult = await apiCall(page, 'POST', '/api/lessons/create', {
      learnerId,
      subject,
      gradeLevel: 3,
    });

    const status = createResult?.status ?? 0;
    if (status >= 200 && status < 500) {
      break; // success or 4xx client error — don't retry
    }

    // 5xx or network error — wait and retry
    console.log(`[generateAndWaitForLesson] Create attempt ${attempt} returned status ${status}, retrying...`);
    if (attempt < 3) {
      await page.waitForTimeout(attempt * 5_000); // 5s, 10s backoff
    }
  }

  // Poll for active lesson using expect.poll (no setTimeout)
  let activeLessonId: number | null = null;
  let pollAttempts = 0;
  const MAX_POLL_RETRIES = 2; // re-create lesson up to 2 more times if poll fails

  for (let round = 0; round <= MAX_POLL_RETRIES; round++) {
    if (round > 0) {
      // Re-create lesson if previous poll timed out
      console.log(`[generateAndWaitForLesson] Re-creating lesson (round ${round + 1})...`);
      await page.waitForTimeout(10_000); // brief cooldown
      for (let attempt = 1; attempt <= 2; attempt++) {
        createResult = await apiCall(page, 'POST', '/api/lessons/create', {
          learnerId,
          subject,
          gradeLevel: 3,
        });
        if ((createResult?.status ?? 0) < 500) break;
        await page.waitForTimeout(attempt * 5_000);
      }
    }

    try {
      await expect
        .poll(
          async () => {
            pollAttempts++;
            const result = await apiCall(page, 'GET', '/api/lessons/active?' +
              `learnerId=${learnerId}`);
            if (result.data?.id) {
              activeLessonId = result.data.id;
              return true;
            }
            return false;
          },
          {
            message: 'Waiting for lesson to become active',
            timeout: 180_000, // 3 min per round
            intervals: [5_000],
          }
        )
        .toBe(true);

      if (activeLessonId) break;
    } catch {
      console.log(`[generateAndWaitForLesson] Poll round ${round + 1} timed out after ${pollAttempts} checks`);
      if (round === MAX_POLL_RETRIES) {
        throw new Error(`Lesson did not become active after ${MAX_POLL_RETRIES + 1} creation attempts (${pollAttempts} total polls)`);
      }
    }
  }

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
 * Poll for a condition on the page using Playwright waits (not setTimeout).
 * Reloads the page between polls and waits for networkidle.
 */
export async function pollForVisibleText(
  page: Page,
  textPattern: RegExp | string,
  options: { timeout?: number; reloadBetweenPolls?: boolean } = {}
): Promise<boolean> {
  const { timeout = 300_000, reloadBetweenPolls = true } = options;
  let found = false;

  await expect
    .poll(
      async () => {
        const locator =
          typeof textPattern === 'string'
            ? page.getByText(textPattern)
            : page.getByText(textPattern);
        const visible = await locator
          .first()
          .isVisible({ timeout: 2_000 })
          .catch(() => false);
        if (visible) {
          found = true;
          return true;
        }
        if (reloadBetweenPolls) {
          await page.reload();
          await page.waitForLoadState('networkidle');
        }
        return false;
      },
      { timeout, intervals: [5_000] }
    )
    .toBe(true)
    .catch(() => {});

  return found;
}

/**
 * Check whether the server can currently generate lessons.
 * Makes a lightweight probe POST and checks for 503 / generation failure.
 * Returns true if lesson creation is likely to succeed, false if 503 blocked.
 */
export async function canGenerateLessons(page: Page): Promise<boolean> {
  const learnerId = await page.evaluate(() =>
    Number(localStorage.getItem('selectedLearnerId'))
  );

  const result = await apiCall(page, 'POST', '/api/lessons/create', {
    learnerId,
    subject: 'Math',
    gradeLevel: 3,
  });

  // 503 = server unable to generate, 200/201 = success, 4xx = client error (but server is reachable)
  if (result.status === 503 || result.status === 0) {
    return false;
  }
  return true;
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
  const learnerId = await page.evaluate(() =>
    Number(localStorage.getItem('selectedLearnerId'))
  );
  const result = await apiCall(page, 'POST', '/api/rewards', {
    learnerId,
    title,
    cost,
    emoji: '🎮',
    color: '#4CAF50',
  });

  return result.data?.id || null;
}
