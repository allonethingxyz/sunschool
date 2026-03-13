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
 * Parent Persona: Dashboard
 *
 * Models the parent viewing the dashboard, checking stats, and
 * navigating between learner views.
 */

const ts = Date.now();

test.describe('Parent Dashboard', () => {
  test.describe.configure({ retries: 2 });

  let token: string;
  let learnerName: string;
  let learnerId: number;

  const parentUser = {
    username: `parent_dash_${ts}`,
    email: `parent_dash_${ts}@test.com`,
    password: 'TestPassword123!',
    name: 'Dashboard Parent',
  };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // Register parent
    token = await registerParentViaAPI(page, parentUser);

    // Create a child learner via API
    learnerName = `DashLearner_${ts}`;
    const result = await apiCall(page, 'POST', '/api/learners', {
      name: learnerName,
      gradeLevel: 5,
    }) as { status: number; data: { id: number } };
    learnerId = result.data.id;

    await page.close();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await captureFailureArtifacts(page, testInfo);
  });

  test('dashboard displays welcome greeting and child overview', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Welcome greeting should be visible
    const greeting = await selfHealingLocator(page, [
      () => page.getByText(/Welcome/i),
      () => page.getByText(parentUser.name),
    ], { timeout: 15000 });
    await expect(greeting).toBeVisible();

    // Child's name should be visible in the dashboard
    const childNameEl = await selfHealingLocator(page, [
      () => page.getByText(learnerName),
    ], { timeout: 10000 });
    await expect(childNameEl).toBeVisible();

    // URL should be /dashboard
    expect(page.url()).toMatch(/dashboard/);
  });

  test('dashboard shows stats for each child (lessons, score, achievements)', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Wait for child card to load
    await expect(page.getByText(learnerName)).toBeVisible({ timeout: 15000 });

    // Should display lesson-related stats
    await expect(async () => {
      const hasLessonStat = await page.getByText(/Lessons/i).first().isVisible().catch(() => false);
      const hasScoreStat = await page.getByText(/%/).first().isVisible().catch(() => false);
      const hasAchievementStat = await page.getByText(/Achievements/i).first().isVisible().catch(() => false);
      // At least one stat type should be visible
      expect(hasLessonStat || hasScoreStat || hasAchievementStat).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test('dashboard has navigation links to Reports and Rewards', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Reports link should be visible
    const reportsLink = await selfHealingLocator(page, [
      () => page.getByRole('link', { name: /Reports/i }),
      () => page.getByText(/Reports/i).first(),
    ], { timeout: 10000 });
    await expect(reportsLink).toBeVisible();

    // Rewards link should be visible
    const rewardsLink = await selfHealingLocator(page, [
      () => page.getByRole('link', { name: /Rewards/i }),
      () => page.getByText(/Rewards/i).first(),
    ], { timeout: 10000 });
    await expect(rewardsLink).toBeVisible();
  });

  test('clicking Reports navigates to reports page', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Click Reports link
    const reportsLink = await selfHealingLocator(page, [
      () => page.getByRole('link', { name: /Reports/i }),
      () => page.getByText(/Reports/i).first(),
    ], { timeout: 10000 });
    await reportsLink.click();
    await page.waitForLoadState('networkidle');

    // Should navigate to reports page
    await expect(async () => {
      expect(page.url()).toMatch(/reports/);
    }).toPass({ timeout: 15000 });

    // Reports page should have meaningful content
    const reportsHeader = await selfHealingLocator(page, [
      () => page.getByText(/Learning Reports/i),
      () => page.getByText(/Reports/i).first(),
    ], { timeout: 10000 });
    await expect(reportsHeader).toBeVisible();
  });

  test('parent can switch to learner mode from dashboard', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Click "Start Learning as [child]"
    const startLearningBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: new RegExp(`Start Learning as ${learnerName}`, 'i') }),
      () => page.getByText(new RegExp(`Start Learning as ${learnerName}`, 'i')),
      () => page.getByText(/Start Learning as/i).first(),
    ], { timeout: 10000 });
    await startLearningBtn.click();
    await page.waitForLoadState('networkidle');

    // Should navigate away from dashboard to learner view
    await expect(async () => {
      const url = page.url();
      // Either on learner home or select-learner page
      expect(url).toMatch(/\/(lesson|learner|select-learner|progress|goals)/);
    }).toPass({ timeout: 15000 });
  });

  test('How It Works section explains the platform', async ({ page }) => {

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Scroll to How It Works section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');

    // Check for informational content
    await expect(async () => {
      const hasHowItWorks = await page.getByText(/How It Works/i).isVisible().catch(() => false);
      const hasPersonalized = await page.getByText(/Personalized/i).isVisible().catch(() => false);
      const hasProgress = await page.getByText(/Track Progress/i).isVisible().catch(() => false);
      // At least some explanatory content should be visible
      expect(hasHowItWorks || hasPersonalized || hasProgress).toBe(true);
    }).toPass({ timeout: 10000 });
  });
});
