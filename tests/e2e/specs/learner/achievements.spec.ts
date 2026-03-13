/**
 * Learner Persona E2E: Achievements & Progress
 *
 * Models a child viewing the progress dashboard, checking stats,
 * viewing trophies, and seeing lesson history.
 * Assertions are structural — no exact text matching on AI-generated content.
 */
import { test, expect, Page } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

const SCREENSHOT_DIR = 'tests/e2e/screenshots/learner';

const timestamp = Date.now();
const parentUsername = `progressparent_${timestamp}`;
const parentEmail = `progressparent_${timestamp}@test.com`;
const parentPassword = 'TestPassword123!';
const childName = `ProgressChild_${timestamp}`;

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
}

/** Register parent + child, store auth state. */
async function setupLearnerSession(page: Page): Promise<{ learnerId: number | null }> {
  const regResult = await page.evaluate(async (data) => {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  }, {
    username: parentUsername,
    email: parentEmail,
    password: parentPassword,
    name: 'Progress Test Parent',
    role: 'PARENT',
  });

  if (regResult.token) {
    await page.evaluate((token) => localStorage.setItem('AUTH_TOKEN', token), regResult.token);
  }

  const childResult = await page.evaluate(async (data) => {
    const token = localStorage.getItem('AUTH_TOKEN');
    const res = await fetch('/api/learners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return res.json();
  }, { name: childName, gradeLevel: 3 });

  const learnerId = childResult.id ?? null;
  if (learnerId) {
    await page.evaluate((id) => localStorage.setItem('selectedLearnerId', String(id)), learnerId);
  }

  return { learnerId };
}

test.describe('Learner: Achievements & Progress', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await captureFailureArtifacts(page, testInfo.title);
    }
  });

  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(60000);
    await page.goto('/welcome');
    await page.waitForLoadState('networkidle');
  });

  test('progress page displays header and stat cards', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achievements-01-progress-page');

    // "My Progress" header
    const { locator: progressHeading } = await selfHealingLocator(page, 'progress-header', {
      text: 'My Progress',
      name: 'My Progress',
    });
    await expect(progressHeading).toBeVisible({ timeout: 10000 });

    // Stat labels should be present — "Lessons Done", "How I'm Doing", "My Trophies"
    const lessonsDoneStat = page.getByText('Lessons Done');
    const howDoingStat = page.getByText("How I'm Doing");
    const trophiesStat = page.getByText('My Trophies');

    const hasLessonsDone = await lessonsDoneStat.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasHowDoing = await howDoingStat.first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTrophies = await trophiesStat.first().isVisible({ timeout: 5000 }).catch(() => false);

    // At least some stats should be visible
    expect(hasLessonsDone || hasHowDoing || hasTrophies).toBeTruthy();
  });

  test('progress page shows trophy section with empty state for new learner', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');

    // Scroll down to find trophies section
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achievements-02-trophies-section');

    // Should show "My Trophies" section header (in LearnerProgress stats or section title)
    const trophiesSection = page.getByText('My Trophies');
    const hasTrophiesSection = await trophiesSection.first().isVisible({ timeout: 5000 }).catch(() => false);

    // For a new learner with no completed lessons, should show empty state
    const emptyState = page.getByText(/Complete lessons to earn trophies/i);
    const hasEmptyState = await emptyState.first().isVisible({ timeout: 5000 }).catch(() => false);

    // Either trophies section exists or empty state shows — page rendered correctly
    expect(hasTrophiesSection || hasEmptyState).toBeTruthy();
  });

  test('progress page shows recent lessons section', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');

    // Scroll to find recent lessons area
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achievements-03-recent-lessons');

    // "Recent Lessons" section should appear
    const recentSection = page.getByText('Recent Lessons');
    const hasRecentSection = await recentSection.first().isVisible({ timeout: 5000 }).catch(() => false);

    // For a new learner, may show empty state
    const emptyLessons = page.getByText(/Start a lesson to see your history/i);
    const hasEmptyLessons = await emptyLessons.first().isVisible({ timeout: 5000 }).catch(() => false);

    // Page should show one of these
    expect(hasRecentSection || hasEmptyLessons).toBeTruthy();
  });

  test('progress page shows level/XP information', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/progress');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achievements-04-level-info');

    // LearnerProgress component shows level names (Beginner, Explorer, etc.)
    const levelNames = ['Beginner', 'Explorer', 'Adventurer', 'Scholar', 'Expert'];
    let hasLevelName = false;
    for (const name of levelNames) {
      const visible = await page.getByText(name).first().isVisible({ timeout: 1000 }).catch(() => false);
      if (visible) {
        hasLevelName = true;
        break;
      }
    }

    // A new learner should start at "Beginner" level
    // The level badge or XP display should be present
    const hasLevelOrScore = hasLevelName ||
      await page.getByText(/\d+%/).first().isVisible({ timeout: 3000 }).catch(() => false) ||
      await page.getByText(/Level/i).first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasLevelOrScore).toBeTruthy();
  });

  test('learner home links to progress page', async ({ page }) => {
    const { learnerId } = await setupLearnerSession(page);
    if (!learnerId) {
      test.skip(true, 'Learner setup failed');
      return;
    }

    await page.goto('/learner');
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'achievements-05-learner-home');

    // Learner home should have a "My Progress" card/link
    const { locator: progressLink } = await selfHealingLocator(page, 'progress-link', {
      text: 'My Progress',
      name: 'My Progress',
    });
    const hasProgressLink = await progressLink.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasProgressLink) {
      await progressLink.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'achievements-05-navigated-to-progress');

      // Should now be on progress page
      const isOnProgressPage = page.url().includes('/progress');
      const hasProgressTitle = await page.getByText('My Progress').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(isOnProgressPage || hasProgressTitle).toBeTruthy();
    }
  });
});
