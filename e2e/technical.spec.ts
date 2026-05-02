/**
 * Playwright API-level tests — Technical health & API smoke
 *
 * Verifies the technical foundation works using Playwright's
 * APIRequestContext (no browser UI needed).
 *
 * All tests are independent. NO MOCKS — real server, real DB.
 */

import { test, expect } from '@playwright/test';
import { parentHeaders } from './helpers/auth';

// ---------------------------------------------------------------------------
// T01: Health endpoint
// ---------------------------------------------------------------------------
test('T01: Health endpoint returns ok', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty('status', 'ok');
});

// ---------------------------------------------------------------------------
// T02: Auth config
// ---------------------------------------------------------------------------
test('T02: Auth config exposes Google provider', async ({ request }) => {
  const res = await request.get('/api/config/auth');
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty('provider', 'google');
  expect(typeof body.clientId).toBe('string');
  expect(body.clientId.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// T03: Static files serve
// ---------------------------------------------------------------------------
test('T03: Static files are served correctly', async ({ request }) => {
  // Root page contains 'Sunschool'
  const rootRes = await request.get('/');
  expect(rootRes.status()).toBe(200);
  const rootBody = await rootRes.text();
  expect(rootBody).toContain('Sunschool');

  // app.js contains 'initAuth'
  const jsRes = await request.get('/static/app.js');
  expect(jsRes.status()).toBe(200);
  const jsBody = await jsRes.text();
  expect(jsBody).toContain('initAuth');

  // style.css loads successfully
  const cssRes = await request.get('/static/style.css');
  expect(cssRes.status()).toBe(200);
});

// ---------------------------------------------------------------------------
// T04: Unauthenticated access blocked
// ---------------------------------------------------------------------------
test('T04: Unauthenticated access is blocked where expected', async ({ request }) => {
  // Conversations endpoint requires auth
  const convRes = await request.get('/api/conversations?learner_id=x');
  expect(convRes.status()).toBe(401);

  // Message endpoint requires auth
  const msgRes = await request.post('/api/conversations/x/message', {
    headers: { 'Content-Type': 'application/json' },
    data: { message: 'hello' },
  });
  expect(msgRes.status()).toBe(401);

  // Points is unauthenticated — returns 0
  const pointsRes = await request.get('/api/learners/x/points');
  expect(pointsRes.status()).toBe(200);
  const pointsBody = await pointsRes.json();
  expect(pointsBody.points).toBe(0);

  // Mastery is unauthenticated — returns empty
  const masteryRes = await request.get('/api/learners/x/mastery');
  expect(masteryRes.status()).toBe(200);
  const masteryBody = await masteryRes.json();
  // mastery should be empty (array or object with no entries)
  if (Array.isArray(masteryBody)) {
    expect(masteryBody).toHaveLength(0);
  } else if (masteryBody.mastery !== undefined) {
    expect(masteryBody.mastery).toHaveLength(0);
  }
});

// ---------------------------------------------------------------------------
// T05: Dev bypass auth works
// ---------------------------------------------------------------------------
test('T05: Dev bypass auth works', async ({ request }) => {
  const uid = 'smoke-test-001';
  const headers = parentHeaders(uid);

  const res = await request.get(`/api/conversations?learner_id=${uid}`, {
    headers,
  });
  expect(res.status()).toBe(200);

  const body = await res.json();
  // Response should be a JSON array (or object with array)
  const conversations = Array.isArray(body) ? body : body.conversations;
  expect(Array.isArray(conversations)).toBeTruthy();
});

// ---------------------------------------------------------------------------
// T06: Auto-provisioning works
// ---------------------------------------------------------------------------
test('T06: Auto-provisioning creates default conversation', async ({ request }) => {
  const uid = `provision-test-${Date.now()}`;
  const headers = parentHeaders(uid);

  const res = await request.get(`/api/conversations?learner_id=${uid}`, {
    headers,
  });
  expect(res.status()).toBe(200);

  const body = await res.json();
  const conversations = Array.isArray(body) ? body : body.conversations;

  expect(Array.isArray(conversations)).toBeTruthy();
  expect(conversations.length).toBeGreaterThanOrEqual(1);

  // Default conversation should have subject 'General' and character 'Sunny'
  const defaultConv = conversations[0];
  expect(defaultConv.subject).toBe('General');
  expect(defaultConv.character_name).toBe('Sunny');
});

// ---------------------------------------------------------------------------
// T07: Send message and get AI response
// ---------------------------------------------------------------------------
test('T07: Send message and get AI response @llm', async ({ request }) => {
  // Provision a fresh user to get a conversation ID
  const uid = `msg-test-${Date.now()}`;
  const headers = parentHeaders(uid);

  const convRes = await request.get(`/api/conversations?learner_id=${uid}`, {
    headers,
  });
  expect(convRes.status()).toBe(200);

  const convBody = await convRes.json();
  const conversations = Array.isArray(convBody) ? convBody : convBody.conversations;
  expect(conversations.length).toBeGreaterThanOrEqual(1);

  const conversationId = conversations[0].conversation_id;

  // Send a message
  const msgRes = await request.post(`/api/conversations/${conversationId}/message`, {
    headers,
    data: { message: 'What is 2+2?' },
  });
  expect(msgRes.status()).toBe(200);

  const msgBody = await msgRes.json();

  // Response should have non-empty content
  const content = msgBody.content ?? msgBody.response ?? msgBody.message;
  expect(typeof content).toBe('string');
  expect(content.length).toBeGreaterThan(0);

  // Response should indicate it's from the assistant
  const bodyStr = JSON.stringify(msgBody);
  expect(bodyStr).toContain('assistant');
});

// ---------------------------------------------------------------------------
// T08: Points endpoint
// ---------------------------------------------------------------------------
test('T08: Points endpoint returns learner data', async ({ request }) => {
  const uid = `points-test-${Date.now()}`;
  const headers = parentHeaders(uid);

  // Provision the user first
  await request.get(`/api/conversations?learner_id=${uid}`, { headers });

  const res = await request.get(`/api/learners/${uid}/points`, { headers });
  expect(res.status()).toBe(200);

  const body = await res.json();
  expect(body).toHaveProperty('learner_id');
  expect(typeof body.points).toBe('number');
});

// ---------------------------------------------------------------------------
// T09: Guidelines CRUD
// ---------------------------------------------------------------------------
test('T09: Guidelines CRUD operations', async ({ request }) => {
  const uid = `guidelines-test-${Date.now()}`;
  const headers = parentHeaders(uid);

  // Provision the user
  await request.get(`/api/conversations?learner_id=${uid}`, { headers });

  // GET — initial state
  const getRes1 = await request.get('/api/parent/guidelines', { headers });
  expect(getRes1.status()).toBe(200);

  // PUT — set guidelines
  const putRes = await request.put('/api/parent/guidelines', {
    headers,
    data: { guidelines: 'no violence' },
  });
  expect(putRes.status()).toBe(200);

  // GET — verify persistence
  const getRes2 = await request.get('/api/parent/guidelines', { headers });
  expect(getRes2.status()).toBe(200);

  const body = await getRes2.json();
  const guidelinesStr = JSON.stringify(body);
  expect(guidelinesStr).toContain('no violence');
});

// ---------------------------------------------------------------------------
// T10: OpenAPI spec
// ---------------------------------------------------------------------------
test('T10: OpenAPI spec is available', async ({ request }) => {
  const res = await request.get('/openapi.json');
  expect(res.status()).toBe(200);

  const body = await res.json();
  const pathsStr = JSON.stringify(body.paths ?? {});

  expect(pathsStr).toContain('/api/conversations');
  expect(pathsStr).toContain('/api/learners');
  expect(pathsStr).toContain('/health');
});
