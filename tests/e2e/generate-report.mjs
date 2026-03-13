#!/usr/bin/env node
/**
 * generate-report.mjs — Synthetic E2E Report Generator
 *
 * Parses Playwright JSON output and produces a structured summary report
 * for CI artifacts and PR comments.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const RESULTS_DIR = process.env.TEST_RESULTS_DIR || 'test-results';
const OUTPUT_PATH = join(RESULTS_DIR, 'synthetic-report.json');

function findJsonResults() {
  // Look for Playwright's JSON reporter output
  const candidates = [
    join(RESULTS_DIR, 'results.json'),
    join(RESULTS_DIR, 'test-results.json'),
    'test-results.json',
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, 'utf8'));
    }
  }

  // Try to find any .json file in results dir
  if (existsSync(RESULTS_DIR)) {
    const files = readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json') && f !== 'synthetic-report.json');
    if (files.length > 0) {
      return JSON.parse(readFileSync(join(RESULTS_DIR, files[0]), 'utf8'));
    }
  }

  return null;
}

function parsePlaywrightResults(raw) {
  if (!raw) {
    return {
      summary: {
        total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0,
        healed: 0, selector_drift_count: 0, mean_duration_ms: 0,
      },
      tests: [],
      recommendations: ['No test results found. Check if tests ran correctly.'],
    };
  }

  const suites = raw.suites || [];
  const allTests = [];

  function collectTests(suite) {
    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        const results = test.results || [];
        const lastResult = results[results.length - 1] || {};
        allTests.push({
          title: `${suite.title} > ${spec.title}`,
          status: lastResult.status || test.status || 'unknown',
          duration: lastResult.duration || 0,
          retries: results.length - 1,
          error: lastResult.error?.message || null,
        });
      }
    }
    for (const child of (suite.suites || [])) {
      collectTests(child);
    }
  }

  suites.forEach(collectTests);

  const passed = allTests.filter(t => t.status === 'passed').length;
  const failed = allTests.filter(t => t.status === 'failed').length;
  const flaky = allTests.filter(t => t.status === 'passed' && t.retries > 0).length;
  const skipped = allTests.filter(t => t.status === 'skipped').length;
  const durations = allTests.map(t => t.duration).filter(d => d > 0);
  const meanDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Count self-healed selectors (tests that passed after retry)
  const healed = allTests.filter(t => t.status === 'passed' && t.retries > 0).length;

  const recommendations = [];
  if (failed > 0) {
    recommendations.push(`${failed} test(s) failed. Review failures and update specs or app code.`);
  }
  if (flaky > 0) {
    recommendations.push(`${flaky} flaky test(s) detected (passed after retry). Consider stabilizing selectors.`);
  }
  if (meanDuration > 60000) {
    recommendations.push(`Average test duration is ${Math.round(meanDuration / 1000)}s. Consider optimizing slow tests.`);
  }
  if (allTests.length === 0) {
    recommendations.push('No tests were collected. Check testDir and testMatch patterns.');
  }

  return {
    summary: {
      total: allTests.length,
      passed,
      failed,
      flaky,
      skipped,
      healed,
      selector_drift_count: healed, // self-healed ≈ selector drift
      mean_duration_ms: meanDuration,
    },
    tests: allTests,
    recommendations,
    metadata: {
      sha: process.env.GITHUB_SHA || 'unknown',
      ref: process.env.GITHUB_REF || 'unknown',
      env: process.env.TARGET_ENV || 'unknown',
      timestamp: new Date().toISOString(),
    },
  };
}

// Main
const raw = findJsonResults();
const report = parsePlaywrightResults(raw);

writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
console.log(`✅ Synthetic report written to ${OUTPUT_PATH}`);
console.log(`   Total: ${report.summary.total} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed} | Flaky: ${report.summary.flaky}`);

if (report.summary.failed > 0) {
  console.log('\n❌ Failed tests:');
  report.tests.filter(t => t.status === 'failed').forEach(t => {
    console.log(`   - ${t.title}`);
    if (t.error) console.log(`     ${t.error.substring(0, 200)}`);
  });
}
