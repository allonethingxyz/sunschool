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
 * Parent Persona: Learner Management
 *
 * Models the parent journey of adding children, editing profiles,
 * and viewing the learner list.
 */

const ts = Date.now();

test.describe('Learner Management', () => {
  let token: string;
  const parentUser = {
    username: `parent_learner_mgmt_${ts}`,
    email: `parent_learner_mgmt_${ts}@test.com`,
    password: 'TestPassword123!',
    name: 'Learner Mgmt Parent',
  };

  test.beforeEach(async ({ page }) => {
    // Register parent via API if not already done, then authenticate
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    try {
      token = await registerParentViaAPI(page, parentUser);
    } catch {
      // Already registered — login instead
      const result = await page.evaluate(async (creds) => {
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creds),
        });
        const data = await res.json();
        return { token: data.token };
      }, { username: parentUser.username, password: parentUser.password });
      token = result.token;
    }
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await captureFailureArtifacts(page, testInfo);
  });

  test('add a child learner from the dashboard', async ({ page }) => {
    test.retry(2);

    // Click "Add Child" or "Add Another Child" button
    const addChildBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /Add.*Child/i }),
      () => page.getByRole('link', { name: /Add.*Child/i }),
      () => page.getByText(/Add.*Child/i).first(),
    ]);
    await addChildBtn.click();
    await page.waitForLoadState('networkidle');

    const childName = `TestChild_${ts}`;

    // Fill in the child's name
    const nameInput = await selfHealingLocator(page, [
      () => page.getByPlaceholder(/child.*name/i),
      () => page.getByPlaceholder(/learner.*name/i),
      () => page.getByPlaceholder(/Enter.*name/i),
      () => page.getByLabel(/Child.*Name/i),
    ]);
    await nameInput.fill(childName);

    // Select a grade level (grade 5)
    const gradeBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: '5', exact: true }),
      () => page.getByText('5', { exact: true }).first(),
    ]);
    await gradeBtn.click();

    // Submit the form
    const submitBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /Add Child/i }),
      () => page.getByRole('button', { name: /Create.*Learner/i }),
      () => page.getByRole('button', { name: /Create.*Account/i }),
    ]);
    await submitBtn.click();

    // Verify the child was created — should see the child's name somewhere
    await expect(async () => {
      const result = await apiCall(page, 'GET', '/api/learners') as { status: number; data: Array<{ name: string }> };
      expect(result.status).toBe(200);
      const childExists = (result.data as Array<{ name: string }>).some(
        (l) => l.name === childName,
      );
      expect(childExists).toBe(true);
    }).toPass({ timeout: 15000 });
  });

  test('view learner list on the learners page', async ({ page }) => {
    test.retry(2);

    // Create a child via API first to ensure data exists
    const listChildName = `ListChild_${ts}`;
    await apiCall(page, 'POST', '/api/learners', {
      name: listChildName,
      gradeLevel: 3,
    });

    // Navigate to learners management page
    await authenticateAndNavigate(page, token, '/learners');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // The child name should be visible on the page
    const childText = await selfHealingLocator(page, [
      () => page.getByText(listChildName),
    ], { timeout: 15000 });
    await expect(childText).toBeVisible();

    // Grade level should also be visible
    await expect(async () => {
      const gradeVisible =
        await page.getByText(/Grade 3/i).isVisible().catch(() => false) ||
        await page.getByText('3').isVisible().catch(() => false);
      expect(gradeVisible).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test('edit learner grade level', async ({ page }) => {
    test.retry(2);

    // Create a child via API
    const editChildName = `EditChild_${ts}`;
    const createResult = await apiCall(page, 'POST', '/api/learners', {
      name: editChildName,
      gradeLevel: 4,
    }) as { status: number; data: { id: number } };

    // Navigate to learners page
    await authenticateAndNavigate(page, token, '/learners');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Wait for child to appear
    await expect(page.getByText(editChildName)).toBeVisible({ timeout: 10000 });

    // Click the Edit Grade button
    const editBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /Edit Grade/i }),
      () => page.getByRole('button', { name: /Edit/i }).first(),
    ]);
    await editBtn.click();

    // A modal should open — select a new grade (e.g. grade 7)
    const newGradeBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: '7', exact: true }),
      () => page.getByText('7', { exact: true }),
    ], { timeout: 5000 });
    await newGradeBtn.click();

    // Confirm the update
    const updateBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /Update Grade/i }),
      () => page.getByRole('button', { name: /Save/i }),
      () => page.getByRole('button', { name: /Update/i }),
    ]);
    await updateBtn.click();

    // Verify the grade was updated via API
    await expect(async () => {
      const result = await apiCall(page, 'GET', '/api/learners') as { status: number; data: Array<{ name: string; gradeLevel: number }> };
      expect(result.status).toBe(200);
      const child = (result.data as Array<{ name: string; gradeLevel: number }>).find(
        (l) => l.name === editChildName,
      );
      expect(child).toBeTruthy();
      expect(child!.gradeLevel).toBe(7);
    }).toPass({ timeout: 10000 });
  });

  test('dashboard shows child cards with stats', async ({ page }) => {
    test.retry(2);

    // Create a child via API to guarantee at least one exists
    const dashChildName = `DashChild_${ts}`;
    await apiCall(page, 'POST', '/api/learners', {
      name: dashChildName,
      gradeLevel: 6,
    });

    // Navigate to dashboard
    await authenticateAndNavigate(page, token, '/dashboard');
    await page.waitForLoadState('networkidle');
    await dismissModals(page);

    // Child name should appear in a card
    const childCard = await selfHealingLocator(page, [
      () => page.getByText(dashChildName),
    ], { timeout: 15000 });
    await expect(childCard).toBeVisible();

    // Should see "Start Learning as [Name]" button
    const startLearningBtn = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: new RegExp(`Start Learning as ${dashChildName}`, 'i') }),
      () => page.getByText(new RegExp(`Start Learning as ${dashChildName}`, 'i')),
      () => page.getByText(/Start Learning as/i).first(),
    ], { timeout: 10000 });
    await expect(startLearningBtn).toBeVisible();

    // Stats labels should be present (Lessons, Achievements, etc.)
    await expect(async () => {
      const hasStats =
        await page.getByText(/Lessons/i).first().isVisible().catch(() => false) ||
        await page.getByText(/Achievements/i).first().isVisible().catch(() => false);
      expect(hasStats).toBe(true);
    }).toPass({ timeout: 10000 });
  });
});
