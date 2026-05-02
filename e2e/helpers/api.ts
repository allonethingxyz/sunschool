/**
 * API helpers that provision test data via backend endpoints.
 *
 * All calls go through the real server with dev-bypass auth headers.
 * NO MOCKS — real server, real DB, real API calls.
 */

import type { APIRequestContext } from '@playwright/test';
import { parentHeaders } from './auth';

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

/**
 * Provision a parent user, a child learner, and a default conversation
 * by calling the backend's auto-provisioning endpoints.
 *
 * 1. POST /api/learners — creates the learner under the parent
 * 2. GET  /api/conversations?learner_id=<learner_id> — triggers
 *    auto-provisioning of User + Learner + default Conversation
 *
 * Returns the conversation ID for the newly provisioned learner.
 */
export async function provisionParentAndLearner(
  request: APIRequestContext,
  parentUid: string,
  learnerName: string,
  gradeLevel: number,
): Promise<string> {
  const headers = parentHeaders(parentUid);

  // Create the child learner under this parent
  const createRes = await request.post('/api/learners', {
    headers,
    data: {
      name: learnerName,
      grade_level: gradeLevel,
    },
  });

  if (!createRes.ok()) {
    const body = await createRes.text();
    throw new Error(
      `Failed to create learner (${createRes.status()}): ${body}`,
    );
  }

  const learner = await createRes.json();
  const learnerId: string = learner.learner_id;

  // Fetch conversations for this learner — triggers auto-provisioning
  const convRes = await request.get(
    `/api/conversations?learner_id=${learnerId}`,
    { headers },
  );

  if (!convRes.ok()) {
    const body = await convRes.text();
    throw new Error(
      `Failed to list conversations (${convRes.status()}): ${body}`,
    );
  }

  const convData = await convRes.json();
  const conversations: Array<{ conversation_id: string }> =
    convData.conversations ?? convData;

  if (!conversations.length) {
    throw new Error(
      'No conversations returned after provisioning — auto-provisioning may have failed',
    );
  }

  return conversations[0].conversation_id;
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/**
 * Send a message in a conversation and return the full response body.
 */
export async function sendMessage(
  request: APIRequestContext,
  conversationId: string,
  message: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await request.post(
    `/api/conversations/${conversationId}/message`,
    {
      headers,
      data: { message },
    },
  );

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(
      `Failed to send message (${res.status()}): ${body}`,
    );
  }

  return (await res.json()) as Record<string, unknown>;
}
