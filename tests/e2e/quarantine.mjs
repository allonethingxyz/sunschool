#!/usr/bin/env node
/**
 * Quarantine System for Synthetic User Tests
 *
 * Auto-isolates flaky tests when their flake rate exceeds the threshold
 * over a trailing window. Auto-restores when they pass consistently.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const QUARANTINE_FILE = 'tests/e2e/quarantine.json';
const REPORT_FILE = 'test-results/synthetic-report.json';
const FLAKE_THRESHOLD = 0.10; // 10%
const TRAILING_RUNS = 5;

// Load quarantine history
const history = existsSync(QUARANTINE_FILE)
  ? JSON.parse(readFileSync(QUARANTINE_FILE, 'utf8'))
  : { quarantined: [], history: {} };

// Load test report
if (!existsSync(REPORT_FILE)) {
  console.log('No synthetic report found — skipping quarantine update.');
  process.exit(0);
}

const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8'));

// Update trailing history for each test
for (const r of report.results) {
  if (!history.history[r.test]) history.history[r.test] = [];
  history.history[r.test].push({
    status: r.status,
    timestamp: report.timestamp,
    run_id: report.run_id,
  });
  // Keep only trailing N runs
  history.history[r.test] = history.history[r.test].slice(-TRAILING_RUNS);
}

// Check flake rates — quarantine tests that flake too often
for (const [test, runs] of Object.entries(history.history)) {
  if (runs.length < TRAILING_RUNS) continue;
  const flakeRate = runs.filter(r => r.status === 'flake').length / runs.length;

  if (flakeRate >= FLAKE_THRESHOLD && !history.quarantined.includes(test)) {
    history.quarantined.push(test);
    console.log(`QUARANTINED: ${test} (flake rate: ${(flakeRate * 100).toFixed(0)}% over last ${TRAILING_RUNS} runs)`);
  }
}

// Un-quarantine tests that have stabilized (N consecutive passes)
for (const test of [...history.quarantined]) {
  const runs = history.history[test] || [];
  if (runs.length >= TRAILING_RUNS && runs.every(r => r.status === 'pass')) {
    history.quarantined = history.quarantined.filter(t => t !== test);
    console.log(`UN-QUARANTINED: ${test} (${TRAILING_RUNS} consecutive passes)`);
  }
}

writeFileSync(QUARANTINE_FILE, JSON.stringify(history, null, 2));

console.log(`\nQuarantine summary:`);
console.log(`  Active quarantines: ${history.quarantined.length}`);
if (history.quarantined.length > 0) {
  history.quarantined.forEach(t => console.log(`    - ${t}`));
}
console.log(`  Tests tracked: ${Object.keys(history.history).length}`);
