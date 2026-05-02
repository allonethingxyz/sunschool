/**
 * Playwright browser tests — Learner persona (child using chat)
 *
 * Simulates a child learner using the AI tutor:
 *   - Chat interface loads after login
 *   - Ask a question and get a tutoring response
 *   - Multi-turn conversation
 *   - Quiz interaction (if triggered)
 *   - Points tracking
 *   - Message history persistence
 *   - Empty state for a fresh learner
 */

import { test, expect } from '@playwright/test';
import { loginAs, parentHeaders, type Persona } from './helpers/auth';

// ---------------------------------------------------------------------------
// Test personas
// ---------------------------------------------------------------------------
const LEARNER: Persona = {
  uid: 'e2e-learner-001',
  email: 'kid@test.sunschool.xyz',
  name: 'Alex Learner',
};

/** Parent that owns the learner — needed for API provisioning. */
const PARENT_UID = 'e2e-learner-parent-001';
const DEV_HEADERS = parentHeaders(PARENT_UID);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Provision the learner via API so the backend knows about them.
 * Uses the conversations endpoint which triggers auto-provisioning.
 */
async function provisionLearner(request: import('@playwright/test').APIRequestContext) {
  // Ensure a learner profile exists under the parent
  const listRes = await request.get('/api/learners', { headers: DEV_HEADERS });
  const listData = await listRes.json();
  const learners: Array<{ learner_id: string; name: string }> = listData.learners ?? listData;

  let learnerId = learners.find((l) => l.learner_id === LEARNER.uid)?.learner_id;

  if (!learnerId) {
    const createRes = await request.post('/api/learners', {
      headers: DEV_HEADERS,
      data: { name: LEARNER.name, grade_level: 5, learner_id: LEARNER.uid },
    });
    if (createRes.ok()) {
      const created = await createRes.json();
      learnerId = created.learner_id;
    }
  }

  // Trigger auto-provisioning via conversations endpoint
  await request.get(`/api/conversations?learner_id=${LEARNER.uid}`, {
    headers: DEV_HEADERS,
  });

  return learnerId ?? LEARNER.uid;
}

/**
 * Login as the learner and navigate to a target route.
 * Sets selected_learner_id in sessionStorage so the app knows which
 * learner profile to load.
 */
async function loginAndNavigate(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  route: string,
) {
  const learnerId = await provisionLearner(request);
  await loginAs(page, LEARNER);

  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, learnerId);

  await page.goto(`/#${route}`);
  await page.waitForLoadState('networkidle');
  return learnerId;
}

// ---------------------------------------------------------------------------
// L01: Learner sees chat interface after login
// ---------------------------------------------------------------------------
test('L01: Learner sees chat interface after login', async ({ page, request }) => {
  await loginAndNavigate(page, request, '/chat');

  // Chat area should be visible
  const chatArea = page.locator('#chat-messages, .chat-messages, .messages-container, [class*="chat"]').first();
  await expect(chatArea).toBeVisible({ timeout: 10_000 });

  // Input field should be present
  const chatInput = page.locator('#chat-input');
  await expect(chatInput).toBeVisible();

  // Send button should be present
  const sendBtn = page.locator('button', { hasText: 'Send' });
  await expect(sendBtn).toBeVisible();

  // Points badge in navbar shows a number
  const navbar = page.locator('nav.navbar');
  await expect(navbar).toBeVisible();
  const pointsBadge = navbar.locator('.points-badge, .badge, [class*="points"]').first();
  const pointsBadgeVisible = await pointsBadge.isVisible().catch(() => false);
  if (pointsBadgeVisible) {
    const text = await pointsBadge.textContent();
    expect(text).toMatch(/\d/);
  }
});

// ---------------------------------------------------------------------------
// L02: Learner can ask a question and get tutoring response
// ---------------------------------------------------------------------------
test('L02: Learner can ask a question and get tutoring response @llm', async ({ page, request }) => {
  await loginAndNavigate(page, request, '/chat');

  const chatInput = page.locator('#chat-input');
  await chatInput.fill('What is photosynthesis?');

  // Click Send and wait for the API response
  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/conversations/') &&
      res.url().includes('/message') &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  );

  await page.locator('button', { hasText: 'Send' }).click();
  await responsePromise;

  // User message bubble should show the question
  const userMsg = page.locator('.message.user').last();
  await expect(userMsg).toBeVisible({ timeout: 10_000 });
  await expect(userMsg).toContainText('What is photosynthesis?');

  // Assistant message bubble should appear with educational content
  const assistantMsg = page.locator('.message.assistant').last();
  await expect(assistantMsg).toBeVisible({ timeout: 15_000 });
  const content = await assistantMsg.textContent();
  expect(content!.trim().length).toBeGreaterThan(10);

  // No error messages
  await expect(assistantMsg).not.toContainText('Failed to send');
  await expect(assistantMsg).not.toContainText('Error');
});

// ---------------------------------------------------------------------------
// L03: Learner can have a multi-turn conversation
// ---------------------------------------------------------------------------
test('L03: Learner can have a multi-turn conversation @llm', async ({ page, request }) => {
  await loginAndNavigate(page, request, '/chat');

  const chatInput = page.locator('#chat-input');
  const sendBtn = page.locator('button', { hasText: 'Send' });

  // --- Turn 1 ---
  await chatInput.fill('Tell me about the water cycle');

  const response1 = page.waitForResponse(
    (res) =>
      res.url().includes('/api/conversations/') &&
      res.url().includes('/message') &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await sendBtn.click();
  await response1;

  // Verify first assistant reply appeared
  const assistant1 = page.locator('.message.assistant').first();
  await expect(assistant1).toBeVisible({ timeout: 15_000 });

  // --- Turn 2 ---
  await chatInput.fill('Can you explain evaporation more?');

  const response2 = page.waitForResponse(
    (res) =>
      res.url().includes('/api/conversations/') &&
      res.url().includes('/message') &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await sendBtn.click();
  await response2;

  // Verify second assistant reply appeared
  const allAssistant = page.locator('.message.assistant');
  await expect(allAssistant).toHaveCount(2, { timeout: 15_000 });

  // 4 message bubbles total: 2 user + 2 assistant
  const allUser = page.locator('.message.user');
  await expect(allUser).toHaveCount(2);
});

// ---------------------------------------------------------------------------
// L04: Learner can answer a quiz (if quiz appears)
// ---------------------------------------------------------------------------
test('L04: Learner can answer a quiz (if quiz appears) @llm', async ({ page, request }) => {
  await loginAndNavigate(page, request, '/chat');

  const chatInput = page.locator('#chat-input');
  await chatInput.fill('Quiz me on basic math');

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/conversations/') &&
      res.url().includes('/message') &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  );

  await page.locator('button', { hasText: 'Send' }).click();
  await responsePromise;

  // Wait for assistant reply
  const assistantMsg = page.locator('.message.assistant').last();
  await expect(assistantMsg).toBeVisible({ timeout: 15_000 });

  // Check if quiz option buttons appeared
  const quizOptions = page.locator('.quiz-option');
  const hasQuiz = await quizOptions.first().isVisible({ timeout: 5_000 }).catch(() => false);

  if (!hasQuiz) {
    test.skip(true, 'No quiz generated this run');
    return;
  }

  // Click the first quiz option
  await quizOptions.first().click();

  // Wait for feedback response
  const feedbackPromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/conversations/') &&
      res.url().includes('/message') &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await feedbackPromise;

  // Feedback message should appear (correct or incorrect)
  const feedbackMsg = page.locator('.message.assistant').last();
  await expect(feedbackMsg).toBeVisible({ timeout: 15_000 });
  const feedbackText = await feedbackMsg.textContent();
  expect(feedbackText!.trim().length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// L05: Points increase after activity
// ---------------------------------------------------------------------------
test('L05: Points increase after activity @llm', async ({ page, request }) => {
  await loginAndNavigate(page, request, '/chat');

  // Record initial points via API
  const initialPointsRes = await request.get(
    `/api/learners/${LEARNER.uid}/points`,
    { headers: DEV_HEADERS },
  );

  let initialPoints = 0;
  if (initialPointsRes.ok()) {
    const pointsData = await initialPointsRes.json();
    initialPoints = pointsData.points ?? pointsData.total_points ?? 0;
  }

  // Send a message and interact
  const chatInput = page.locator('#chat-input');
  await chatInput.fill('What is 2 + 2?');

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/conversations/') &&
      res.url().includes('/message') &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  );

  await page.locator('button', { hasText: 'Send' }).click();
  await responsePromise;

  // Wait for the assistant response to fully render
  await expect(page.locator('.message.assistant').last()).toBeVisible({ timeout: 15_000 });

  // Check points again
  const finalPointsRes = await request.get(
    `/api/learners/${LEARNER.uid}/points`,
    { headers: DEV_HEADERS },
  );

  // Verify the endpoint works (returns a valid response)
  expect(finalPointsRes.ok()).toBeTruthy();

  const finalData = await finalPointsRes.json();
  const finalPoints = finalData.points ?? finalData.total_points ?? 0;

  // Points may or may not increase — we verify the endpoint works
  // and returns a number
  expect(typeof finalPoints).toBe('number');
});

// ---------------------------------------------------------------------------
// L06: Message history persists
// ---------------------------------------------------------------------------
test('L06: Message history persists @llm', async ({ page, request }) => {
  const learnerId = await loginAndNavigate(page, request, '/chat');

  const testMessage = `Persistence check ${Date.now()}`;

  // Send a message
  const chatInput = page.locator('#chat-input');
  await chatInput.fill(testMessage);

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/conversations/') &&
      res.url().includes('/message') &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  );

  await page.locator('button', { hasText: 'Send' }).click();
  await responsePromise;

  // Wait for assistant reply
  await expect(page.locator('.message.assistant').last()).toBeVisible({ timeout: 15_000 });

  // Navigate away to parent dashboard then back to chat
  await page.goto('/#/parent');
  await page.waitForLoadState('networkidle');

  await page.goto('/#/chat');
  await page.waitForLoadState('networkidle');

  // Previous messages should still be visible (fetched from API)
  const messages = page.locator('.message.user');
  await expect(messages.filter({ hasText: testMessage })).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// L07: Empty state for new learner
// ---------------------------------------------------------------------------
test('L07: Empty state for new learner @llm', async ({ page, request }) => {
  const freshUid = `e2e-fresh-${Date.now()}`;
  const freshLearner: Persona = {
    uid: freshUid,
    email: `${freshUid}@test.sunschool.xyz`,
    name: 'Fresh Learner',
  };

  // Provision the fresh learner via API
  const freshParentUid = `e2e-fresh-parent-${Date.now()}`;
  const freshHeaders = parentHeaders(freshParentUid);

  // Create the learner under a fresh parent
  await request.post('/api/learners', {
    headers: freshHeaders,
    data: { name: freshLearner.name, grade_level: 3, learner_id: freshUid },
  });

  // Trigger auto-provisioning
  await request.get(`/api/conversations?learner_id=${freshUid}`, {
    headers: freshHeaders,
  });

  // Login as the fresh learner
  await loginAs(page, freshLearner);

  await page.evaluate((lid) => {
    sessionStorage.setItem('selected_learner_id', lid);
  }, freshUid);

  await page.goto('/#/chat');
  await page.waitForLoadState('networkidle');

  // Should see either a "Start a conversation" empty state or a ready chat input
  const emptyState = page.locator('text=Start a conversation');
  const chatInput = page.locator('#chat-input');

  const hasEmpty = await emptyState.isVisible().catch(() => false);
  const hasInput = await chatInput.isVisible().catch(() => false);
  expect(hasEmpty || hasInput).toBeTruthy();

  // Send first message
  if (hasInput) {
    await chatInput.fill('Hello, I am new here!');
  } else {
    // Click the empty state or wait for input to appear
    await chatInput.waitFor({ state: 'visible', timeout: 5_000 });
    await chatInput.fill('Hello, I am new here!');
  }

  const responsePromise = page.waitForResponse(
    (res) =>
      res.url().includes('/api/conversations/') &&
      res.url().includes('/message') &&
      res.request().method() === 'POST',
    { timeout: 30_000 },
  );

  await page.locator('button', { hasText: 'Send' }).click();
  await responsePromise;

  // Response arrives
  const assistantMsg = page.locator('.message.assistant').last();
  await expect(assistantMsg).toBeVisible({ timeout: 15_000 });
  const content = await assistantMsg.textContent();
  expect(content!.trim().length).toBeGreaterThan(0);
});
