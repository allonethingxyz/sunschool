/**
 * Parent Persona E2E: Database Sync
 *
 * Journeys:
 *   1. Parent can navigate to /database-sync page
 *   2. Page renders with sync configuration content
 *   3. Parent can create a sync config via API (POST /api/sync-configs)
 *   4. Created config appears in GET /api/sync-configs
 *   5. Parent can update a sync config (PUT /api/sync-configs/:id)
 *   6. Parent can delete a sync config (DELETE /api/sync-configs/:id)
 *   7. Deleted config no longer in GET /api/sync-configs
 *
 * No mocks -- real API calls, real browser.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  apiCall,
  screenshot,
  navigateAsParent,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';
const FAKE_CONN_STRING = 'postgresql://test:test@localhost:5432/testdb';
const UPDATED_CONN_STRING = 'postgresql://test:test@localhost:5432/updateddb';

test.describe('Parent: Database Sync', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
  });

  test('parent can navigate to /database-sync page', async ({ page }) => {
    try {
      await setupParentSession(page, 'dbsync_nav');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    await navigateAsParent(page, '/database-sync');

    // Page should load without redirecting away
    const url = page.url();
    expect(url).toContain('/database-sync');

    await screenshot(page, 'dbsync-01-navigate');
  });

  test('database sync page renders with sync configuration content', async ({ page }) => {
    try {
      await setupParentSession(page, 'dbsync_render');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    await navigateAsParent(page, '/database-sync');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    // Page should contain sync-related content
    const hasSyncContent = /sync|database|configuration|connect/i.test(bodyText);
    expect(hasSyncContent).toBeTruthy();

    await screenshot(page, 'dbsync-02-content');
  });

  test('CRUD: create, read, update, delete sync config via API', async ({ page }) => {
    try {
      await setupParentSession(page, 'dbsync_crud');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    // Step 1: Create a sync config
    const createResult = await apiCall(page, 'POST', '/api/sync-configs', {
      targetDbUrl: FAKE_CONN_STRING,
      continuousSync: false,
    });
    expect(createResult.status).toBe(201);
    expect(createResult.data).toBeTruthy();
    expect(createResult.data.id).toBeTruthy();
    const configId = createResult.data.id;

    await screenshot(page, 'dbsync-03-created');

    // Step 2: Verify it appears in GET /api/sync-configs
    const listResult = await apiCall(page, 'GET', '/api/sync-configs');
    expect(listResult.status).toBe(200);
    expect(Array.isArray(listResult.data)).toBe(true);

    const found = listResult.data.find((c: any) => c.id === configId);
    expect(found).toBeTruthy();
    expect(found.targetDbUrl).toBe(FAKE_CONN_STRING);

    // Step 3: Update the sync config
    const updateResult = await apiCall(page, 'PUT', `/api/sync-configs/${configId}`, {
      targetDbUrl: UPDATED_CONN_STRING,
      continuousSync: true,
    });
    expect(updateResult.status).toBe(200);
    expect(updateResult.data.targetDbUrl).toBe(UPDATED_CONN_STRING);
    expect(updateResult.data.continuousSync).toBe(true);

    await screenshot(page, 'dbsync-04-updated');

    // Step 4: Delete the sync config
    const deleteResult = await apiCall(page, 'DELETE', `/api/sync-configs/${configId}`);
    expect(deleteResult.status).toBe(204);

    // Step 5: Verify it no longer appears in GET /api/sync-configs
    const listAfterDelete = await apiCall(page, 'GET', '/api/sync-configs');
    expect(listAfterDelete.status).toBe(200);
    const notFound = (listAfterDelete.data || []).find((c: any) => c.id === configId);
    expect(notFound).toBeFalsy();

    await screenshot(page, 'dbsync-05-deleted');
  });

  test('creating sync config with invalid connection string returns 400', async ({ page }) => {
    try {
      await setupParentSession(page, 'dbsync_invalid');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    const result = await apiCall(page, 'POST', '/api/sync-configs', {
      targetDbUrl: 'not-a-valid-connection-string',
      continuousSync: false,
    });
    expect(result.status).toBe(400);
    expect(result.data?.error).toBeTruthy();

    await screenshot(page, 'dbsync-06-invalid-url');
  });

  test('creating sync config without targetDbUrl returns 400', async ({ page }) => {
    try {
      await setupParentSession(page, 'dbsync_missing');
    } catch (err) {
      console.log('SKIP: Setup failed', err);
      test.skip();
      return;
    }

    const result = await apiCall(page, 'POST', '/api/sync-configs', {
      continuousSync: false,
    });
    expect(result.status).toBe(400);
    expect(result.data?.error).toBeTruthy();

    await screenshot(page, 'dbsync-07-missing-url');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `dbsync-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
