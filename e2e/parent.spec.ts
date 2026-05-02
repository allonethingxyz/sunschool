/**
 * Playwright browser tests — Parent persona
 *
 * Simulates a parent using sunschool.xyz:
 *   - Login page rendering
 *   - Authenticated chat flow
 *   - Parent dashboard & guidelines
 *   - Prompt audit log
 *   - Child progress view
 *   - Add-learner flow
 *   - Sign-out
 */

import { test, expect } from '@playwright/test';
import { loginAs, parentHeaders, type Persona } from './helpers/auth';

// ---------------------------------------------------------------------------
// Test persona
// ---------------------------------------------------------------------------
const PARENT: Persona = {
  uid: 'e2e-parent-001',
  email: 'parent@test.sunschool.xyz',
  name: 'Maria Parent',
};

const DEV_HEADERS = parentHeaders(PARENT.uid);

// ---------------------------------------------------------------------------
// Shared setup: provision the user so the backend knows about them
// ---------------------------------------------------------------------------

/**
 * Ensure the test parent user is provisioned in the backend by hitting
 * the conversations endpoint (which triggers auto-provisioning).
 */
async function provisionUser(request: import('@playwright/test').APIRequestContext) {
  await request.get(`/api/conversations?learner_id=${PARENT.uid}`, {
    headers: DEV_HEADERS,
  });
}

/**
 * Ensure a learner profile exists for the test parent so the app doesn't
 * redirect to the learner-setup page. Returns the learner_id.
 */
async function ensureLearner(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const listRes = await request.get('/api/learners', { headers: DEV_HEADERS });
  const listData = await listRes.json();
  const learners = listData.learners || [];

  if (learners.length > 0) {
    return learners[0].learner_id;
  }

  // Create a default learner so setup flow is bypassed
  const createRes = await request.post('/api/learners', {
    headers: DEV_HEADERS,
    data: { name: 'E2E Test Child', grade_level: 5 },
  });
  const created = await createRes.json();
  return created.learner_id;
}

// ---------------------------------------------------------------------------
// P01: Login page shows Google Sign-In button
// ---------------------------------------------------------------------------
test('P01: Login page shows Google Sign-In button', async ({ page }) => {
  await page.goto('/');

  const heading = page.locator('h1');
  await expect(heading).toContainText('Sunschool');

  const signInBtn = page.locator('#g-signin-btn');
  await expect(signInBtn).toBeAttached();
});

// ---------------------------------------------------------------------------
// P02: After login, chat page loads
// ---------------------------------------------------------------------------
test('P02: After login, chat page loads', async ({ page, request }) => {
  await provisionUser(request);
  const learnerId = await ensureLearner(request);

  await loginAs(page, PARENT);

  // Inject selected_learner_id so the app doesn't redirect to setup
  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  await page.goto('/#/chat');
  await page.waitForLoadState('networkidle');

  // Navbar should be visible with Chat and Parent links
  const navbar = page.locator('nav.navbar');
  await expect(navbar).toBeVisible();
  await expect(navbar.locator('a', { hasText: 'Chat' })).toBeVisible();
  await expect(navbar.locator('a', { hasText: 'Parent' })).toBeVisible();

  // Chat input should be visible
  const chatInput = page.locator('#chat-input');
  await expect(chatInput).toBeVisible();
  await expect(chatInput).toHaveAttribute('placeholder', 'Type your message...');

  // Send button should be visible
  const sendBtn = page.locator('button', { hasText: 'Send' });
  await expect(sendBtn).toBeVisible();
});

// ---------------------------------------------------------------------------
// P03: Parent can send a message and get response
// ---------------------------------------------------------------------------
test('P03: Parent can send a message and get response @llm', async ({ page, request }) => {
  await provisionUser(request);
  const learnerId = await ensureLearner(request);

  await loginAs(page, PARENT);
  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  await page.goto('/#/chat');
  await page.waitForLoadState('networkidle');

  // Fill the chat input
  const chatInput = page.locator('#chat-input');
  await chatInput.fill('Teach my child about the solar system');

  // Click Send and wait for the API response
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/conversations/') && res.url().includes('/message') && res.request().method() === 'POST',
    { timeout: 30_000 },
  );

  await page.locator('button', { hasText: 'Send' }).click();
  await responsePromise;

  // Wait for the assistant message to appear
  const assistantMsg = page.locator('.message.assistant').last();
  await expect(assistantMsg).toBeVisible({ timeout: 15_000 });

  // Should NOT be an error message
  await expect(assistantMsg).not.toContainText('Failed to send');

  // Content should be non-empty educational text
  const content = await assistantMsg.textContent();
  expect(content!.trim().length).toBeGreaterThan(10);
});

// ---------------------------------------------------------------------------
// P04: Parent dashboard loads
// ---------------------------------------------------------------------------
test('P04: Parent dashboard loads', async ({ page, request }) => {
  await provisionUser(request);
  const learnerId = await ensureLearner(request);

  await loginAs(page, PARENT);
  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  await page.goto('/#/parent');
  await page.waitForLoadState('networkidle');

  // Heading
  await expect(page.locator('h2', { hasText: 'Parent Dashboard' })).toBeVisible();

  // Stat cards: points, conversations, concepts
  const cards = page.locator('.card');
  await expect(cards.filter({ hasText: 'Total Points' })).toBeVisible();
  await expect(cards.filter({ hasText: 'Conversations' })).toBeVisible();
  await expect(cards.filter({ hasText: 'Concepts Explored' })).toBeVisible();

  // Content Guidelines section
  await expect(page.locator('h3', { hasText: 'Content Guidelines' })).toBeVisible();

  // Prompt Audit Log link
  await expect(page.locator('a', { hasText: 'Prompt Audit Log' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// P05: Parent can set guidelines
// ---------------------------------------------------------------------------
test('P05: Parent can set guidelines', async ({ page, request }) => {
  await provisionUser(request);
  const learnerId = await ensureLearner(request);

  await loginAs(page, PARENT);
  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  await page.goto('/#/parent');
  await page.waitForLoadState('networkidle');

  const guidelinesText = 'Focus on science. No discussion of war.';

  // Fill guidelines textarea
  const textarea = page.locator('#guidelines-text');
  await expect(textarea).toBeVisible();
  await textarea.fill(guidelinesText);

  // Click Save Guidelines
  await page.locator('button', { hasText: 'Save Guidelines' }).click();

  // Wait for the save to complete (button text reverts from "Saving...")
  await expect(page.locator('button', { hasText: 'Save Guidelines' })).toBeEnabled();

  // Reload and verify persistence
  await page.goto('/#/parent');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#guidelines-text')).toContainText('Focus on science');
});

// ---------------------------------------------------------------------------
// P06: Parent can view prompt audit
// ---------------------------------------------------------------------------
test('P06: Parent can view prompt audit', async ({ page, request }) => {
  await provisionUser(request);
  const learnerId = await ensureLearner(request);

  await loginAs(page, PARENT);
  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  await page.goto('/#/parent/audit');
  await page.waitForLoadState('networkidle');

  // Heading
  await expect(page.locator('h2', { hasText: 'Prompt Audit Log' })).toBeVisible();

  // Should show audit table or empty state
  const table = page.locator('.audit-table');
  const emptyState = page.locator('.empty-state');
  const hasTable = await table.isVisible().catch(() => false);
  const hasEmpty = await emptyState.isVisible().catch(() => false);
  expect(hasTable || hasEmpty).toBeTruthy();
});

// ---------------------------------------------------------------------------
// P07: Parent can view child progress
// ---------------------------------------------------------------------------
test('P07: Parent can view child progress', async ({ page, request }) => {
  await provisionUser(request);
  const learnerId = await ensureLearner(request);

  await loginAs(page, PARENT);
  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  await page.goto(`/#/parent/progress/${learnerId}`);
  await page.waitForLoadState('networkidle');

  // Heading
  await expect(page.locator('h2', { hasText: 'Learning Progress' })).toBeVisible();

  // Points display
  await expect(page.locator('.stat-value').first()).toBeVisible();

  // Concept mastery section (heading present, content may be empty)
  await expect(page.locator('h3', { hasText: 'Concept Mastery' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// P08: Parent can add a child (if UI exists)
// ---------------------------------------------------------------------------
test('P08: Parent can add a child (if UI exists)', async ({ page, request }) => {
  await provisionUser(request);
  const learnerId = await ensureLearner(request);

  await loginAs(page, PARENT);
  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  // Navigate to the parent dashboard and look for add-child UI
  await page.goto('/#/parent');
  await page.waitForLoadState('networkidle');

  // The app has an "Add" button in the navbar learner selector
  const addBtn = page.locator('button', { hasText: '+ Add' });
  const addLink = page.locator('a[href="#/add-learner"]');

  const hasAddBtn = await addBtn.isVisible().catch(() => false);
  const hasAddLink = await addLink.isVisible().catch(() => false);

  if (!hasAddBtn && !hasAddLink) {
    test.skip(true, 'Add Child UI not implemented');
    return;
  }

  // Navigate to the add-learner page
  await page.goto('/#/add-learner');
  await page.waitForLoadState('networkidle');

  // Fill the form
  await page.locator('#add-learner-name').fill('Test Kid');
  await page.locator('#add-learner-grade').selectOption('5');

  // Intercept the POST /api/learners request
  const createPromise = page.waitForResponse(
    (res) => res.url().includes('/api/learners') && res.request().method() === 'POST',
    { timeout: 10_000 },
  );

  await page.locator('button', { hasText: 'Add Learner' }).click();

  const response = await createPromise;
  expect([200, 201]).toContain(response.status());
});

// ---------------------------------------------------------------------------
// P09: Sign out works
// ---------------------------------------------------------------------------
test('P09: Sign out works', async ({ page, request }) => {
  await provisionUser(request);
  const learnerId = await ensureLearner(request);

  await loginAs(page, PARENT);
  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  await page.goto('/#/chat');
  await page.waitForLoadState('networkidle');

  // Click Sign out
  await page.locator('button', { hasText: 'Sign out' }).click();

  // Should be redirected to login page
  await expect(page).toHaveURL(/\/#\/?$/);

  // sessionStorage id_token should be null
  const token = await page.evaluate(() => sessionStorage.getItem('id_token'));
  expect(token).toBeNull();
});
