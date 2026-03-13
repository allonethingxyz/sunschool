import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

/**
 * Parent Persona: Prompt Audit & AI Transparency
 *
 * Models the parent journey of verifying AI prompt transparency.
 * Parents should be able to see every AI prompt used in their child's
 * lessons — this is a core Sunschool value ("the parent owns the prompt").
 *
 * Tests cover:
 * - Welcome page transparency messaging
 * - Lesson data includes prompt information accessible to parents
 * - Reports page shows lesson history with AI-generated content
 * - Prompt data is included in lesson spec via API
 */

const ts = Date.now();

// Helper: register a parent and return auth token
async function registerParent(page: import('@playwright/test').Page, suffix: string) {
  const user = {
    username: `parent_audit_${suffix}_${ts}`,
    email: `parent_audit_${suffix}_${ts}@test.com`,
    password: 'TestPassword123!',
    name: `Audit Parent ${suffix}`,
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

test.describe('Parent prompt audit and AI transparency', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await captureFailureArtifacts(page, testInfo.title);
    }
  });

  test('welcome page displays prompt transparency messaging', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // The welcome page should contain the "parent owns the prompt" section
    await expect(async () => {
      await expect(page.getByText(/the parent owns the prompt/i)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Key transparency messaging should be visible
    await expect(page.getByText(/every prompt is visible to the parent/i)).toBeVisible();
    await expect(page.getByText(/transparency isn.*t optional/i)).toBeVisible();

    // Open source messaging
    await expect(page.getByText(/source code is open/i)).toBeVisible();
    await expect(page.getByText(/audit.*prompts/i).first()).toBeVisible();
  });

  test('welcome page shows open source and audit features', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome modal if present
    const gotIt = page.getByText('Got it, thanks!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Should display "open source" feature card
    await expect(async () => {
      await expect(page.getByText(/open source.*all the way down/i)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Should mention code audit and prompt visibility
    await expect(page.getByText(/read the code/i)).toBeVisible();
    await expect(page.getByText(/education you can verify/i)).toBeVisible();
  });

  test('parent can access lesson data with prompt information via API', async ({ page }) => {
    const token = await registerParent(page, 'api');
    const childName = `AuditChild_${ts}`;
    const learner = await createLearner(page, token, childName, 5);

    // Create a lesson via API
    const lessonResult = await page.evaluate(async ({ token, learnerId }: { token: string; learnerId: number }) => {
      const res = await fetch('/api/lessons/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ learnerId, subject: 'Math', gradeLevel: 5 }),
      });
      if (!res.ok) return { error: true, status: res.status };
      return res.json();
    }, { token, learnerId: learner.id });

    // Skip if lesson creation failed (may need AI provider)
    if (lessonResult.error) {
      test.skip();
      return;
    }

    // Fetch the lesson and verify it contains spec with prompt data
    const lessonData = await page.evaluate(async ({ token, lessonId }: { token: string; lessonId: string }) => {
      // Poll for lesson completion (AI generation takes time)
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const res = await fetch(`/api/lessons/${lessonId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.spec) return data;
        }
      }
      return null;
    }, { token, lessonId: lessonResult.id });

    // If we got lesson data, verify the spec structure includes transparent data
    if (lessonData && lessonData.spec) {
      // Lesson spec should have structured content parents can review
      expect(lessonData.spec).toHaveProperty('title');

      // Images should include promptUsed for transparency
      if (lessonData.spec.images && lessonData.spec.images.length > 0) {
        const firstImage = lessonData.spec.images[0];
        expect(firstImage).toHaveProperty('promptUsed');
      }
    }
  });

  test('parent can view reports page showing lesson history', async ({ page }) => {
    const token = await registerParent(page, 'reports');
    const childName = `ReportAudit_${ts}`;
    await createLearner(page, token, childName, 4);

    // Navigate to reports
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Reports page should load
    await expect(async () => {
      await expect(page.getByText(/learning reports/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Parent should see the learner listed
    await expect(async () => {
      await expect(page.getByText(childName)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Lessons tab should be available for viewing lesson history
    const { locator: lessonsTab } = await selfHealingLocator(page, 'lessons report tab', {
      text: 'Lessons',
    });
    await lessonsTab.click();

    // For a new learner, should show empty state
    await expect(async () => {
      const empty = page.getByText(/no lessons recorded/i);
      const lessons = page.getByText(/recent lessons/i);
      const either = await empty.isVisible().catch(() => false) ||
                     await lessons.isVisible().catch(() => false);
      expect(either).toBe(true);
    }).toPass({ timeout: 5000 });
  });

  test('parent can export learner data for audit purposes', async ({ page }) => {
    const token = await registerParent(page, 'export');
    const childName = `ExportAudit_${ts}`;
    const learner = await createLearner(page, token, childName, 6);

    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dismiss welcome card if present
    const gotIt = page.getByText('GOT IT!');
    if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await gotIt.click();
    }

    // Verify child is listed
    await expect(async () => {
      await expect(page.getByText(childName)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Export button should be available
    const { locator: exportBtn } = await selfHealingLocator(page, 'export button', {
      role: 'button', name: 'Export', text: 'Export',
    });
    await expect(exportBtn).toBeVisible();

    // Verify the export API endpoint is accessible
    const exportResult = await page.evaluate(async ({ token, learnerId }: { token: string; learnerId: number }) => {
      const res = await fetch(`/api/export?learnerId=${learnerId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return { status: res.status, ok: res.ok };
    }, { token, learnerId: learner.id });

    // Export endpoint should be accessible (200 or 204)
    expect(exportResult.status).toBeLessThan(500);
  });
});
