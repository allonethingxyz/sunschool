#!/usr/bin/env node
/**
 * feedback-loop.mjs — Stoneforge Feedback Loop Integration
 *
 * Reads the synthetic E2E report and creates Stoneforge tasks for:
 * - Consistently failing tests (likely app bugs)
 * - Flaky tests that need stabilization
 * - Performance regressions
 *
 * Uses the Stoneforge CLI (`sf`) to create tasks in the workspace.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const RESULTS_DIR = process.env.TEST_RESULTS_DIR || 'test-results';
const REPORT_PATH = join(RESULTS_DIR, 'synthetic-report.json');
const QUARANTINE_PATH = join(RESULTS_DIR, 'quarantine.json');

// Stoneforge config
const SF_PLAN = process.env.SF_PLAN || 'E2E Test Maintenance';
const DRY_RUN = process.env.FEEDBACK_DRY_RUN === 'true';
const FAILURE_THRESHOLD = parseInt(process.env.FAILURE_THRESHOLD || '0', 10);
const FLAKY_THRESHOLD = parseInt(process.env.FLAKY_THRESHOLD || '2', 10);

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sfExec(command) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] sf ${command}`);
    return '[dry-run]';
  }
  try {
    const result = execSync(`sf ${command}`, { encoding: 'utf8', timeout: 30000 });
    return result.trim();
  } catch (err) {
    console.error(`  ⚠️  sf command failed: sf ${command}`);
    console.error(`  ${err.message}`);
    return null;
  }
}

function createTaskForFailure(test) {
  const title = `Fix failing E2E: ${test.title.substring(0, 60)}`;
  const description = [
    `E2E test consistently failing in CI.`,
    '',
    `**Test:** ${test.title}`,
    `**Error:** ${test.error || 'No error message captured'}`,
    `**Duration:** ${test.duration}ms`,
    '',
    `Investigate and fix the underlying app bug or update the test spec.`,
  ].join('\n');

  return sfExec(`task create --title "${title}" --plan "${SF_PLAN}" --description "${description.replace(/"/g, '\\"')}"`);
}

function createTaskForFlaky(tests) {
  if (tests.length === 0) return null;

  const testList = tests.map(t => `- ${t.title} (${t.retries} retries)`).join('\n');
  const title = `Stabilize ${tests.length} flaky E2E test(s)`;
  const description = [
    `${tests.length} E2E test(s) are flaky (passed after retry).`,
    '',
    '**Flaky tests:**',
    testList,
    '',
    'These represent selector drift or timing issues. Review and stabilize.',
  ].join('\n');

  return sfExec(`task create --title "${title}" --plan "${SF_PLAN}" --description "${description.replace(/"/g, '\\"')}"`);
}

function createTaskForPerformance(summary) {
  const title = `Investigate slow E2E tests (avg ${Math.round(summary.mean_duration_ms / 1000)}s)`;
  const description = [
    `E2E test suite average duration is ${Math.round(summary.mean_duration_ms / 1000)}s per test.`,
    '',
    `**Stats:** ${summary.total} total, ${summary.passed} passed, ${summary.failed} failed`,
    '',
    'Consider optimizing test setup, reducing unnecessary waits, or parallelizing.',
  ].join('\n');

  return sfExec(`task create --title "${title}" --plan "${SF_PLAN}" --description "${description.replace(/"/g, '\\"')}"`);
}

function sendChannelMessage(message) {
  sfExec(`message send --from ci-bot --channel e2e-results --content "${message.replace(/"/g, '\\"')}"`);
}

// ─── Main ──────────────────────────────────────────────────────
const report = loadJson(REPORT_PATH);
const quarantine = loadJson(QUARANTINE_PATH);

if (!report) {
  console.log('⚠️  No synthetic report found. Skipping feedback loop.');
  process.exit(0);
}

const { summary } = report;
console.log('📊 Feedback Loop — Analyzing E2E results...');
console.log(`   Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed} | Flaky: ${summary.flaky}`);

let tasksCreated = 0;

// 1. Create tasks for consistent failures
if (summary.failed > FAILURE_THRESHOLD) {
  const failures = report.tests.filter(t => t.status === 'failed');
  for (const test of failures) {
    const result = createTaskForFailure(test);
    if (result) tasksCreated++;
  }
}

// 2. Create task for flaky tests (batch)
if (summary.flaky >= FLAKY_THRESHOLD) {
  const flakyTests = report.tests.filter(t => t.status === 'passed' && t.retries > 0);
  const result = createTaskForFlaky(flakyTests);
  if (result) tasksCreated++;
}

// 3. Create task for performance regression
if (summary.mean_duration_ms > 120000) { // > 2 min avg
  const result = createTaskForPerformance(summary);
  if (result) tasksCreated++;
}

// 4. Send summary to channel
const status = summary.failed > 0 ? '🔴' : summary.flaky > 0 ? '🟡' : '🟢';
const msg = `${status} E2E Run: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.flaky} flaky | SHA: ${report.metadata?.sha?.substring(0, 7) || 'unknown'}`;
sendChannelMessage(msg);

console.log(`\n✅ Feedback loop complete. ${tasksCreated} task(s) created.`);
