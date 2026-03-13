import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';

const TARGET_URL = process.env.TARGET_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5000';
const isCI = !!process.env.CI;

// Load quarantined tests to exclude from CI runs
const quarantineFile = 'tests/e2e/quarantine.json';
const quarantined: string[] = existsSync(quarantineFile)
  ? JSON.parse(readFileSync(quarantineFile, 'utf8')).quarantined
  : [];

// Build grep pattern to exclude quarantined tests
const quarantineGrep = quarantined.length > 0
  ? new RegExp(`^(?!.*(${quarantined.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`)
  : undefined;

export default defineConfig({
  testDir: './tests/e2e/specs',
  timeout: 600000, // 10 minutes per test (lesson generation is slow)
  fullyParallel: false, // sequential — many tests share auth state
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,

  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { open: 'never', outputFolder: 'tests/e2e/report' }],
  ],

  // Skip quarantined tests in CI
  grep: quarantineGrep,

  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    baseURL: TARGET_URL,
    screenshot: 'on',
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
  },

  outputDir: './test-results',

  // Local dev: start the server
  ...(TARGET_URL.includes('localhost')
    ? {
        webServer: {
          command: 'ts-node server/index.ts',
          port: parseInt(TARGET_URL.split(':').pop() || '5000'),
          reuseExistingServer: true,
          timeout: 60000,
        },
      }
    : {}),

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
