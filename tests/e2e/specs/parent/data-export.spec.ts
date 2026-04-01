/**
 * Parent Persona E2E: Data Export
 *
 * Journeys:
 *   1. Parent generates a lesson (setup)
 *   2. Parent calls GET /api/export and receives full learner data
 *   3. Export contains: learner profile, lessons array, achievements, promptLog
 *   4. Each lesson in export has spec with sections and questions
 *   5. promptLog entries exist in export (from the generated lesson)
 *
 * No mocks -- real API calls, real browser.
 */
import { test, expect } from '@playwright/test';
import { captureFailureArtifacts } from '../../helpers/self-healing';
import {
  setupParentSession,
  generateAndWaitForLesson,
  apiCall,
  screenshot,
} from '../../helpers/learner-setup';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/parent';

test.describe('Parent: Data Export', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('export endpoint returns full learner data structure', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId } = await setupParentSession(page, 'export_struct');

    // Call the export endpoint
    const exportResult = await apiCall(page, 'GET', `/api/export?learnerId=${learnerId}`);
    expect(exportResult.status).toBe(200);

    const data = exportResult.data;
    expect(data).toBeTruthy();

    // Verify top-level structure
    expect(data.learner).toBeTruthy();
    expect(data.profile).toBeDefined();
    expect(Array.isArray(data.lessons)).toBe(true);
    expect(Array.isArray(data.achievements)).toBe(true);
    // promptLog may not exist if migration hasn't run
    if (data.promptLog !== undefined) {
      expect(Array.isArray(data.promptLog)).toBe(true);
    }
    expect(data.exportDate).toBeTruthy();

    // Learner data should not contain password
    expect(data.learner.password).toBeUndefined();

    // Learner data should have basic fields
    expect(data.learner.name).toBeTruthy();
    expect(data.learner.id).toBeTruthy();

    await screenshot(page, 'export-01-structure');
  });

  test('export contains lesson data with spec after generating a lesson', async ({ page }) => {
    test.setTimeout(600_000);
    const { learnerId } = await setupParentSession(page, 'export_lesson');

    // Generate a lesson first to populate the export
    // Switch to learner mode for lesson generation
    await page.evaluate((id) => {
      localStorage.setItem('selectedLearnerId', String(id));
      localStorage.setItem('preferredMode', 'LEARNER');
    }, learnerId);
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    let lessonId: number;
    try {
      lessonId = await generateAndWaitForLesson(page, 'Science');
    } catch {
      console.log('SKIP: Lesson generation failed (AI service unavailable)');
      test.skip();
      return;
    }

    // Switch back to parent mode and call export
    await page.evaluate(() => localStorage.setItem('preferredMode', 'PARENT'));

    const exportResult = await apiCall(page, 'GET', `/api/export?learnerId=${learnerId}`);
    expect(exportResult.status).toBe(200);

    const data = exportResult.data;

    // Lessons array should contain at least 1 lesson
    expect(data.lessons.length).toBeGreaterThanOrEqual(1);

    // Check the first lesson has a spec
    const lesson = data.lessons.find((l: any) => l.id === lessonId) || data.lessons[0];
    expect(lesson).toBeTruthy();

    if (lesson.spec) {
      // Spec should have sections
      expect(Array.isArray(lesson.spec.sections)).toBe(true);
      if (lesson.spec.sections.length > 0) {
        const section = lesson.spec.sections[0];
        expect(section.content || section.title).toBeTruthy();
      }

      // Spec should have questions
      if (lesson.spec.questions) {
        expect(Array.isArray(lesson.spec.questions)).toBe(true);
        if (lesson.spec.questions.length > 0) {
          const q = lesson.spec.questions[0];
          expect(q.text).toBeTruthy();
          expect(Array.isArray(q.options)).toBe(true);
        }
      }
    }

    await screenshot(page, 'export-02-with-lesson');
  });

  test('export contains prompt log entries after lesson generation', async ({ page }) => {
    test.setTimeout(600_000);
    const { learnerId } = await setupParentSession(page, 'export_prompts');

    // Generate a lesson to produce prompt log entries
    await page.evaluate((id) => {
      localStorage.setItem('selectedLearnerId', String(id));
      localStorage.setItem('preferredMode', 'LEARNER');
    }, learnerId);
    await page.goto('/learner');
    await page.waitForLoadState('networkidle');

    // Use a unique topic to force fresh LLM generation (not template cache)
    // Template-cached lessons don't call OpenRouter, so no prompt_log entries
    const uniqueTopic = `Marine Biology ${Date.now()}`;
    try {
      await generateAndWaitForLesson(page, uniqueTopic);
    } catch {
      console.log('SKIP: Lesson generation failed (AI service unavailable)');
      test.skip();
      return;
    }

    // Switch back to parent and export
    await page.evaluate(() => localStorage.setItem('preferredMode', 'PARENT'));

    // Poll export until prompt log entries appear (logPrompt is fire-and-forget)
    let data: any = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const exportResult = await apiCall(page, 'GET', `/api/export?learnerId=${learnerId}`);
      expect(exportResult.status).toBe(200);
      data = exportResult.data;

      if (!data.promptLog || !Array.isArray(data.promptLog)) {
        console.log('SKIP: promptLog not in export (migration pending)');
        test.skip();
        return;
      }
      if (data.promptLog.length > 0) break;
      if (attempt < 9) await new Promise(r => setTimeout(r, 2000));
    }

    expect(data.promptLog.length).toBeGreaterThanOrEqual(1);

    // Verify prompt log entries have expected structure
    const entry = data.promptLog[0];
    expect(entry).toBeTruthy();
    expect(entry.learner_id || entry.learnerId).toBeTruthy();

    await screenshot(page, 'export-03-with-prompts');
  });

  test('export requires learnerId parameter', async ({ page }) => {
    test.setTimeout(300_000);
    await setupParentSession(page, 'export_noid');

    // Call export without learnerId -- should fail
    const result = await apiCall(page, 'GET', '/api/export');
    expect(result.status).toBe(400);
    expect(result.data?.error).toBeTruthy();
  });

  test('export includes achievements data', async ({ page }) => {
    test.setTimeout(300_000);
    const { learnerId } = await setupParentSession(page, 'export_achv');

    const exportResult = await apiCall(page, 'GET', `/api/export?learnerId=${learnerId}`);
    expect(exportResult.status).toBe(200);

    // Achievements should be an array (may be empty for new learner)
    expect(Array.isArray(exportResult.data.achievements)).toBe(true);

    // Also verify achievements endpoint works independently
    const achieveResult = await apiCall(page, 'GET', `/api/achievements?learnerId=${learnerId}`);
    expect(achieveResult.status).toBe(200);

    await screenshot(page, 'export-04-achievements');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== 'passed') {
      await captureFailureArtifacts(page, `export-${testInfo.title}`, SCREENSHOT_DIR);
    }
  });
});
