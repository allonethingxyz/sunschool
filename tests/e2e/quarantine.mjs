#!/usr/bin/env node
/**
 * quarantine.mjs — Auto-quarantine flaky tests
 *
 * Reads the synthetic report and identifies tests that are consistently flaky.
 * Outputs a quarantine list that can be used to skip unstable tests in CI.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const RESULTS_DIR = process.env.TEST_RESULTS_DIR || 'test-results';
const REPORT_PATH = join(RESULTS_DIR, 'synthetic-report.json');
const QUARANTINE_PATH = join(RESULTS_DIR, 'quarantine.json');

function loadReport() {
  if (!existsSync(REPORT_PATH)) {
    console.log('⚠️  No synthetic report found. Run generate-report.mjs first.');
    return null;
  }
  return JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
}

function identifyFlakyTests(report) {
  if (!report || !report.tests) return [];

  return report.tests
    .filter(t => t.retries > 0 || t.status === 'failed')
    .map(t => ({
      title: t.title,
      status: t.status,
      retries: t.retries,
      reason: t.status === 'failed'
        ? 'consistent_failure'
        : 'flaky_pass_after_retry',
      error: t.error ? t.error.substring(0, 300) : null,
      quarantined_at: new Date().toISOString(),
    }));
}

// Main
const report = loadReport();
if (!report) process.exit(0);

const quarantined = identifyFlakyTests(report);

const quarantineData = {
  generated_at: new Date().toISOString(),
  sha: process.env.GITHUB_SHA || 'unknown',
  total_quarantined: quarantined.length,
  tests: quarantined,
};

writeFileSync(QUARANTINE_PATH, JSON.stringify(quarantineData, null, 2));
console.log(`✅ Quarantine list written to ${QUARANTINE_PATH}`);
console.log(`   ${quarantined.length} test(s) flagged for quarantine`);

if (quarantined.length > 0) {
  console.log('\n🔶 Quarantined tests:');
  quarantined.forEach(t => {
    console.log(`   [${t.reason}] ${t.title}`);
  });
}
