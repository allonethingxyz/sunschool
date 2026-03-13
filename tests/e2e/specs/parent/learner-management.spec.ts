import { test, expect } from '@playwright/test';
import { selfHealingLocator, captureFailureArtifacts } from '../../helpers/self-healing';

/**
 * Parent Persona: Learner Management
 *
 * Models the parent journey of adding a child learner, editing their
 * profile/grade, and viewing the learner list on the dashboard.
 */

const ts = Date.now();

// Helper: register a parent and return auth token
async function registerParent(page: import('@playwright/test').Page, suffix: string) {
  const user = {
    username: `parent_lm_${suffix}_${ts}`,
    email: `parent_lm_${suffix}_${ts}@test.com`,
    password: 'TestPassword123!',
    name: `LM Parent ${suffix}`,
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

// Helper: navigate to dashboard with auth
async function goToDashboard(page: import('@playwright/test').Page) {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // Dismiss welcome card if present
  const gotIt = page.getByText('GOT IT!');
  if (await gotIt.isVisible({ timeout: 3000 }).catch(() => false)) {
    await gotIt.click();
  }
}

test.describe('Parent learner management', () => {
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await captureFailureArtifacts(page, testInfo.title);
    }
  });

  test('parent can add a child learner from the dashboard', async ({ page }) => {
    await registerParent(page, 'add');
    await goToDashboard(page);

    // Empty state should prompt adding a child
    await expect(async () => {
      const addButton = page.getByRole('button', { name: /add child/i });
      const emptyButton = page.getByRole('button', { name: /add child account/i });
      const either = await addButton.isVisible().catch(() => false) ||
                     await emptyButton.isVisible().catch(() => false);
      expect(either).toBe(true);
    }).toPass({ timeout: 10000 });

    // Click Add Child button
    const { locator: addChildBtn } = await selfHealingLocator(page, 'add child button', {
      role: 'button', name: 'Add Child', text: 'Add Child',
    });
    await addChildBtn.click();
    await page.waitForLoadState('networkidle');

    // Fill child's name
    const childName = `TestChild_${ts}`;
    const nameInput = page.getByPlaceholder(/child.*name|enter.*name/i).first();
    await nameInput.fill(childName);

    // Select grade level (click grade 3)
    await page.getByRole('button', { name: '3', exact: true }).click();

    // Submit the form
    const { locator: submitBtn } = await selfHealingLocator(page, 'create child submit', {
      role: 'button', name: 'Add Child', text: 'Add Child',
    });
    await submitBtn.click();

    // Wait for child to appear on dashboard
    await expect(async () => {
      await expect(page.getByText(childName)).toBeVisible();
    }).toPass({ timeout: 15000 });
  });

  test('parent sees learner listed on the dashboard after adding', async ({ page }) => {
    const token = await registerParent(page, 'list');

    // Create a child via API
    const childName = `ListChild_${ts}`;
    await page.evaluate(async ({ token, name }: { token: string; name: string }) => {
      await fetch('/api/learners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, gradeLevel: 5 }),
      });
    }, { token, name: childName });

    await goToDashboard(page);

    // Verify child appears on the dashboard
    await expect(async () => {
      await expect(page.getByText(childName)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Verify grade badge is visible
    await expect(async () => {
      // Grade 5 should show as "Grade 5" badge
      await expect(page.getByText(/grade 5/i).first()).toBeVisible();
    }).toPass({ timeout: 5000 });

    // Verify action buttons are present for the learner
    await expect(page.getByRole('button', { name: /edit grade/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /progress/i }).first()).toBeVisible();
  });

  test('parent can edit a learner grade level', async ({ page }) => {
    const token = await registerParent(page, 'edit');

    // Create a child via API
    const childName = `EditChild_${ts}`;
    await page.evaluate(async ({ token, name }: { token: string; name: string }) => {
      await fetch('/api/learners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, gradeLevel: 3 }),
      });
    }, { token, name: childName });

    await goToDashboard(page);

    // Verify child is listed
    await expect(async () => {
      await expect(page.getByText(childName)).toBeVisible();
    }).toPass({ timeout: 10000 });

    // Click Edit Grade
    const { locator: editGradeBtn } = await selfHealingLocator(page, 'edit grade button', {
      role: 'button', name: 'Edit Grade', text: 'Edit Grade',
    });
    await editGradeBtn.click();

    // Modal should appear with "Update Grade Level" title
    await expect(async () => {
      await expect(page.getByText(/update grade level/i)).toBeVisible();
    }).toPass({ timeout: 5000 });

    // Select grade 7
    await page.getByRole('button', { name: '7', exact: true }).click();

    // Click Update Grade
    const { locator: updateBtn } = await selfHealingLocator(page, 'update grade button', {
      role: 'button', name: 'Update Grade', text: 'Update Grade',
    });
    await updateBtn.click();

    // Verify grade updated on dashboard
    await expect(async () => {
      await expect(page.getByText(/grade 7/i).first()).toBeVisible();
    }).toPass({ timeout: 10000 });
  });

  test('parent can view learners on the learner management page', async ({ page }) => {
    const token = await registerParent(page, 'mgmt');

    // Create two children via API
    const child1 = `MgmtChild1_${ts}`;
    const child2 = `MgmtChild2_${ts}`;

    await page.evaluate(async ({ token, children }: { token: string; children: Array<{ name: string; grade: number }> }) => {
      for (const child of children) {
        await fetch('/api/learners', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ name: child.name, gradeLevel: child.grade }),
        });
      }
    }, { token, children: [{ name: child1, grade: 2 }, { name: child2, grade: 8 }] });

    // Navigate to learners page
    await page.goto('/learners');
    await page.waitForLoadState('networkidle');

    // Both children should be visible
    await expect(async () => {
      await expect(page.getByText(child1)).toBeVisible();
      await expect(page.getByText(child2)).toBeVisible();
    }).toPass({ timeout: 10000 });
  });
});
