/**
 * Learner Persona E2E: SVG Rendering Verification
 *
 * Verifies that generated lessons contain actual SVG illustrations
 * with real drawing elements — not just placeholder emoji icons.
 * Checks both the API response (spec.images[].svgData) and the
 * rendered DOM for visible SVG paths/circles/text.
 */
import { test, expect, Page } from '@playwright/test';
import {
  setupLearnerSession,
  screenshot,
  generateAndWaitForLesson,
  apiCall,
  waitForLessonLoaded,
  spaNavigate,
} from '../../helpers/learner-setup';

/**
 * Switch to learner mode so LearnerRoute paths render properly.
 * Sets preferredMode in localStorage and reloads to re-initialize ModeContext.
 */
async function switchToLearnerMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('preferredMode', 'LEARNER');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Initializing authentication');
  }, { timeout: 15000 }).catch(() => {});
}

test.describe('Learner: SVG Rendering', () => {
  test.describe.configure({ retries: 2 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(120000);
  });

  test('lesson spec images contain svgData with drawing elements', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'svg_api');

    const lessonId = await generateAndWaitForLesson(page, 'Math');
    expect(lessonId).toBeTruthy();

    // Wait for background image generation to complete
    // Poll the lesson API until images have svgData
    let imagesWithSvg = 0;

    await expect
      .poll(
        async () => {
          const result = await apiCall(page, 'GET', `/api/lessons/${lessonId}`);
          const images = result.data?.spec?.images || [];
          imagesWithSvg = images.filter(
            (img: any) => img.svgData && img.svgData.includes('<svg')
          ).length;
          return imagesWithSvg;
        },
        {
          message: 'Waiting for SVG images to be generated',
          timeout: 180_000,
          intervals: [10_000],
        }
      )
      .toBeGreaterThanOrEqual(1);

    // Verify the SVG content has actual drawing elements (not empty/placeholder)
    const lessonResult = await apiCall(page, 'GET', `/api/lessons/${lessonId}`);
    const images = lessonResult.data?.spec?.images || [];
    const svgImages = images.filter(
      (img: any) => img.svgData && img.svgData.includes('<svg')
    );

    for (const img of svgImages) {
      const svg = img.svgData;

      // SVG must have actual drawing elements
      const hasDrawingElements =
        /<(path|circle|ellipse|polygon|polyline|line|text|rect)\b/i.test(svg);
      expect(
        hasDrawingElements,
        `SVG for image ${img.id} must contain drawing elements (path, circle, text, etc.)`
      ).toBe(true);

      // SVG must not contain dangerous tags (sanitization check)
      expect(svg).not.toContain('<script');
      expect(svg).not.toContain('onclick');
      expect(svg).not.toContain('onerror');
      expect(svg).not.toContain('javascript:');
    }

    await screenshot(page, 'svg-01-api-svgdata');
  });

  test('rendered lesson page shows actual SVG content, not placeholders', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'svg_render');

    const lessonId = await generateAndWaitForLesson(page, 'Science');
    expect(lessonId).toBeTruthy();

    // Wait for background images to generate
    await expect
      .poll(
        async () => {
          const result = await apiCall(page, 'GET', `/api/lessons/${lessonId}`);
          const images = result.data?.spec?.images || [];
          return images.filter(
            (img: any) => img.svgData && img.svgData.includes('<svg')
          ).length;
        },
        {
          message: 'Waiting for SVG images to generate',
          timeout: 180_000,
          intervals: [10_000],
        }
      )
      .toBeGreaterThanOrEqual(1);

    // Switch to learner mode and navigate to the lesson page
    await switchToLearnerMode(page);
    await spaNavigate(page, '/lesson');
    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);

    // Reload to pick up background-generated images
    await page.reload();
    await page.waitForLoadState('networkidle');
    await waitForLessonLoaded(page);

    // Scroll through entire page to render all sections
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < scrollHeight; y += 400) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(300);
    }

    await screenshot(page, 'svg-02-rendered-page');

    // Count inline SVGs that contain actual drawing elements
    const svgStats = await page.evaluate(() => {
      const svgs = document.querySelectorAll('svg');
      let withDrawing = 0;
      let placeholderOnly = 0;

      svgs.forEach((svg) => {
        const html = svg.innerHTML;
        const hasDrawing =
          /<(path|circle|ellipse|polygon|polyline|line)\b/i.test(html);
        const hasText = /<text\b/i.test(html);
        if (hasDrawing || hasText) {
          withDrawing++;
        } else {
          placeholderOnly++;
        }
      });

      return { total: svgs.length, withDrawing, placeholderOnly };
    });

    // At least one SVG with actual drawing content must be rendered
    expect(
      svgStats.withDrawing,
      `Expected rendered SVGs with drawing elements. ` +
        `Found: ${svgStats.withDrawing} with content, ` +
        `${svgStats.placeholderOnly} placeholders, ` +
        `${svgStats.total} total`
    ).toBeGreaterThanOrEqual(1);

    // Majority of SVGs should have real content (not placeholders)
    if (svgStats.total > 1) {
      expect(svgStats.withDrawing).toBeGreaterThan(svgStats.placeholderOnly);
    }
  });

  test('lesson images array preserves all section references after merge', async ({ page }) => {
    test.setTimeout(600_000);
    await setupLearnerSession(page, 'svg_merge');

    const lessonId = await generateAndWaitForLesson(page, 'Math');
    expect(lessonId).toBeTruthy();

    // Get lesson spec
    const result = await apiCall(page, 'GET', `/api/lessons/${lessonId}`);
    const spec = result.data?.spec;
    expect(spec).toBeTruthy();

    // Collect all imageIds referenced by sections
    const referencedIds = new Set<string>();
    for (const section of spec.sections || []) {
      for (const id of section.imageIds || []) {
        referencedIds.add(id);
      }
    }

    // All referenced image IDs must exist in the images array
    const imageIds = new Set(
      (spec.images || []).map((img: any) => img.id)
    );

    const missingIds = [...referencedIds].filter((id) => !imageIds.has(id));
    expect(
      missingIds,
      `Section imageIds reference images not in spec.images: ${missingIds.join(', ')}`
    ).toHaveLength(0);

    // Images array should have at least as many entries as sections
    expect(spec.images?.length).toBeGreaterThanOrEqual(spec.sections?.length || 0);

    await screenshot(page, 'svg-03-image-merge-integrity');
  });
});
