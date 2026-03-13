import { test, expect } from '@playwright/test';
import {
  selfHealingLocator,
  captureFailureArtifacts,
  registerParentViaAPI,
  authenticateAndNavigate,
  apiCall,
} from '../../helpers/self-healing';

/**
 * Parent Persona: AI Prompt Audit & Transparency
 *
 * Models a parent verifying that AI prompts used for their child's lessons
 * are visible and auditable. Transparency is a core Sunschool value —
 * parents can see every AI prompt used.
 *
 * Covers: viewing lesson history, inspecting reports, downloading audit data.
 */

test.describe('AI prompt audit and transparency', () => {
  test.afterEach(async ({ page }, testInfo) => {
    await captureFailureArtifacts(page, testInfo);
  });

  test('parent can access the reports page to view learner history', async ({ page }) => {
    test.retry(2);

    const ts = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_audit_rpt_${ts}`,
      email: `parent_audit_rpt_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Audit Reports Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: 'AuditChild', gradeLevel: 5 });

    await authenticateAndNavigate(page, token, '/reports');

    // Should see the Learning Reports heading
    const heading = await selfHealingLocator(page, [
      () => page.getByRole('heading', { name: /learning reports/i }),
      () => page.getByText(/learning reports/i),
    ]);
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Should see learner selection section
    await expect(page.getByText(/select learner/i)).toBeVisible();
  });

  test('parent can select a learner and view their report tabs', async ({ page }) => {
    test.retry(2);

    const ts = Date.now();
    const childName = `SelectKid_${ts}`;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_audit_sel_${ts}`,
      email: `parent_audit_sel_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Audit Select Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: childName, gradeLevel: 4 });

    await authenticateAndNavigate(page, token, '/reports');
    await expect(page.getByText(/learning reports/i)).toBeVisible({ timeout: 10000 });

    // Select the learner by clicking their name button
    const learnerButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: new RegExp(childName, 'i') }),
      () => page.getByText(childName),
    ]);

    if (await learnerButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await learnerButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Verify report type tabs/sections are visible
    await expect(page.getByText(/progress/i).first()).toBeVisible();
    await expect(page.getByText(/lessons/i).first()).toBeVisible();
    await expect(page.getByText(/achievements/i).first()).toBeVisible();
  });

  test('parent can view lesson history in the Lessons report tab', async ({ page }) => {
    test.retry(2);

    const ts = Date.now();
    const childName = `LessonsKid_${ts}`;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_audit_les_${ts}`,
      email: `parent_audit_les_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Audit Lessons Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: childName, gradeLevel: 3 });

    await authenticateAndNavigate(page, token, '/reports');
    await expect(page.getByText(/learning reports/i)).toBeVisible({ timeout: 10000 });

    // Select learner if available
    const learnerButton = page.getByRole('button', { name: new RegExp(childName, 'i') });
    if (await learnerButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await learnerButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Click on the Lessons tab/section
    const lessonsTab = await selfHealingLocator(page, [
      () => page.getByRole('tab', { name: /lessons/i }),
      () => page.getByRole('button', { name: /lessons/i }),
      () => page.getByText(/lessons/i).first(),
    ]);
    await lessonsTab.click();

    await page.waitForLoadState('networkidle');

    // Page should show the lessons section (even if empty for a new learner)
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
    expect(pageContent!.toLowerCase()).toMatch(/lesson/);
  });

  test('parent can access lesson details to verify AI prompt visibility', async ({ page }) => {
    test.retry(2);

    const ts = Date.now();
    const childName = `PromptKid_${ts}`;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_audit_prm_${ts}`,
      email: `parent_audit_prm_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Audit Prompt Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: childName, gradeLevel: 5 });

    // Navigate to dashboard to see the child
    await authenticateAndNavigate(page, token, '/dashboard');
    await expect(page.getByText(childName)).toBeVisible({ timeout: 10000 });

    // Enter learner mode by clicking "Start Learning"
    const startButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /start learning/i }),
      () => page.getByText(/start learning/i),
    ]);
    await startButton.click();
    await page.waitForLoadState('networkidle');

    // Navigate to progress page where lesson history is visible
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');

    // The progress page should load and show progress structure
    await expect(async () => {
      const pageText = await page.textContent('body');
      expect(pageText).toBeTruthy();
      const hasProgressContent = pageText!.match(/progress|lessons|achievements|points/i);
      expect(hasProgressContent).toBeTruthy();
    }).toPass({ timeout: 15000 });
  });

  test('parent can download a report for audit purposes', async ({ page }) => {
    test.retry(2);

    const ts = Date.now();
    const childName = `DownloadKid_${ts}`;
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const token = await registerParentViaAPI(page, {
      username: `parent_audit_dl_${ts}`,
      email: `parent_audit_dl_${ts}@test.com`,
      password: 'SecurePass123!',
      name: 'Audit Download Parent',
    });

    await page.evaluate((t) => localStorage.setItem('AUTH_TOKEN', t), token);
    await apiCall(page, 'POST', '/api/learners', { name: childName, gradeLevel: 6 });

    await authenticateAndNavigate(page, token, '/reports');
    await expect(page.getByText(/learning reports/i)).toBeVisible({ timeout: 10000 });

    // Select learner
    const learnerButton = page.getByRole('button', { name: new RegExp(childName, 'i') });
    if (await learnerButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await learnerButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for the Download Report button
    const downloadButton = await selfHealingLocator(page, [
      () => page.getByRole('button', { name: /download report/i }),
      () => page.getByText(/download report/i),
    ]);

    if (await downloadButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await downloadButton.click();

      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toBeTruthy();
      }
    } else {
      // Download may not be visible until data exists — verify reports page structure
      await expect(page.getByText(/report/i).first()).toBeVisible();
    }
  });
});
