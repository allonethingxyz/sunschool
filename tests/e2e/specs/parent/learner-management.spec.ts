import { test, expect } from '@playwright/test';
import {
  selfHealingLocator,
  captureFailureArtifacts,
  registerParentViaAPI,
  authenticateAndNavigate,
  apiCall,
} from '../../helpers/self-healing';

/**
 * Parent Persona: Learner Management
 *
 * Models a parent adding, editing, and viewing their child learner accounts.
 * Covers: add learner (inline & dedicated page), view list, edit grade, navigate.
 */

test.describe('Learner management', () => {
  test.describe.configure({ retries: 2 });

  test.afterEach(async ({ page }, testInfo) => {
    await captureFailureArtifacts(page, testInfo);
  });

  test('parent can add a child from the dashboard inline form', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_inline_${ts}`,
      email: `parent_inline_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Inline Parent',
    });

    await authenticateAndNavigate(page, token, '/dashboard');

    // First-time parent should see the inline add child form
    await expect(page.getByText(/add your child to get started/i)).toBeVisible({ timeout: 10000 });

    // Fill child name
    const nameInput = await selfHealingLocator(page, [
      () => page.getByLabel(/child.?s name/i),
      () => page.getByPlaceholder(/name/i),
      () => page.getByRole('textbox').first(),
    ]);
    await nameInput.fill('First Child');

    // Select a grade level
    const grade5 = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: '5' }),
      () => page.getByText('5'),
    ], { timeout: 3000 });
    await grade5.click();

    // Submit
    const addButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: 'Add Child' }),
      () => page.getByText('Add Child'),
    ]);
    await addButton.click();

    await page.waitForLoadState('networkidle');

    // Verify child appears on dashboard
    await expect(async () => {
      await expect(page.getByText('First Child')).toBeVisible();
    }).toPass({ timeout: 15000 });
  });

  test('parent can add a child via the add learner page', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_addpage_${ts}`,
      email: `parent_addpage_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Add Page Parent',
    });

    await authenticateAndNavigate(page, token, '/add-learner');

    // Should see the add child form
    await expect(page.getByText(/add child/i).first()).toBeVisible({ timeout: 10000 });

    // Fill in child's name
    const nameField = await selfHealingLocator(page, [
      () => page.getByLabel(/child.?s name/i),
      () => page.getByPlaceholder(/name/i),
      () => page.getByRole('textbox').first(),
    ]);
    await nameField.fill('Page Child');

    // Select grade 3
    const grade3 = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: '3' }),
      () => page.getByText('3'),
    ], { timeout: 3000 });
    await grade3.click();

    // Submit
    const submitButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: 'Add Child' }),
      () => page.getByText('Add Child'),
    ]);
    await submitButton.click();

    await page.waitForLoadState('networkidle');

    // Should show the new child
    await expect(async () => {
      await expect(page.getByText('Page Child')).toBeVisible();
    }).toPass({ timeout: 15000 });
  });

  test('parent can view the list of learners on the dashboard', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_list_${ts}`,
      email: `parent_list_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'List Parent',
    });

    // Create two children via API
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'Alice', gradeLevel: 3 });
    await apiCall(page, 'POST', '/api/learners', { name: 'Bob', gradeLevel: 7 });

    await authenticateAndNavigate(page, token, '/dashboard');

    // Both children should be visible
    await expect(page.getByText('Alice')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Bob')).toBeVisible({ timeout: 10000 });

    // Verify grade info is displayed
    await expect(page.getByText(/grade/i).first()).toBeVisible();

    // Verify "Start Learning" buttons exist
    await expect(page.getByRole('button', { name: /start learning/i }).first()).toBeVisible();
  });

  test('parent can edit a learner grade level', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_edit_${ts}`,
      email: `parent_edit_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Edit Parent',
    });

    // Create a child via API
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'Charlie', gradeLevel: 4 });

    // Navigate to learners management page
    await authenticateAndNavigate(page, token, '/learners');

    // Find and click the edit grade button
    const editButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /edit grade/i }),
      () => page.getByText(/edit grade/i),
    ]);
    await editButton.click();

    // Modal should appear with grade update form
    await expect(page.getByText(/update grade level/i)).toBeVisible({ timeout: 5000 });

    // Select a new grade (grade 6)
    const grade6 = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: '6' }),
      () => page.getByText('6'),
    ], { timeout: 3000 });
    await grade6.click();

    // Click update
    const updateButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /update grade/i }),
      () => page.getByText(/update grade/i),
    ]);
    await updateButton.click();

    await page.waitForLoadState('networkidle');

    // Verify the updated grade is reflected
    await expect(async () => {
      await expect(page.getByText(/grade 6/i)).toBeVisible();
    }).toPass({ timeout: 10000 });
  });

  test('parent can navigate from dashboard to add another child', async ({ page }) => {

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_nav_${ts}`,
      email: `parent_nav_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Nav Parent',
    });

    // Create one child via API
    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'Diana', gradeLevel: 2 });

    await authenticateAndNavigate(page, token, '/dashboard');

    // Should see existing child
    await expect(page.getByText('Diana')).toBeVisible({ timeout: 10000 });

    // Click "Add Child" link/button
    const addChildLink = await selfHealingLocator(page, [
      () => page.getByRole('link', { name: /add.*child/i }),
      () => page.getByRole('button', { name: /add.*child/i }),
      () => page.getByText(/add.*child/i).first(),
    ]);
    await addChildLink.click();

    await page.waitForLoadState('networkidle');

    // Should navigate to add learner page
    await expect(async () => {
      await expect(page.getByText(/add child/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });
  });
});
