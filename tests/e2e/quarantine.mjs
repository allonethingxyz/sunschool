/**
 * Auto-quarantine flaky tests based on Playwright JSON results.
 * Used by .github/workflows/synthetic-e2e.yml
 *
 * Reads test results and flags tests that passed on retry (flaky).
 * Outputs a quarantine.json for future test runs to reference.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const jsonPath = 'test-results/results.json';
const quarantinePath = 'tests/e2e/quarantine.json';

// Load existing quarantine list
let quarantine = [];
if (existsSync(quarantinePath)) {
  try {
    quarantine = JSON.parse(readFileSync(quarantinePath, 'utf8'));
  } catch {
    quarantine = [];
  }
}

if (!existsSync(jsonPath)) {
  console.log('No test results — skipping quarantine check');
  process.exit(0);
}

try {
  const raw = readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  const suites = data.suites || [];
  let newFlaky = 0;

  function walkSpecs(specs, suitePath) {
    for (const spec of specs) {
      for (const test of spec.tests || []) {
        // A test is flaky if it has multiple results and the last one passed
        const results = test.results || [];
        if (results.length > 1 && results[results.length - 1]?.status === 'passed') {
          const testId = `${suitePath} > ${spec.title} > ${test.title}`;
          const existing = quarantine.find(q => q.testId === testId);
          if (!existing) {
            quarantine.push({
              testId,
              reason: 'auto-quarantined: passed on retry',
              date: new Date().toISOString(),
              retryCount: results.length,
            });
            newFlaky++;
            console.log(`Quarantined: ${testId} (${results.length} attempts)`);
          }
        }
      }
      if (spec.suites) {
        for (const sub of spec.suites) {
          walkSpecs(sub.specs || [], `${suitePath} > ${sub.title}`);
        }
      }
    }
  }

  for (const suite of suites) {
    walkSpecs(suite.specs || [], suite.title || '');
  }

  if (newFlaky > 0) {
    writeFileSync(quarantinePath, JSON.stringify(quarantine, null, 2));
    console.log(`${newFlaky} new flaky test(s) quarantined`);
  } else {
    console.log('No new flaky tests detected');
  }
} catch (err) {
  console.error('Quarantine check failed:', err.message);
  process.exit(0); // Don't fail CI
}
