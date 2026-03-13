import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

/**
 * Parent Persona: Dashboard
 *
 * Models the parent viewing their dashboard, checking stats, navigating
 * between learners, and accessing information cards about the platform.
 */

const ts = Date.now();

// Helper: register a parent and return auth token
async function registerParent(page: import('@playwright/test').Page, suffix: string) {
  const user = {
    username: `parent_dash_${suffix}_${ts}`,
    email: `parent_dash_${suffix}_${ts}@test.com`,
    password: 'TestPassword123!',
    name: `Dashboard Parent ${suffix}`,
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

// Helper: navigate to dashboard
async function goToDashboard(page: import('@playwright/test').Page) {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  const gotIt = page.getByText('GOT IT!');
  if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await gotIt.click();
  }
}

test.describe('Parent dashboard', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await captureFailureArtifacts(page, testInfo.title);
    }
  });

  test('dashboard shows greeting and empty state for new parent', async ({ page }) => {
    await registerParent(page, 'empty');
    await goToDashboard(page);

    // Should show greeting with parent name
    await expect(async () => {
      await expect(page.getByText(/hello/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Empty state: should prompt to add a child
    await expect(async () => {
      const emptyText = page.getByText(/haven't added any children/i);
      const addBtn = page.getByRole('button', { name: /add child/i });
      const either = await emptyText.isVisible().catch(() => false) ||
                     await addBtn.isVisible().catch(() => false);
      expect(either).toBe(true);
    }).toPass({ timeout: 10000 });

    // How It Works section should be visible
    await expect(async () => {
      await expect(page.getByText(/create child account/i).first()).toBeVisible();
    }).toPass({ timeout: 5000 });

    await expect(page.getByText(/personalized learning/i).first()).toBeVisible();
    await expect(page.getByText(/track progress/i).first()).toBeVisible();
  });

  test('dashboard shows learner cards with grade badges after adding children', async ({ page }) => {
    const token = await registerParent(page, 'cards');

    const child1Name = `DashChild1_${ts}`;
    const child2Name = `DashChild2_${ts}`;

    await createLearner(page, token, child1Name, 3);
    await createLearner(page, token, child2Name, 7);

    await goToDashboard(page);

    // Both children should be displayed
    await expect(async () => {
      await expect(page.getByText(child1Name)).toBeVisible();
      await expect(page.getByText(child2Name)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Grade badges should be visible
    await expect(page.getByText(/grade 3/i).first()).toBeVisible();
    await expect(page.getByText(/grade 7/i).first()).toBeVisible();

    // Action buttons should be available for each learner
    const editGradeButtons = page.getByRole('button', { name: /edit grade/i });
    await expect(async () => {
      const count = await editGradeButtons.count();
      expect(count).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5000 });

    const progressButtons = page.getByRole('button', { name: /progress/i });
    await expect(async () => {
      const count = await progressButtons.count();
      expect(count).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5000 });
  });

  test('parent can navigate to learner progress from dashboard', async ({ page }) => {
    const token = await registerParent(page, 'nav');
    const childName = `NavChild_${ts}`;

    await createLearner(page, token, childName, 5);
    await goToDashboard(page);

    // Verify child is listed
    await expect(async () => {
      await expect(page.getByText(childName)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Click Progress button to view learner progress
    const { locator: progressBtn } = await selfHealingLocator(page, 'progress button', {
      role: 'button', name: 'Progress', text: 'Progress',
    });
    await progressBtn.click();

    // Should navigate to progress page
    await expect(async () => {
      expect(page.url()).toMatch(/progress/);
    }).toPass({ timeout: 10000 });
  });

  test('parent can navigate to reports page', async ({ page }) => {
    const token = await registerParent(page, 'reports');
    const childName = `ReportsChild_${ts}`;

    await createLearner(page, token, childName, 4);

    // Navigate to reports
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Reports page should load with learning reports header
    await expect(async () => {
      await expect(page.getByText(/learning reports/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Should see the learner name in the reports page
    await expect(async () => {
      await expect(page.getByText(childName)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Report type tabs should be visible (Lessons tab)
    await expect(page.getByText(/lessons/i).first()).toBeVisible();
  });

  test('parent dashboard shows logout button that works', async ({ page }) => {
    await registerParent(page, 'logout');
    await goToDashboard(page);

    // Logout button should be visible
    const { locator: logoutBtn } = await selfHealingLocator(page, 'logout button', {
      role: 'button', name: 'Logout', text: 'Logout',
    });
    await expect(logoutBtn).toBeVisible();

    // Click logout
    await logoutBtn.click();

    // Should redirect away from dashboard
    await expect(async () => {
      expect(page.url()).not.toMatch(/\/dashboard/);
    }).toPass({ timeout: 15000 });
  });
});
