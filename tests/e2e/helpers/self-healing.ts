/**
 * Self-Healing Selector System for Playwright
 *
 * Provides AX-tree introspection, locator cascade, and fuzzy text matching
 * to automatically recover from selector drift.
 */
import { Page, Locator } from '@playwright/test';

export interface HealedSelector {
  original: string;
  resolved: string;
  method: 'ax_tree_exact' | 'ax_tree_fuzzy_match' | 'locator_cascade' | 'testid_fallback';
  confidence: number;
}

export interface SelectorDriftWarning {
  test: string;
  original: string;
  resolved: string;
  method: string;
  confidence: number;
}

// Accumulate drift warnings across a test run
const driftWarnings: SelectorDriftWarning[] = [];

export function getDriftWarnings(): SelectorDriftWarning[] {
  return [...driftWarnings];
}

export function clearDriftWarnings(): void {
  driftWarnings.length = 0;
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

interface AXNode {
  role: string;
  name: string;
  description?: string;
  children?: AXNode[];
}

/**
 * Walk the accessibility tree to find a node matching by role and fuzzy name.
 */
function findInAXTree(
  node: AXNode,
  targetRole: string,
  targetName: string,
  maxDistance: number = 2
): { node: AXNode; confidence: number } | null {
  let bestMatch: { node: AXNode; confidence: number } | null = null;

  function walk(n: AXNode) {
    if (n.role === targetRole || targetRole === '*') {
      const name = (n.name || '').toLowerCase();
      const target = targetName.toLowerCase();

      if (name === target) {
        // Exact match
        const match = { node: n, confidence: 1.0 };
        if (!bestMatch || match.confidence > bestMatch.confidence) {
          bestMatch = match;
        }
        return;
      }

      const dist = levenshtein(name, target);
      if (dist <= maxDistance && name.length > 0) {
        const confidence = Math.max(0, 1 - dist / Math.max(name.length, target.length));
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { node: n, confidence };
        }
      }

      // Also check if name contains the target
      if (name.includes(target) || target.includes(name)) {
        const confidence = Math.min(name.length, target.length) / Math.max(name.length, target.length);
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { node: n, confidence };
        }
      }
    }

    for (const child of n.children || []) {
      walk(child);
    }
  }

  walk(node);
  return bestMatch;
}

/**
 * Map Playwright role names to AX tree role names.
 */
function mapRole(role: string): string {
  const roleMap: Record<string, string> = {
    button: 'button',
    link: 'link',
    heading: 'heading',
    textbox: 'textbox',
    checkbox: 'checkbox',
    radio: 'radio',
    tab: 'tab',
    tabpanel: 'tabpanel',
    dialog: 'dialog',
    navigation: 'navigation',
    img: 'img',
  };
  return roleMap[role] || role;
}

/**
 * Self-healing locator that attempts to recover from selector drift.
 *
 * Locator cascade:
 *   getByRole → getByLabel → getByText → getByTestId
 *
 * If the primary locator fails, walks the AX tree to find the nearest
 * semantic match, then falls back through the cascade.
 */
export async function selfHealingLocator(
  page: Page,
  testName: string,
  options: {
    role?: string;
    name?: string;
    label?: string;
    text?: string;
    testId?: string;
    exact?: boolean;
  }
): Promise<{ locator: Locator; healed?: HealedSelector }> {
  const { role, name, label, text, testId, exact } = options;

  // Build the original locator description for logging
  let originalDesc = '';

  // Step 1: Try getByRole
  if (role && name) {
    originalDesc = `getByRole('${role}', { name: '${name}' })`;
    const locator = page.getByRole(role as any, { name, exact });
    if (await locator.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      return { locator: locator.first() };
    }
  }

  // Step 2: Try getByLabel
  if (label || name) {
    const labelText = label || name!;
    if (!originalDesc) originalDesc = `getByLabel('${labelText}')`;
    const locator = page.getByLabel(labelText, { exact });
    if (await locator.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      if (originalDesc !== `getByLabel('${labelText}')`) {
        const healed: HealedSelector = {
          original: originalDesc,
          resolved: `getByLabel('${labelText}')`,
          method: 'locator_cascade',
          confidence: 0.85,
        };
        logDrift(testName, healed);
        return { locator: locator.first(), healed };
      }
      return { locator: locator.first() };
    }
  }

  // Step 3: Try getByText
  if (text || name) {
    const textContent = text || name!;
    if (!originalDesc) originalDesc = `getByText('${textContent}')`;
    const locator = page.getByText(textContent, { exact });
    if (await locator.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      if (originalDesc !== `getByText('${textContent}')`) {
        const healed: HealedSelector = {
          original: originalDesc,
          resolved: `getByText('${textContent}')`,
          method: 'locator_cascade',
          confidence: 0.75,
        };
        logDrift(testName, healed);
        return { locator: locator.first(), healed };
      }
      return { locator: locator.first() };
    }
  }

  // Step 4: AX tree introspection with fuzzy matching
  if (role && name) {
    try {
      const snapshot = await page.accessibility.snapshot();
      if (snapshot) {
        const axRole = mapRole(role);
        const match = findInAXTree(snapshot as AXNode, axRole, name);
        if (match && match.confidence >= 0.5) {
          // Found a fuzzy match — try to locate it
          const resolvedLocator = page.getByRole(role as any, { name: match.node.name });
          if (await resolvedLocator.first().isVisible({ timeout: 2000 }).catch(() => false)) {
            const healed: HealedSelector = {
              original: originalDesc,
              resolved: `getByRole('${role}', { name: '${match.node.name}' })`,
              method: match.confidence === 1.0 ? 'ax_tree_exact' : 'ax_tree_fuzzy_match',
              confidence: match.confidence,
            };
            logDrift(testName, healed);
            return { locator: resolvedLocator.first(), healed };
          }
        }
      }
    } catch {
      // AX tree snapshot can fail in some contexts
    }
  }

  // Step 5: Last resort — getByTestId
  if (testId) {
    if (!originalDesc) originalDesc = `getByTestId('${testId}')`;
    const locator = page.getByTestId(testId);
    if (await locator.first().isVisible({ timeout: 2000 }).catch(() => false)) {
      const healed: HealedSelector = {
        original: originalDesc,
        resolved: `getByTestId('${testId}')`,
        method: 'testid_fallback',
        confidence: 0.6,
      };
      logDrift(testName, healed);
      return { locator: locator.first(), healed };
    }
  }

  // Nothing worked — return the best guess locator (will fail assertion)
  const fallback = role && name
    ? page.getByRole(role as any, { name })
    : text
      ? page.getByText(text)
      : page.getByTestId(testId || 'not-found');

  return { locator: fallback.first() };
}

function logDrift(testName: string, healed: HealedSelector) {
  console.warn(
    `[SELECTOR_DRIFT] ${testName}: ${healed.original} → ${healed.resolved} ` +
    `(method: ${healed.method}, confidence: ${healed.confidence.toFixed(2)})`
  );
  driftWarnings.push({
    test: testName,
    original: healed.original,
    resolved: healed.resolved,
    method: healed.method,
    confidence: healed.confidence,
  });
}

/**
 * Capture diagnostic artifacts on failure.
 */
export async function captureFailureArtifacts(
  page: Page,
  testName: string,
  outputDir: string = 'test-results'
): Promise<string[]> {
  const artifacts: string[] = [];
  const safeName = testName.replace(/[^a-zA-Z0-9_-]/g, '_');

  try {
    // Screenshot
    const screenshotPath = `${outputDir}/${safeName}-failure.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    artifacts.push(screenshotPath);
  } catch { /* ignore */ }

  try {
    // AX tree dump
    const snapshot = await page.accessibility.snapshot();
    if (snapshot) {
      const fs = await import('fs');
      const axPath = `${outputDir}/${safeName}-ax-tree.json`;
      fs.writeFileSync(axPath, JSON.stringify(snapshot, null, 2));
      artifacts.push(axPath);
    }
  } catch { /* ignore */ }

  try {
    // Console logs
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    if (consoleLogs.length > 0) {
      const fs = await import('fs');
      const logPath = `${outputDir}/${safeName}-console.log`;
      fs.writeFileSync(logPath, consoleLogs.join('\n'));
      artifacts.push(logPath);
    }
  } catch { /* ignore */ }

  return artifacts;
}
