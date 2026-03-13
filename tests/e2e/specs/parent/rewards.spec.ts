import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

/**
 * Parent Persona: Rewards Management
 *
 * Models the parent journey of creating rewards, setting point costs,
 * managing redemption requests, and configuring double-or-loss settings.
 */

const ts = Date.now();

// Helper: register a parent and return auth token
async function registerParent(page: import('@playwright/test').Page, suffix: string) {
  const user = {
    username: `parent_rwd_${suffix}_${ts}`,
    email: `parent_rwd_${suffix}_${ts}@test.com`,
    password: 'TestPassword123!',
    name: `Rewards Parent ${suffix}`,
    role: 'PARENT',
  };

  await page.goto('/auth');
  await page.waitForLoadState('networkidle');

  const result = await page.evaluate(async (userData) => {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return res.json();
  }, user);

  await page.evaluate((t: string) => localStorage.setItem('AUTH_TOKEN', t), result.token);
  return result.token;
}

// Helper: create a learner via API
async function createLearner(page: import('@playwright/test').Page, token: string, name: string, gradeLevel: number) {
  const result = await page.evaluate(async ({ token, name, gradeLevel }: { token: string; name: string; gradeLevel: number }) => {
    const res = await fetch('/api/learners', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name, gradeLevel }),
    });
    return res.json();
  }, { token, name, gradeLevel });
  return result;
}

test.describe('Parent rewards management', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await captureFailureArtifacts(page, testInfo.title);
    }
  });

  test('rewards page loads with empty state for new parent', async ({ page }) => {
    await registerParent(page, 'empty');

    await page.goto('/rewards');
    await page.waitForLoadState('networkidle');

    // Should see Rewards Center heading
    await expect(async () => {
      await expect(page.getByText(/rewards center/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Should show tabs: Rewards, Requests, Settings
    await expect(page.getByText(/rewards/i).first()).toBeVisible();
    await expect(page.getByText(/requests/i).first()).toBeVisible();
    await expect(page.getByText(/settings/i).first()).toBeVisible();

    // Empty state should show "No rewards yet" message
    await expect(async () => {
      await expect(page.getByText(/no rewards yet/i)).toBeVisible();
    }).toPass({ timeout: 5000 });

    // Add Reward button should be available
    await expect(page.getByRole('button', { name: /add reward/i })).toBeVisible();
  });

  test('parent can create a new reward with title and point cost', async ({ page }) => {
    await registerParent(page, 'create');

    await page.goto('/rewards');
    await page.waitForLoadState('networkidle');

    // Click Add Reward
    const { locator: addRewardBtn } = await selfHealingLocator(page, 'add reward button', {
      role: 'button', name: 'Add Reward', text: 'Add Reward',
    });
    await addRewardBtn.click();

    // Should see the reward form modal with "New Reward" title
    await expect(async () => {
      await expect(page.getByText(/new reward/i)).toBeVisible();
    }).toPass({ timeout: 5000 });

    // Fill in reward details
    const titleInput = page.getByPlaceholder(/movie night/i);
    await titleInput.fill('Extra Screen Time');

    const descInput = page.getByPlaceholder(/optional description/i);
    await descInput.fill('30 minutes of extra screen time');

    // Set point cost
    const pointsInput = page.getByPlaceholder('10');
    await pointsInput.clear();
    await pointsInput.fill('50');

    // Select a category (e.g., SCREEN_TIME)
    const screenTimeCategory = page.getByRole('button', { name: /screen.time/i });
    if (await screenTimeCategory.isVisible({ timeout: 2000 }).catch(() => false)) {
      await screenTimeCategory.click();
    }

    // Save the reward
    const { locator: saveBtn } = await selfHealingLocator(page, 'save reward button', {
      role: 'button', name: 'Save', text: 'Save',
    });
    await saveBtn.click();

    // Reward should appear in the list
    await expect(async () => {
      await expect(page.getByText('Extra Screen Time')).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Point cost should be displayed
    await expect(page.getByText(/50.*pts/i).first()).toBeVisible();
  });

  test('parent can view redemption requests tab', async ({ page }) => {
    const token = await registerParent(page, 'requests');
    await createLearner(page, token, `ReqChild_${ts}`, 5);

    await page.goto('/rewards');
    await page.waitForLoadState('networkidle');

    // Click on Requests tab
    const { locator: requestsTab } = await selfHealingLocator(page, 'requests tab', {
      text: 'Requests',
    });
    await requestsTab.click();

    // Should show empty redemption state
    await expect(async () => {
      await expect(page.getByText(/no redemption requests/i)).toBeVisible();
    }).toPass({ timeout: 5000 });
  });

  test('parent can access settings tab and see double-or-loss mode', async ({ page }) => {
    const token = await registerParent(page, 'settings');
    await createLearner(page, token, `SettingsChild_${ts}`, 4);

    await page.goto('/rewards');
    await page.waitForLoadState('networkidle');

    // Click on Settings tab
    const { locator: settingsTab } = await selfHealingLocator(page, 'settings tab', {
      text: 'Settings',
    });
    await settingsTab.click();

    // Should see Double-or-Loss Mode section
    await expect(async () => {
      await expect(page.getByText(/double-or-loss mode/i).first()).toBeVisible();
    }).toPass({ timeout: 5000 });

    // Should see the learner name with toggle
    await expect(async () => {
      await expect(page.getByText(/SettingsChild/i)).toBeVisible();
    }).toPass({ timeout: 5000 });
  });

  test('parent can create a reward and see it listed with all details', async ({ page }) => {
    const token = await registerParent(page, 'details');
    await createLearner(page, token, `DetailChild_${ts}`, 6);

    // Create a reward via API for consistency
    await page.evaluate(async ({ token }: { token: string }) => {
      await fetch('/api/rewards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: 'Ice Cream Trip',
          description: 'A trip to the ice cream shop',
          tokenCost: 100,
          category: 'FOOD_TREAT',
          imageEmoji: '🍦',
          color: '#FF8F00',
          isActive: true,
        }),
      });
    }, { token });

    await page.goto('/rewards');
    await page.waitForLoadState('networkidle');

    // Reward should be visible with title
    await expect(async () => {
      await expect(page.getByText('Ice Cream Trip')).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Point cost should show
    await expect(page.getByText(/100.*pts/i).first()).toBeVisible();

    // Category should be visible
    await expect(page.getByText(/food.treat/i).first()).toBeVisible();
  });
});
