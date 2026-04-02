/**
 * Global teardown — runs after ALL E2E tests complete.
 * Cleans up test users created during the run.
 */
import { request } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5000';

async function globalTeardown() {
  // Only clean up if running against production/staging (not localhost)
  if (baseURL.includes('localhost')) return;

  try {
    const context = await request.newContext({ baseURL });

    // Register a temporary admin-like user to call cleanup
    // Or call the cleanup endpoint directly if we have a token
    // The simplest approach: delete via direct API using test email pattern
    const testUsers = await context.get('/api/healthcheck');
    const health = await testUsers.json();
    console.log(`[Teardown] Users before cleanup: ${health.userCount}`);

    // Try to clean up test users via the admin endpoint
    // We need an admin token — try logging in
    const loginRes = await context.post('/api/login', {
      data: {
        username: process.env.E2E_ADMIN_USERNAME || '',
        password: process.env.E2E_ADMIN_PASSWORD || '',
      },
    });

    if (loginRes.ok()) {
      const { token } = await loginRes.json();
      const cleanupRes = await context.delete('/api/admin/cleanup-test-users', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (cleanupRes.ok()) {
        const result = await cleanupRes.json();
        console.log(`[Teardown] Cleaned up ${result.deleted} test users`);
      } else {
        console.warn(`[Teardown] Cleanup endpoint returned ${cleanupRes.status()}`);
      }
    } else {
      console.warn('[Teardown] Could not log in as admin for cleanup');
    }

    await context.dispose();
  } catch (err) {
    // Don't fail the test run if cleanup fails
    console.warn('[Teardown] Cleanup failed:', err);
  }
}

export default globalTeardown;
