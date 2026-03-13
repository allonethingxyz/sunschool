#!/usr/bin/env node
/**
 * Stoneforge Feedback Loop
 *
 * Reads synthetic-report.json and creates Stoneforge tasks for:
 *   - P1: Test regressions (failures)
 *   - P2: High-confidence auto-fixable selector drift
 *   - P3: Selector drift (tech debt)
 *   - P3: Flaky tests
 *
 * NOTE: Stoneforge integration is stubbed — tasks are logged to console.
 * Real wiring will be added in a future task.
 */
import { readFileSync, existsSync } from 'fs';

const REPORT_FILE = 'test-results/synthetic-report.json';

if (!existsSync(REPORT_FILE)) {
  console.log('No synthetic report found — skipping feedback loop.');
  process.exit(0);
}

const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8'));
const gitSha = process.env.GITHUB_SHA || report.git_sha || 'unknown';
const gitRef = process.env.GITHUB_REF || report.git_branch || 'unknown';
const runId = process.env.GITHUB_RUN_ID || '';
const repoUrl = 'https://github.com/allonethingxyz/sunschool';

/**
 * Stub: Log task that would be created via Stoneforge CLI.
 * Real implementation will use `sf task create` commands.
 */
function sfTaskCreate({ title, description, priority, tags }) {
  console.log(`\n  [STUB] Would create Stoneforge task:`);
  console.log(`    Title: ${title}`);
  console.log(`    Priority: P${priority}`);
  console.log(`    Tags: ${(tags || []).join(', ')}`);
  if (description) {
    console.log(`    Description: ${description.substring(0, 200)}...`);
  }
  return `stub-task-${Date.now()}`;
}

// ─── Create tasks for failures (P1 regressions) ──────────────
const failures = report.results.filter(r => r.status === 'fail');
for (const r of failures) {
  sfTaskCreate({
    title: `[E2E REGRESSION] ${r.test}`,
    description: [
      `Synthetic user test \`${r.test}\` failed on commit \`${gitSha}\`.`,
      `Branch: \`${gitRef}\``,
      runId ? `Run: ${repoUrl}/actions/runs/${runId}` : '',
      '',
      '**Failed assertions:**',
      ...(r.assertions_failed.length > 0
        ? r.assertions_failed.map(a => `- ${a}`)
        : ['- (no assertion details captured)']),
      '',
      `Duration: ${r.duration_ms}ms`,
      r.artifacts.length > 0 ? `Artifacts: ${r.artifacts.join(', ')}` : '',
    ].filter(Boolean).join('\n'),
    priority: 1,
    tags: ['e2e-regression', 'automated'],
  });
}

// ─── Create tasks for selector drift (P3 tech debt) ──────────
const drifted = report.results.flatMap(r =>
  (r.healed_selectors || []).map(h => ({ test: r.test, ...h }))
);

if (drifted.length > 0) {
  sfTaskCreate({
    title: `[SELECTOR DRIFT] ${drifted.length} locators auto-healed — update needed`,
    description: [
      `${drifted.length} Playwright locators self-healed via AX tree fuzzy match.`,
      'These are tech debt — update the test source to use the resolved selectors.',
      '',
      '**Drifted selectors:**',
      ...drifted.map(d =>
        `- \`${d.test}\`: \`${d.original}\` → \`${d.resolved}\` (confidence: ${d.confidence})`
      ),
      '',
      `Commit: \`${gitSha}\``,
    ].join('\n'),
    priority: 3,
    tags: ['selector-drift', 'automated'],
  });
}

// ─── Create auto-fix task for high-confidence heals (P2) ─────
const autoFixable = drifted.filter(d => d.confidence >= 0.95);
if (autoFixable.length > 0) {
  sfTaskCreate({
    title: `[AUTO-FIX] Update ${autoFixable.length} high-confidence healed selectors`,
    description: [
      'These selectors healed with >=0.95 confidence. Auto-fix is safe.',
      '',
      ...autoFixable.map(d =>
        `- In \`${d.test}\`: replace \`${d.original}\` with \`${d.resolved}\``
      ),
      '',
      'Agent: apply these replacements, run the E2E suite locally, and open a PR.',
    ].join('\n'),
    priority: 2,
    tags: ['auto-fix', 'selector-drift', 'automated'],
  });
}

// ─── Create tasks for flaky tests (P3) ───────────────────────
const flaky = report.results.filter(r => r.status === 'flake');
for (const f of flaky) {
  sfTaskCreate({
    title: `[FLAKE] ${f.test} — investigate instability`,
    description: [
      `Test \`${f.test}\` flaked (passed on retry). Duration: ${f.duration_ms}ms.`,
      '',
      'If flake rate exceeds 10% over trailing 5 runs, this test will be quarantined.',
      '',
      f.artifacts.length > 0 ? `Artifacts: ${f.artifacts.join(', ')}` : '',
      runId ? `Run: ${repoUrl}/actions/runs/${runId}` : '',
    ].filter(Boolean).join('\n'),
    priority: 3,
    tags: ['flake', 'automated'],
  });
}

// ─── Summary ─────────────────────────────────────────────────
console.log(`\nFeedback loop complete:`);
console.log(`  Regressions (P1): ${failures.length}`);
console.log(`  Selector drift (P3): ${drifted.length}`);
console.log(`  Auto-fixable (P2): ${autoFixable.length}`);
console.log(`  Flaky (P3): ${flaky.length}`);
