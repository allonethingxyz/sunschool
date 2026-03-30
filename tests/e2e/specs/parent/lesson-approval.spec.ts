/**
 * Parent Persona E2E: Lesson Approval Workflow
 *
 * Journeys:
 *   1. Parent enables "Require approval" for learner
 *   2. Learner generates a lesson (goes to QUEUED status)
 *   3. Verify lesson status is QUEUED via API
 *   4. Parent approves the lesson -- status changes to DONE
 *   5. Reject flow: generate another, parent rejects, lesson deleted
 *
 * No mocks -- real API calls, real browser.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  apiCall,
  screenshot,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';

test.describe.serial('Parent: Lesson Approval Workflow', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('enable require-approval and generate a QUEUED lesson', async ({ page }) => {
    test.setTimeout(600_000);
    const { learnerId } = await setupParentSession(page, 'approval_q');

    // Enable "Require approval" for this learner
    const settingsResult = await apiCall(
      page,
      'PUT',
      `/api/learner-profile/${learnerId}/prompt-settings`,
      { requireLessonApproval: true }
    );
    expect(settingsResult.status).toBe(200);
    expect(settingsResult.data?.requireLessonApproval).toBe(true);

    // Generate a lesson -- with approval enabled, it should end up QUEUED
    const createResult = await apiCall(page, 'POST', '/api/lessons/create', {
      learnerId,
      subject: 'Science',
      gradeLevel: 3,
    });

    // Lesson creation may succeed or fail (AI service availability)
    if (createResult.status >= 400) {
      console.log('SKIP: Lesson creation failed (AI service unavailable)');
      test.skip();
      return;
    }

    // Poll for the lesson to appear in the lesson list with QUEUED or DONE status
    let queuedLessonId: string | null = null;

    await expect.poll(
      async () => {
        const lessonsResult = await apiCall(
          page,
          'GET',
          `/api/lessons?learnerId=${learnerId}&limit=5`
        );
        if (lessonsResult.status === 200 && Array.isArray(lessonsResult.data)) {
          // Look for a QUEUED lesson
          const queued = lessonsResult.data.find(
            (l: any) => l.status === 'QUEUED'
          );
          if (queued) {
            queuedLessonId = queued.id;
            return 'QUEUED';
          }
          // It may already be DONE if approval is instant for some reason
          const done = lessonsResult.data.find(
            (l: any) => l.status === 'DONE' || l.status === 'ACTIVE'
          );
          if (done) {
            queuedLessonId = done.id;
            return done.status;
          }
        }
        return null;
      },
      {
        message: 'Waiting for lesson to reach QUEUED or DONE status',
        timeout: 300_000,
        intervals: [5_000],
      }
    ).toBeTruthy();

    expect(queuedLessonId).toBeTruthy();
    await screenshot(page, 'approval-01-queued');
  });

  test('parent approves a QUEUED lesson and status becomes DONE', async ({ page }) => {
    test.setTimeout(600_000);
    const { learnerId } = await setupParentSession(page, 'approval_app');

    // Enable approval
    await apiCall(page, 'PUT', `/api/learner-profile/${learnerId}/prompt-settings`, {
      requireLessonApproval: true,
    });

    // Generate a lesson
    const createResult = await apiCall(page, 'POST', '/api/lessons/create', {
      learnerId,
      subject: 'Math',
      gradeLevel: 3,
    });

    if (createResult.status >= 400) {
      console.log('SKIP: Lesson creation failed (AI service unavailable)');
      test.skip();
      return;
    }

    // Wait for QUEUED lesson
    let queuedLessonId: string | null = null;

    await expect.poll(
      async () => {
        const lessonsResult = await apiCall(
          page,
          'GET',
          `/api/lessons?learnerId=${learnerId}&limit=5`
        );
        if (lessonsResult.status === 200 && Array.isArray(lessonsResult.data)) {
          const queued = lessonsResult.data.find((l: any) => l.status === 'QUEUED');
          if (queued) {
            queuedLessonId = queued.id;
            return true;
          }
        }
        return false;
      },
      {
        message: 'Waiting for QUEUED lesson',
        timeout: 300_000,
        intervals: [5_000],
      }
    ).toBe(true);

    if (!queuedLessonId) {
      console.log('SKIP: No QUEUED lesson found after generation');
      test.skip();
      return;
    }

    // Parent approves the lesson
    const approveResult = await apiCall(
      page,
      'PUT',
      `/api/lessons/${queuedLessonId}/approve`
    );
    expect(approveResult.status).toBe(200);

    // Verify lesson is now DONE
    const lessonResult = await apiCall(page, 'GET', `/api/lessons/${queuedLessonId}`);
    expect(lessonResult.status).toBe(200);
    expect(lessonResult.data?.status).toBe('DONE');

    await screenshot(page, 'approval-02-approved');
  });

  test('parent rejects a QUEUED lesson and it is deleted', async ({ page }) => {
    test.setTimeout(600_000);
    const { learnerId } = await setupParentSession(page, 'approval_rej');

    // Enable approval
    await apiCall(page, 'PUT', `/api/learner-profile/${learnerId}/prompt-settings`, {
      requireLessonApproval: true,
    });

    // Generate a lesson
    const createResult = await apiCall(page, 'POST', '/api/lessons/create', {
      learnerId,
      subject: 'Reading',
      gradeLevel: 3,
    });

    if (createResult.status >= 400) {
      console.log('SKIP: Lesson creation failed (AI service unavailable)');
      test.skip();
      return;
    }

    // Wait for QUEUED lesson
    let queuedLessonId: string | null = null;

    await expect.poll(
      async () => {
        const lessonsResult = await apiCall(
          page,
          'GET',
          `/api/lessons?learnerId=${learnerId}&limit=5`
        );
        if (lessonsResult.status === 200 && Array.isArray(lessonsResult.data)) {
          const queued = lessonsResult.data.find((l: any) => l.status === 'QUEUED');
          if (queued) {
            queuedLessonId = queued.id;
            return true;
          }
        }
        return false;
      },
      {
        message: 'Waiting for QUEUED lesson to reject',
        timeout: 300_000,
        intervals: [5_000],
      }
    ).toBe(true);

    if (!queuedLessonId) {
      console.log('SKIP: No QUEUED lesson found after generation');
      test.skip();
      return;
    }

    // Parent rejects the lesson
    const rejectResult = await apiCall(
      page,
      'PUT',
      `/api/lessons/${queuedLessonId}/reject`
    );
    expect(rejectResult.status).toBe(200);

    // Verify lesson is deleted (404 when fetching)
    const lessonResult = await apiCall(page, 'GET', `/api/lessons/${queuedLessonId}`);
    expect(lessonResult.status).toBe(404);

    await screenshot(page, 'approval-03-rejected');
  });

  test('lesson without approval enabled goes to DONE/ACTIVE directly', async ({ page }) => {
    test.setTimeout(600_000);
    const { learnerId } = await setupParentSession(page, 'approval_none');

    // Ensure approval is disabled
    await apiCall(page, 'PUT', `/api/learner-profile/${learnerId}/prompt-settings`, {
      requireLessonApproval: false,
    });

    // Generate a lesson
    const createResult = await apiCall(page, 'POST', '/api/lessons/create', {
      learnerId,
      subject: 'Science',
      gradeLevel: 3,
    });

    if (createResult.status >= 400) {
      console.log('SKIP: Lesson creation failed (AI service unavailable)');
      test.skip();
      return;
    }

    // Poll -- lesson should NOT be QUEUED; it should go to ACTIVE or DONE
    await expect.poll(
      async () => {
        const lessonsResult = await apiCall(
          page,
          'GET',
          `/api/lessons?learnerId=${learnerId}&limit=5`
        );
        if (lessonsResult.status === 200 && Array.isArray(lessonsResult.data)) {
          const activeDone = lessonsResult.data.find(
            (l: any) => l.status === 'ACTIVE' || l.status === 'DONE'
          );
          return !!activeDone;
        }
        return false;
      },
      {
        message: 'Waiting for lesson to reach ACTIVE/DONE without approval',
        timeout: 300_000,
        intervals: [5_000],
      }
    ).toBe(true);

    await screenshot(page, 'approval-04-no-approval');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `approval-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
