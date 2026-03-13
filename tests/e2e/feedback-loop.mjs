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
 * Uses the Stoneforge CLI (`sf task create`) when SF_API_TOKEN is available,
 * otherwise falls back to console logging (dry-run mode).
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const REPORT_FILE = 'test-results/synthetic-report.json';

if (!existsSync(REPORT_FILE)) {
  console.log('No synthetic report found — skipping feedback loop.');
  process.exit(0);
}

const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8'));
const gitSha = process.env.GITHUB_SHA || report.git_sha || 'unknown';
const gitRef = process.env.GITHUB_REF || report.git_branch || 'unknown';
const runId = process.env.GITHUB_RUN_ID || '';
const repoUrl = 'https://github.com/allonethingxyz/sunschool-deployed-private';
const sfToken = process.env.SF_API_TOKEN || '';
const sfWorkspace = process.env.SF_WORKSPACE || '';

const isDryRun = !sfToken;
const tasksCreated = [];

if (isDryRun) {
  console.log('⚠️  SF_API_TOKEN not set — running in dry-run mode (no tasks will be created)\n');
}

/**
 * Create a Stoneforge task via CLI, or log in dry-run mode.
 */
function sfTaskCreate({ title, description, priority, tags }) {
  if (isDryRun) {
    console.log(`  [DRY-RUN] Would create task:`);
    console.log(`    Title: ${title}`);
    console.log(`    Priority: P${priority}`);
    console.log(`    Tags: ${(tags || []).join(', ')}`);
    if (description) {
      console.log(`    Description: ${description.substring(0, 200)}...`);
    }
    tasksCreated.push({ title, priority, dryRun: true });
    return `dry-run-${Date.now()}`;
  }

  try {
    // Build the sf task create command
    const tagArgs = (tags || []).map(t => `--tag "${t}"`).join(' ');
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedDesc = description ? description.replace(/"/g, '\\"').replace(/\n/g, '\\n') : '';

    const cmd = [
      'sf task create',
      `--title "${escapedTitle}"`,
      `--priority ${priority}`,
      escapedDesc ? `--description "${escapedDesc}"` : '',
      tagArgs,
    ].filter(Boolean).join(' ');

    const result = execSync(cmd, {
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        SF_API_TOKEN: sfToken,
        SF_WORKSPACE: sfWorkspace,
      },
    }).trim();

    // Parse the task ID from output
    const taskIdMatch = result.match(/([a-z]+-[a-z0-9]+)/);
    const taskId = taskIdMatch ? taskIdMatch[1] : 'unknown';

    console.log(`  ✅ Created task ${taskId}: ${title}`);
    tasksCreated.push({ title, priority, taskId, dryRun: false });
    return taskId;
  } catch (err) {
    console.error(`  ❌ Failed to create task: ${title}`);
    console.error(`     Error: ${err.message}`);
    tasksCreated.push({ title, priority, error: err.message, dryRun: false });
    return null;
  }
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
const created = tasksCreated.filter(t => !t.error);
const errored = tasksCreated.filter(t => t.error);

console.log(`\n${'═'.repeat(50)}`);
console.log(`Feedback loop complete${isDryRun ? ' (DRY RUN)' : ''}:`);
console.log(`  Regressions (P1): ${failures.length}`);
console.log(`  Selector drift (P3): ${drifted.length}`);
console.log(`  Auto-fixable (P2): ${autoFixable.length}`);
console.log(`  Flaky (P3): ${flaky.length}`);
console.log(`  Tasks created: ${created.length}`);
if (errored.length > 0) {
  console.log(`  Tasks failed: ${errored.length}`);
}
console.log(`${'═'.repeat(50)}`);

// Exit with error if all tasks failed (and there were tasks to create)
if (tasksCreated.length > 0 && errored.length === tasksCreated.length && !isDryRun) {
  console.error('\n❌ All task creation attempts failed');
  process.exit(1);
}
