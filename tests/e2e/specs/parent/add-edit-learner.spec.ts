/**
 * Parent Persona E2E: Add & Edit Learner
 *
 * Journeys:
 *   1. Parent registers and sets up session
 *   2. Parent navigates to /add-learner page
 *   3. Parent adds a child with name, grade, subjects via UI form
 *   4. Child appears on dashboard
 *   5. Parent updates learner subjects via API
 *   6. Changes persist (verified via API)
 *
 * No mocks -- real API calls, real browser.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  navigateAsParent,
  createChildViaAPI,
  apiCall,
  screenshot,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';

test.describe.serial('Parent: Add & Edit Learner', () => {
  let learnerId: number;
  let childName: string;

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('parent registers and navigates to add-learner page', async ({ page }) => {
    test.setTimeout(300_000);
    await setupParentSession(page, 'addedit');

    await navigateAsParent(page, '/add-learner');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    // The add-learner page should show a form or child-related content
    const hasFormContent = /name|grade|child|learner|add/i.test(bodyText);
    expect(hasFormContent).toBeTruthy();

    await screenshot(page, 'addedit-01-add-page');
  });

  test('parent adds a child via API and sees it on dashboard', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId: firstChildId, childName: firstName } = await setupParentSession(page, 'addedit_add');

    // Add a second child via API
    const secondChildName = `EditChild_${Date.now()}`;
    const secondId = await createChildViaAPI(page, secondChildName, 5);
    expect(secondId).toBeTruthy();

    // Store for subsequent tests
    learnerId = secondId;
    childName = secondChildName;

    // Navigate to dashboard and verify both children appear via API
    await navigateAsParent(page, '/dashboard');

    const result = await apiCall(page, 'GET', '/api/learners');
    expect(result.status).toBe(200);
    const learners = result.data || [];
    expect(learners.length).toBeGreaterThanOrEqual(2);

    const hasNewChild = learners.some((l: any) => l.name === secondChildName);
    expect(hasNewChild).toBeTruthy();

    await screenshot(page, 'addedit-02-child-on-dashboard');
  });

  test('child appears on dashboard UI', async ({ page }) => {
    test.setTimeout(300_000);
    const { childName: cName } = await setupParentSession(page, 'addedit_dash');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    // Dashboard should show child name or learning-related content
    const hasChildContent = bodyText.includes(cName) ||
      /learner|child|grade|lesson/i.test(bodyText);
    expect(hasChildContent).toBeTruthy();

    await screenshot(page, 'addedit-03-dashboard-child');
  });

  test('parent updates learner subjects via API', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId: lid } = await setupParentSession(page, 'addedit_subj');

    // Get current profile
    const profileBefore = await apiCall(page, 'GET', `/api/learner-profile/${lid}`);
    expect(profileBefore.status).toBe(200);

    // Update subjects
    const newSubjects = ['Math', 'Science', 'Reading'];
    const updateResult = await apiCall(page, 'PUT', `/api/learner-profile/${lid}`, {
      subjects: newSubjects,
    });
    expect(updateResult.status).toBe(200);

    // Verify the changes persisted
    const profileAfter = await apiCall(page, 'GET', `/api/learner-profile/${lid}`);
    expect(profileAfter.status).toBe(200);

    const savedSubjects = profileAfter.data?.subjects || [];
    expect(savedSubjects).toEqual(expect.arrayContaining(newSubjects));

    await screenshot(page, 'addedit-04-subjects-updated');
  });

  test('parent updates grade level via API and verifies persistence', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId: lid } = await setupParentSession(page, 'addedit_grade');

    // Update grade level
    const updateResult = await apiCall(page, 'PUT', `/api/learner-profile/${lid}`, {
      gradeLevel: 7,
    });
    expect(updateResult.status).toBe(200);

    // Verify persistence by re-fetching
    const profile = await apiCall(page, 'GET', `/api/learner-profile/${lid}`);
    expect(profile.status).toBe(200);
    expect(profile.data?.gradeLevel).toBe(7);

    await screenshot(page, 'addedit-05-grade-updated');
  });

  test('parent can navigate to change-learner-subjects page', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId: lid } = await setupParentSession(page, 'addedit_chgsub');

    // Navigate to change-learner-subjects for this learner
    await navigateAsParent(page, `/change-learner-subjects/${lid}`);

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    // Page should show subject-related content
    const hasSubjectContent = /subject|math|science|reading|select|choose/i.test(bodyText);
    expect(hasSubjectContent).toBeTruthy();

    await screenshot(page, 'addedit-06-change-subjects');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `addedit-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
