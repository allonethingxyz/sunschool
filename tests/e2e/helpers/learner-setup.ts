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

  // Register parent
  const token = await registerParentViaAPI(page, user);
  await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);

  // Create child learner
  const learnerId = await createChildViaAPI(page, childName);

  // Store learner ID for app to use
  await page.evaluate(
    (id) => localStorage.setItem('selectedLearnerId', String(id)),
    learnerId
  );

  // Ensure learner profile exists
  await apiCall(page, 'GET', `/api/learner-profile/${learnerId}`);

  // Navigate to learner home
  await spaNavigate(page, '/learner');

  return { token, learnerId, childName };
}

/**
 * Generate a lesson via API and poll until it becomes active.
 * Uses expect.poll() instead of setTimeout loops for proper Playwright waits.
 */
export async function generateAndWaitForLesson(
  page: Page,
  subject: string = 'Science'
): Promise<number> {
  // Request lesson creation
  const createResult = await apiCall(page, 'POST', '/api/lessons/create', {
    learnerId: await page.evaluate(() =>
      Number(localStorage.getItem('selectedLearnerId'))
    ),
    subject,
    gradeLevel: 3,
  });

  if (createResult.data?.id) {
    // If creation returns the ID directly, still wait for it to be active
  }

  // Poll for active lesson using expect.poll (no setTimeout)
  let activeLessonId: number | null = null;

  await expect
    .poll(
      async () => {
        const result = await apiCall(page, 'GET', '/api/lessons/active?' +
          `learnerId=${await page.evaluate(() => localStorage.getItem('selectedLearnerId'))}`);
        if (result.data?.id) {
          activeLessonId = result.data.id;
          return true;
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
