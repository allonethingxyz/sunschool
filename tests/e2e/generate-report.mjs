#!/usr/bin/env node
/**
 * Synthetic Report Generator
 *
 * Transforms Playwright's JSON output into the structured synthetic-report.json
 * format used by the quarantine system and Stoneforge feedback loop.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const PLAYWRIGHT_RESULTS = 'test-results/results.json';
const OUTPUT_FILE = 'test-results/synthetic-report.json';

// Read Playwright JSON results
if (!existsSync(PLAYWRIGHT_RESULTS)) {
  console.error(`Playwright results not found at ${PLAYWRIGHT_RESULTS}`);
  console.log('Writing empty report...');

  const emptyReport = {
    run_id: randomUUID(),
    timestamp: new Date().toISOString(),
    git_sha: process.env.GITHUB_SHA || 'unknown',
    git_branch: process.env.GITHUB_REF || 'unknown',
    target_env: process.env.TARGET_ENV || 'local',
    railway_deployment_id: process.env.RAILWAY_DEPLOYMENT_ID || null,
    results: [],
    summary: {
      total: 0, passed: 0, failed: 0, flaky: 0, healed: 0,
      selector_drift_count: 0, mean_duration_ms: 0,
    },
    recommendations: ['No test results found — check if Playwright ran successfully.'],
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(emptyReport, null, 2));
  process.exit(0);
}

const rawResults = JSON.parse(readFileSync(PLAYWRIGHT_RESULTS, 'utf8'));

// Parse Playwright JSON report format
const suites = rawResults.suites || [];
const results = [];

function extractTests(suite) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const lastResult = test.results?.[test.results.length - 1];
      if (!lastResult) continue;

      // Determine status
      let status = 'pass';
      if (test.status === 'unexpected' || test.status === 'failed') {
        status = 'fail';
      } else if (test.status === 'flaky') {
        status = 'flake';
      } else if (test.status === 'skipped') {
        continue; // don't report skipped tests
      }

      // Check for healed selectors in stdout/stderr
      const healedSelectors = [];
      for (const result of test.results || []) {
        const output = (result.stdout || []).concat(result.stderr || []).join('\n');
        const driftMatches = output.matchAll(
          /\[SELECTOR_DRIFT\] ([^:]+): (.+?) → (.+?) \(method: (\w+), confidence: ([\d.]+)\)/g
        );
        for (const match of driftMatches) {
          healedSelectors.push({
            original: match[2],
            resolved: match[3],
            method: match[4],
            confidence: parseFloat(match[5]),
          });
        }
      }

      if (healedSelectors.length > 0 && status === 'pass') {
        status = 'healed';
      }

      // Collect assertion failures
      const assertionsFailed = [];
      for (const result of test.results || []) {
        if (result.error) {
          assertionsFailed.push(
            result.error.message?.substring(0, 200) || 'Unknown assertion failure'
          );
        }
      }

      // Collect artifact paths
      const artifacts = [];
      for (const result of test.results || []) {
        for (const attachment of result.attachments || []) {
          if (attachment.path) {
            artifacts.push(attachment.path);
          }
        }
      }

      const testName = `${suite.title ? suite.title + ' > ' : ''}${spec.title}`;
      results.push({
        test: testName.replace(/[^a-zA-Z0-9_ >-]/g, '_'),
        status,
        duration_ms: lastResult.duration || 0,
        healed_selectors: healedSelectors,
        assertions_failed: assertionsFailed,
        artifacts,
      });
    }
  }

  // Recurse into nested suites
  for (const child of suite.suites || []) {
    extractTests(child);
  }
}

for (const suite of suites) {
  extractTests(suite);
}

// Build summary
const passed = results.filter(r => r.status === 'pass').length;
const failed = results.filter(r => r.status === 'fail').length;
const flaky = results.filter(r => r.status === 'flake').length;
const healed = results.filter(r => r.status === 'healed').length;
const selectorDriftCount = results.reduce((acc, r) => acc + r.healed_selectors.length, 0);
const totalDuration = results.reduce((acc, r) => acc + r.duration_ms, 0);

const summary = {
  total: results.length,
  passed,
  failed,
  flaky,
  healed,
  selector_drift_count: selectorDriftCount,
  mean_duration_ms: results.length > 0 ? Math.round(totalDuration / results.length) : 0,
};

// Generate recommendations
const recommendations = [];

if (selectorDriftCount > 0) {
  recommendations.push(
    `${selectorDriftCount} selectors drifted since last run — UI likely refactored. Update locators.`
  );
}

for (const r of results.filter(r => r.status === 'healed')) {
  for (const h of r.healed_selectors) {
    if (h.confidence < 0.95) {
      recommendations.push(
        `test '${r.test}' healed with ${h.confidence.toFixed(2)} confidence — review manually.`
      );
    }
  }
}

if (summary.total > 0 && flaky / summary.total > 0.05) {
  recommendations.push(
    `Flake rate >${(flaky / summary.total * 100).toFixed(0)}% — investigate test stability.`
  );
}

if (failed > 0) {
  recommendations.push(
    `${failed} test(s) failed — check regression artifacts in test-results/.`
  );
}

// Build report
const report = {
  run_id: randomUUID(),
  timestamp: new Date().toISOString(),
  git_sha: process.env.GITHUB_SHA || process.env.GIT_SHA || 'unknown',
  git_branch: process.env.GITHUB_REF || process.env.GIT_BRANCH || 'unknown',
  target_env: process.env.TARGET_ENV || 'local',
  railway_deployment_id: process.env.RAILWAY_DEPLOYMENT_ID || null,
  results,
  summary,
  recommendations,
};

writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));

console.log('\n=== Synthetic Report Generated ===');
console.log(`Total: ${summary.total} | Pass: ${summary.passed} | Fail: ${summary.failed} | Flaky: ${summary.flaky} | Healed: ${summary.healed}`);
console.log(`Selector drift: ${summary.selector_drift_count}`);
console.log(`Mean duration: ${summary.mean_duration_ms}ms`);
if (recommendations.length > 0) {
  console.log('\nRecommendations:');
  recommendations.forEach(r => console.log(`  - ${r}`));
}
console.log(`\nReport written to ${OUTPUT_FILE}`);
