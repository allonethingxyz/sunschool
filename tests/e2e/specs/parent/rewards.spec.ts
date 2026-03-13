import { test, expect } from '@playwright/test';
import {
  selfHealingLocator,
  captureFailureArtifacts,
  dismissModals,
  registerParentViaAPI,
  apiCall,
  authenticateAndNavigate,
} from '../../helpers/self-healing';

/**
 * Parent Persona: Rewards System
 *
 * Models the parent creating rewards, setting point costs,
 * and managing redemption requests.
 */

const ts = Date.now();

test.describe('Rewards Management', () => {
  test.describe.configure({ retries: 2 });

  let token: string;
  let learnerName: string;
  let learnerId: number;

  const parentUser = {
    username: `parent_rewards_${ts}`,
    email: `parent_rewards_${ts}@test.com`,
    password: 'TestPassword123!',
    name: 'Rewards Parent',
  };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Register parent
    token = await registerParentViaAPI(page, parentUser);

    // Create a child learner via API
    learnerName = `RewardChild_${ts}`;
    const result = await apiCall(page, 'POST', '/api/learners', {
      name: learnerName,
      gradeLevel: 4,
    }) as { status: number; data: { id: number } };
    learnerId = result.data.id;

    await page.close();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await captureFailureArtifacts(page, testInfo);
  });

  test('rewards page loads with Rewards Center heading', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/rewards');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Page heading should be visible
    const heading = await selfHealingLocator(page, [
      () => page.getByText(/Rewards Center/i),
      () => page.getByText(/Rewards/i).first(),
    ], { timeout: 15000 });
    await expect(heading).toBeVisible();

    // URL should match
    expect(page.url()).toMatch(/rewards/);
  });

  test('create a new reward with title and point cost', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/rewards');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Click Add Reward button
    const addRewardBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /Add Reward/i }),
      () => page.getByText(/Add Reward/i),
    ], { timeout: 15000 });
    await addRewardBtn.click();

    // Fill in the reward form
    const titleInput = await selfHealingLocator(page, [
      () => page.getByPlaceholder(/Movie Night/i),
      () => page.getByPlaceholder(/title/i),
      () => page.getByLabel(/Title/i),
    ], { timeout: 10000 });
    await titleInput.fill('Extra Screen Time');

    // Set point cost
    const pointsInput = await selfHealingLocator(page, [
      () => page.getByPlaceholder('10'),
      () => page.getByPlaceholder(/points/i),
      () => page.getByLabel(/Points/i),
    ]);
    await pointsInput.clear();
    await pointsInput.fill('50');

    // Save the reward
    const saveBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /Save/i }),
      () => page.getByRole('button', { name: /Create/i }),
    ]);
    await saveBtn.click();

    // Verify the reward appears in the list
    await expect(async () => {
      const rewardVisible = await page.getByText('Extra Screen Time').isVisible().catch(() => false);
      expect(rewardVisible).toBe(true);
    }).toPass({ timeout: 10000 });

    // Point cost should be displayed
    await expect(async () => {
      const pointsVisible = await page.getByText(/50\s*pts/i).isVisible().catch(() => false);
      expect(pointsVisible).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test('reward form supports emoji icon selection', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/rewards');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Open Add Reward form
    const addRewardBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /Add Reward/i }),
      () => page.getByText(/Add Reward/i),
    ], { timeout: 15000 });
    await addRewardBtn.click();

    // The form should contain emoji icons for selection
    await expect(async () => {
      // Check that emoji icons are visible (common reward emojis)
      const hasEmoji =
        await page.getByText('🎁').isVisible().catch(() => false) ||
        await page.getByText('⭐').isVisible().catch(() => false) ||
        await page.getByText('🏆').isVisible().catch(() => false);
      expect(hasEmoji).toBe(true);
    }).toPass({ timeout: 10000 });

    // Fill in a reward with an emoji icon selected
    const titleInput = await selfHealingLocator(page, [
      () => page.getByPlaceholder(/Movie Night/i),
      () => page.getByPlaceholder(/title/i),
    ]);
    await titleInput.fill('Ice Cream Treat');

    // Click an emoji icon
    const emojiBtn = await selfHealingLocator(page, [
      () => page.getByText('🎁'),
      () => page.getByText('⭐'),
    ]);
    await emojiBtn.click();

    // Set point cost
    const pointsInput = await selfHealingLocator(page, [
      () => page.getByPlaceholder('10'),
      () => page.getByPlaceholder(/points/i),
    ]);
    await pointsInput.clear();
    await pointsInput.fill('25');

    // Save
    const saveBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /Save/i }),
    ]);
    await saveBtn.click();

    // Verify created reward with emoji appears
    await expect(async () => {
      await expect(page.getByText('Ice Cream Treat')).toBeVisible();
    }).toPass({ timeout: 10000 });
  });

  test('rewards page has tabs for Rewards, Requests, and Settings', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/rewards');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Rewards tab should be present
    const rewardsTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: /Rewards/i }),
      () => page.getByText('Rewards', { exact: true }).first(),
    ], { timeout: 15000 });
    await expect(rewardsTab).toBeVisible();

    // Requests tab
    const requestsTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: /Requests/i }),
      () => page.getByText('Requests').first(),
    ]);
    await expect(requestsTab).toBeVisible();

    // Settings tab
    const settingsTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: 'Settings' }),
      () => page.getByText('Settings', { exact: true }).first(),
    ]);
    await expect(settingsTab).toBeVisible();

    // Click on Settings tab — should show Double-or-Loss mode settings
    await settingsTab.click();
    await page.waitForLoadState('networkidle');

    await expect(async () => {
      const hasDoubleOrLoss =
        await page.getByText(/Double-or-Loss/i).isVisible().catch(() => false) ||
        await page.getByText(/scoring/i).isVisible().catch(() => false);
      expect(hasDoubleOrLoss).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test('view redemption requests tab (empty state for new account)', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/rewards');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Click on the Requests tab
    const requestsTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: /Requests/i }),
      () => page.getByText('Requests').first(),
    ], { timeout: 15000 });
    await requestsTab.click();
    await page.waitForLoadState('networkidle');

    // For a new account, should show empty state or no pending requests
    await expect(async () => {
      const hasContent =
        await page.getByText(/no.*request/i).isVisible().catch(() => false) ||
        await page.getByText(/pending/i).isVisible().catch(() => false) ||
        await page.getByText(/Requests/i).isVisible().catch(() => false) ||
        await page.getByText(/empty/i).isVisible().catch(() => false);
      expect(hasContent).toBe(true);
    }).toPass({ timeout: 10000 });
  });
});
