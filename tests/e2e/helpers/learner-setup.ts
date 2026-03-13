import { Page } from '@playwright/test';

/**
 * Shared setup utilities for learner E2E tests.
 *
 * Handles registration, login, child creation, and learner mode
 * so each spec file can focus on its own journeys.
 */

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner-specs';

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

  // Navigate to learner home
  await spaNavigate(page, '/learner');

  return { token, learnerId, childName };
}
