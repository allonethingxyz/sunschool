import { Page, Locator, expect } from '@playwright/test';

/**
 * Self-healing locator: tries multiple locator strategies in order of preference.
 * Falls back through semantic locators before resorting to test IDs.
 *
 * Usage:
 *   const btn = selfHealingLocator(page, [
 *     () => page.getByRole('button', { name: 'Add Child' }),
 *     () => page.getByText('Add Child'),
 *     () => page.getByTestId('add-child-btn'),
 *   ]);
 */
export async function selfHealingLocator(
  page: Page,
  strategies: Array<() => Locator>,
  options: { timeout?: number } = {},
): Promise<Locator> {
  const timeout = options.timeout ?? 10000;

  for (const strategy of strategies) {
    try {
      const locator = strategy();
      await locator.waitFor({ state: 'visible', timeout });
      return locator;
    } catch {
      // Strategy failed, try next
    }
  }

  // If none worked, return the first strategy's locator to produce a meaningful error
  return strategies[0]();
}

/**
 * Captures failure artifacts (screenshot + console logs) for debugging.
 * Use in afterEach hooks.
 */
export async function captureFailureArtifacts(
  page: Page,
  testInfo: { title: string; status?: string },
  screenshotDir = 'tests/e2e/screenshots/failures',
) {
  if (testInfo.status === 'passed') return;

  const safeName = testInfo.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 80);
  const timestamp = Date.now();

  try {
    await page.screenshot({
      path: `${screenshotDir}/${safeName}_${timestamp}.png`,
      fullPage: true,
    });
  } catch {
    // Page may already be closed
  }
}

/**
 * Dismiss common modals/overlays that can block interactions.
 */
export async function dismissModals(page: Page) {
  const dismissButtons = [
    () => page.getByText('Got it, thanks!'),
    () => page.getByText('GOT IT!'),
    () => page.getByRole('button', { name: /dismiss/i }),
    () => page.getByRole('button', { name: /close/i }),
  ];

  for (const getBtn of dismissButtons) {
    try {
      const btn = getBtn();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    } catch {
      // Not visible, skip
    }
  }
}

/**
 * Register a parent account via API and return auth token.
 */
export async function registerParentViaAPI(
  page: Page,
  userData: { username: string; email: string; password: string; name: string },
): Promise<string> {
  const result = await page.evaluate(async (u) => {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...u, role: 'PARENT' }),
    });
    const data = await res.json();
    return { token: data.token, status: res.status };
  }, userData);

  if (!result.token) throw new Error(`Registration failed: status=${result.status}`);
  return result.token;
}

/**
 * Login a parent via API and return auth token.
 */
export async function loginViaAPI(
  page: Page,
  credentials: { username: string; password: string },
): Promise<string> {
  const result = await page.evaluate(async (creds) => {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    const data = await res.json();
    return { token: data.token, status: res.status };
  }, credentials);

  if (!result.token) throw new Error(`Login failed: status=${result.status}`);
  return result.token;
}

/**
 * Make an authenticated API call from the browser context.
 */
export async function apiCall(
  page: Page,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ method, url, body }) => {
      const token = localStorage.getItem('AUTH_TOKEN') || '';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        clearTimeout(timeoutId);
        const text = await res.text();
        try {
          return { status: res.status, data: JSON.parse(text) };
        } catch {
          return { status: res.status, data: text };
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const message = err instanceof Error ? err.message : String(err);
        return { status: 0, data: `fetch error: ${message}` };
      }
    },
    { method, url, body },
  );
}

/**
 * Set auth token and navigate within the SPA.
 */
export async function authenticateAndNavigate(
  page: Page,
  token: string,
  path: string,
) {
  await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
  const currentUrl = page.url();
  if (currentUrl.includes('sunschool') || currentUrl.includes('localhost')) {
    // SPA navigation
    await page.evaluate((url) => {
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await page.waitForLoadState('networkidle');
  } else {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
}
