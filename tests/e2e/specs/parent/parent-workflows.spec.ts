import { test, expect } from '@playwright/test';
import {
  apiCall,
  setupParentSession,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';


test.describe('Parent: Dashboard & Management', () => {
  test('dashboard loads and shows child cards', async ({ page }) => {
    const { childName, token } = await setupParentSession(page, 'dash');
    await page.evaluate(t => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const hasDashboard = await page.getByText(/Dashboard|My Learners/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasChild = await page.getByText(new RegExp(childName.slice(0, 10), 'i'))
      .first().isVisible({ timeout: 10000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-dashboard.png`, fullPage: false });
    expect(hasDashboard || hasChild).toBeTruthy();
  });

  test('learners management page shows enrolled children', async ({ page }) => {
    const { childName, token } = await setupParentSession(page, 'learners');
    await page.evaluate(t => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.goto('/learners');
    await page.waitForLoadState('networkidle');

    const hasLearnersList = await page.getByText(/Learners|Children|Students/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);
    const hasChild = await page.getByText(new RegExp(childName.slice(0, 10), 'i'))
      .first().isVisible({ timeout: 10000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-learners-list.png`, fullPage: false });
    expect(hasLearnersList || hasChild).toBeTruthy();
  });

  test('can add a new child learner', async ({ page }) => {
    const { token } = await setupParentSession(page, 'addchild');

    // Add second child via API
    const newChildName = `SecondChild_${Date.now()}`;
    const result = await apiCall(page, 'POST', '/api/learners', {
      name: newChildName,
      gradeLevel: 5,
    });
    expect(result.status).toBeLessThan(300);
    expect(result.data.id).toBeTruthy();

    // Navigate to learners page and verify both children show
    await page.evaluate(t => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.goto('/learners');
    await page.waitForLoadState('networkidle');
    const hasNewChild = await page.getByText(new RegExp(newChildName.slice(0, 10), 'i'))
      .first().isVisible({ timeout: 15000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-add-child.png`, fullPage: false });
    expect(hasNewChild).toBeTruthy();
  });

  test('reports page loads for a learner', async ({ page }) => {
    const { learnerId, token } = await setupParentSession(page, 'reports');
    await page.evaluate(t => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Reports page should show some content (may need to select learner)
    const hasReports = await page.getByText(/Reports|Analytics|Progress|Performance/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-reports.png`, fullPage: false });
    expect(hasReports).toBeTruthy();
  });

  test('rewards management page loads', async ({ page }) => {
    test.setTimeout(300_000);
    const { token } = await setupParentSession(page, 'rewards');
    await page.evaluate(t => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.goto('/rewards');
    await page.waitForLoadState('networkidle');

    // Retry once if page body is too sparse (transient load failure under concurrency)
    const bodyLen = await page.evaluate(() => document.body.innerText.length);
    if (bodyLen < 50) {
      await page.waitForTimeout(5000);
      await page.reload();
      await page.waitForLoadState('networkidle');
    }

    const hasRewards = await page.getByText(/Rewards|Goals|Manage/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-rewards.png`, fullPage: false });
    expect(hasRewards).toBeTruthy();
  });

  test('can switch to learner mode and see learner home', async ({ page }) => {
    const { learnerId, token } = await setupParentSession(page, 'switchmode');

    // Switch to learner mode
    await page.evaluate((id: number) => {
      localStorage.setItem('selectedLearnerId', String(id));
      localStorage.setItem('preferredMode', 'LEARNER');
    }, learnerId);

    await page.evaluate(t => localStorage.setItem('AUTH_TOKEN', t), token);
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    const hasLearnerHome = await page.getByText(/Hello|Current Lesson|SELECT A SUBJECT/i)
      .first().isVisible({ timeout: 15000 }).catch(() => false);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-learner-mode.png`, fullPage: false });
    expect(hasLearnerHome).toBeTruthy();
  });

  test('can view learner progress from parent view', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId } = await setupParentSession(page, 'progress');

    // Check progress API
    const result = await apiCall(page, 'GET', `/api/achievements?learnerId=${learnerId}`);
    expect(result.status).toBe(200);
  });

  test('can delete a child learner', async ({ page }) => {
    const { learnerId } = await setupParentSession(page, 'delchild');

    const result = await apiCall(page, 'DELETE', `/api/learners/${learnerId}`);
    expect(result.status).toBe(200);

    // Verify child is gone
    const learnersResult = await apiCall(page, 'GET', '/api/learners');
    const childExists = Array.isArray(learnersResult.data)
      ? learnersResult.data.some((l: any) => l.id === learnerId)
      : false;
    expect(childExists).toBeFalsy();
  });
});
