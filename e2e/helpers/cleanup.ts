/**
 * Test-data cleanup helpers.
 *
 * These helpers remove test artifacts between runs so E2E tests stay
 * hermetic.  All operations go through the real server / DB — no mocks.
 */

import type { APIRequestContext } from '@playwright/test';
import { parentHeaders } from './auth';

/**
 * UIDs / prefixes used by the default test personas so cleanup knows
 * what to target.
 */
export const TEST_UID_PREFIX = 'parent-' as const;
export const TEST_LEARNER_PREFIX = 'learner-' as const;

/**
 * Delete all learners owned by a test parent.
 *
 * This is a best-effort helper — if the backend doesn't yet expose a
 * DELETE endpoint it will log a warning instead of failing the suite.
 */
export async function cleanupLearners(
  request: APIRequestContext,
  parentUid: string,
): Promise<void> {
  const headers = parentHeaders(parentUid);

  // List current learners
  const listRes = await request.get('/api/learners', { headers });
  if (!listRes.ok()) {
    console.warn(
      `[cleanup] Could not list learners for ${parentUid}: ${listRes.status()}`,
    );
    return;
  }

  const data = await listRes.json();
  const learners: Array<{ learner_id: string }> =
    data.learners ?? data;

  for (const l of learners) {
    const delRes = await request.delete(`/api/learners/${l.learner_id}`, {
      headers,
    });
    if (!delRes.ok() && delRes.status() !== 404) {
      console.warn(
        `[cleanup] Could not delete learner ${l.learner_id}: ${delRes.status()}`,
      );
    }
  }
}
