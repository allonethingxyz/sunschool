/**
 * Dev-bypass authentication helpers for Playwright E2E tests.
 *
 * The Sunschool backend accepts X-Dev-User-* headers when
 * SUNSCHOOL_ENVIRONMENT=development (the default locally).
 *
 * For browser-level auth the frontend reads from sessionStorage
 * and parses the JWT payload without verifying the signature,
 * so we inject a fake JWT that parseJwt() can decode.
 */

import type { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// API-level auth headers (for APIRequestContext calls)
// ---------------------------------------------------------------------------

export function parentHeaders(uid = 'parent-001') {
  return {
    'X-Dev-User-Id': uid,
    'X-Dev-User-Email': `${uid}@test.sunschool.xyz`,
    'X-Dev-User-Name': 'Test Parent',
    'X-Dev-User-Role': 'parent',
    'Content-Type': 'application/json',
  };
}

export function learnerHeaders(uid = 'learner-001') {
  return {
    'X-Dev-User-Id': uid,
    'X-Dev-User-Email': `${uid}@test.sunschool.xyz`,
    'X-Dev-User-Name': 'Test Learner',
    'X-Dev-User-Role': 'parent', // same role — learner is a child of parent
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Browser-level auth (Playwright Page context)
// ---------------------------------------------------------------------------

export interface Persona {
  uid: string;
  email: string;
  name: string;
}

export const DEFAULT_PARENT: Persona = {
  uid: 'parent-001',
  email: 'parent-001@test.sunschool.xyz',
  name: 'Test Parent',
};

export const DEFAULT_LEARNER: Persona = {
  uid: 'learner-001',
  email: 'learner-001@test.sunschool.xyz',
  name: 'Test Learner',
};

/**
 * Log into Sunschool as the given persona by injecting a fake JWT into
 * sessionStorage and setting the internal _currentUser variable.
 *
 * After calling this the page is navigated to `targetRoute` (default "/")
 * with an authenticated session ready to go.
 */
export async function loginAs(
  page: Page,
  persona: Persona = DEFAULT_PARENT,
  targetRoute = '/',
) {
  // Navigate to the app so we have access to the page's sessionStorage
  await page.goto('/');

  // Inject fake JWT and set internal auth state
  await page.evaluate((p) => {
    function b64url(obj: unknown): string {
      return btoa(JSON.stringify(obj))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }

    const header = b64url({ alg: 'none' });
    const payload = b64url({
      sub: p.uid,
      email: p.email,
      name: p.name,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const token = `${header}.${payload}.test`;

    sessionStorage.setItem('id_token', token);

    // Set internal state used by the frontend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)._currentUser = {
      sub: p.uid,
      email: p.email,
      name: p.name,
      exp: 9999999999,
    };
  }, persona);

  // Navigate to the target route with the auth state in place
  if (targetRoute !== '/') {
    await page.goto(targetRoute);
  } else {
    await page.reload();
  }
}
