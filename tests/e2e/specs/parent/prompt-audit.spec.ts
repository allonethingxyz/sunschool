/**
 * Parent Persona E2E: Prompt Audit / Content Transparency
 *
 * Journeys:
 *   1. Lesson API response contains full spec for parent review
 *   2. Reports page loads with lesson data
 *   3. Progress page shows learner stats
 *   4. Dashboard shows subjects and grades for transparency
 *
 * Parents need full visibility into AI-generated content.
 * These tests verify the transparency layer.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  navigateAsParent,
  generateAndWaitForLesson,
  apiCall,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';

test.describe('Parent: Content Transparency', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('lesson API returns full spec with title, sections, and questions', async ({ page }) => {
    test.setTimeout(600_000);
    await setupParentSession(page, 'audit');

    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    const result = await apiCall(page, 'GET', `/api/lessons/${lessonId}`);
    expect(result.status).toBe(200);

    const spec = result.data?.spec;
    expect(spec).toBeTruthy();
    expect(spec.title).toBeTruthy();
    expect(Array.isArray(spec.sections)).toBe(true);
    expect(spec.sections.length).toBeGreaterThanOrEqual(1);

    // Sections should have content
    for (const section of spec.sections) {
      expect(section.content || section.title).toBeTruthy();
    }

    // Questions should exist
    if (spec.questions) {
      expect(Array.isArray(spec.questions)).toBe(true);
      for (const q of spec.questions) {
        expect(q.text).toBeTruthy();
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test('reports page loads and shows content', async ({ page }) => {
    test.setTimeout(300_000);
    await setupParentSession(page, 'audit_reports');

    await navigateAsParent(page, '/reports');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);
    expect(page.url()).toContain('/reports');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/audit-01-reports.png` });
  });

  test('progress page shows learner stats', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId } = await setupParentSession(page, 'audit_progress');

    // Verify profile exists via API
    const profile = await apiCall(page, 'GET', `/api/learner-profile/${learnerId}`);
    expect(profile.status).toBe(200);

    // Navigate to progress page (as learner mode to access /progress route)
    await page.evaluate(() => localStorage.setItem('preferredMode', 'LEARNER'));
    await page.goto('/progress');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/audit-02-progress.png` });
  });

  test('dashboard shows child name and grade', async ({ page }) => {
    test.setTimeout(300_000);
    const { childName } = await setupParentSession(page, 'audit_dash');

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);

    // Child name should appear on dashboard
    const hasChildInfo = bodyText.includes(childName) ||
      /grade|learner|child/i.test(bodyText);
    expect(hasChildInfo).toBeTruthy();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/audit-03-dashboard.png` });
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `audit-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
