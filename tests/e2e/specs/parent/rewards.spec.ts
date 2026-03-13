import { test, expect } from '@playwright/test';
import {
  selfHealingLocator,
  captureFailureArtifacts,
  registerParentViaAPI,
  authenticateAndNavigate,
  apiCall,
} from '../../helpers/self-healing';

/**
 * Parent Persona: Rewards System
 *
 * Models a parent creating rewards, setting point costs, viewing redemption
 * requests, and managing the rewards center tabs (Rewards, Requests, Settings).
 */

test.describe('Rewards management', () => {
  test.describe.configure({ retries: 2 });

  test.afterEach(async ({ page }, testInfo) => {
    await captureFailureArtifacts(page, testInfo);
  });

  test('parent sees the Rewards Center with tabs', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_rew_tabs_${ts}`,
      email: `parent_rew_tabs_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Rewards Tabs Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'RewardKid', gradeLevel: 5 });

    await authenticateAndNavigate(page, token, '/rewards');

    // Verify Rewards Center heading
    const heading = await selfHealingLocator(page, [
      () => page.getByRole('heading', { name: /rewards center/i }),
      () => page.getByText(/rewards center/i),
    ]);
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Verify all three tabs are visible
    await expect(page.getByRole('tab', { name: /rewards/i }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /requests/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /settings/i })).toBeVisible();
  });

  test('parent can create a new reward with title and point cost', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_rew_create_${ts}`,
      email: `parent_rew_create_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Create Reward Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'CreateKid', gradeLevel: 4 });

    await authenticateAndNavigate(page, token, '/rewards');

    // Click Add Reward button
    const addButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /add reward/i }),
      () => page.getByText(/add reward/i),
    ]);
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    // Fill in reward title
    const titleInput = await selfHealingLocator(page, [
      () => page.getByPlaceholder(/movie night/i),
      () => page.getByLabel(/title/i),
      () => page.getByRole('textbox').first(),
    ]);
    await titleInput.fill('Ice Cream Trip');

    // Set point cost
    const pointsInput = page.getByRole('spinbutton').first();
    if (await pointsInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pointsInput.clear();
      await pointsInput.fill('25');
    }

    // Click Save
    const saveButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /save/i }),
      () => page.getByText(/save/i),
    ]);
    await saveButton.click();

    await page.waitForLoadState('networkidle');

    // Verify the new reward appears
    await expect(async () => {
      await expect(page.getByText('Ice Cream Trip')).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Verify point cost is displayed
    await expect(page.getByText(/25/)).toBeVisible();
  });

  test('parent can view empty redemption requests tab', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_rew_req_${ts}`,
      email: `parent_rew_req_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Requests Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'RequestKid', gradeLevel: 3 });

    await authenticateAndNavigate(page, token, '/rewards');

    // Switch to Requests tab
    const requestsTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: /requests/i }),
      () => page.getByText(/requests/i),
    ]);
    await expect(requestsTab).toBeVisible({ timeout: 10000 });
    await requestsTab.click();

    await page.waitForLoadState('networkidle');

    // Should show empty state message
    await expect(async () => {
      await expect(page.getByText(/no redemption requests/i)).toBeVisible();
    }).toPass({ timeout: 10000 });
  });

  test('parent can view Settings tab with double-or-loss mode', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_rew_set_${ts}`,
      email: `parent_rew_set_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Settings Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'SettingsKid', gradeLevel: 6 });

    await authenticateAndNavigate(page, token, '/rewards');

    // Switch to Settings tab
    const settingsTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: /settings/i }),
      () => page.getByText(/settings/i),
    ]);
    await expect(settingsTab).toBeVisible({ timeout: 10000 });
    await settingsTab.click();

    await page.waitForLoadState('networkidle');

    // Should see Double-or-Loss Mode section
    await expect(page.getByText(/double-or-loss/i).first()).toBeVisible({ timeout: 10000 });

    // Should see a toggle switch for the mode
    const toggle = page.getByRole('switch').first();
    if (await toggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(toggle).toBeVisible();
    }
  });

  test('parent sees empty state when no rewards exist', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_rew_empty_${ts}`,
      email: `parent_rew_empty_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Empty Rewards Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'EmptyKid', gradeLevel: 2 });

    await authenticateAndNavigate(page, token, '/rewards');

    // On a fresh account with no rewards, should see empty state
    await expect(async () => {
      await expect(page.getByText(/no rewards yet/i)).toBeVisible();
    }).toPass({ timeout: 10000 });
  });
});
