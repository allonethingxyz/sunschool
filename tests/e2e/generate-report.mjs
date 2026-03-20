/**
 * Generate synthetic E2E report from Playwright JSON output.
 * Used by .github/workflows/synthetic-e2e.yml
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const jsonPath = 'test-results/results.json';
const outputPath = 'test-results/synthetic-report.json';

if (!existsSync(jsonPath)) {
  // Playwright may output to a different path — check alternatives
  const altPaths = ['test-results/.last-run.json', 'playwright-report/results.json'];
  let found = false;
  for (const alt of altPaths) {
    if (existsSync(alt)) {
      console.log(`Found results at ${alt}`);
      found = true;
      break;
    }
  }
  if (!found) {
    console.log('No Playwright JSON results found — skipping report generation');
    // Write a minimal report so downstream steps don't fail
    writeFileSync(outputPath, JSON.stringify({
      summary: {
        total: 0, passed: 0, failed: 0, flaky: 0,
        healed: 0, selector_drift_count: 0, mean_duration_ms: 0,
      },
      recommendations: ['No test results found — check CI configuration'],
    }));
    process.exit(0);
  }
}

try {
  const raw = readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);

  const suites = data.suites || [];
  let total = 0, passed = 0, failed = 0, flaky = 0;
  let totalDuration = 0;

  function walkSpecs(specs) {
    for (const spec of specs) {
      for (const test of spec.tests || []) {
        total++;
        totalDuration += test.results?.[0]?.duration || 0;
        const status = test.results?.[0]?.status;
        if (status === 'passed') passed++;
        else if (status === 'failed') failed++;
        else if (status === 'flaky') flaky++;
      }
      if (spec.suites) {
        for (const sub of spec.suites) {
          walkSpecs(sub.specs || []);
        }
      }
    }
  }

  for (const suite of suites) {
    walkSpecs(suite.specs || []);
  }

  const report = {
    summary: {
      total, passed, failed, flaky,
      healed: 0,
      selector_drift_count: 0,
      mean_duration_ms: total > 0 ? Math.round(totalDuration / total) : 0,
    },
    recommendations: [],
    sha: process.env.GITHUB_SHA || 'unknown',
    ref: process.env.GITHUB_REF || 'unknown',
    env: process.env.TARGET_ENV || 'local',
  };

  if (failed > 0) {
    report.recommendations.push(`${failed} test(s) failed — review traces`);
  }
  if (flaky > 0) {
    report.recommendations.push(`${flaky} flaky test(s) — consider quarantining`);
  }

  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`Report: ${passed}/${total} passed, ${failed} failed, ${flaky} flaky`);
} catch (err) {
  console.error('Failed to generate report:', err.message);
  process.exit(0); // Don't fail CI for report issues
}
