import { PlaywrightTestConfig } from '@playwright/test';

// Target the Railway staging deployment, production, or local server
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5000';

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  testMatch: ['specs/**/*.spec.ts', '*.spec.ts'],
  timeout: 600000, // 10 minutes per test (lesson generation is slow)
  retries: process.env.CI ? 2 : 0,
  // Only start local server if targeting localhost
  ...(baseURL.includes('localhost') ? {
    webServer: {
      command: 'ts-node server/index.ts',
      port: parseInt(baseURL.split(':').pop() || '5000'),
      reuseExistingServer: true,
      timeout: 60000,
    },
  } : {}),
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    baseURL,
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  outputDir: './test-results',
  reporter: process.env.CI
    ? [['json', { outputFile: 'test-results/results.json' }], ['list']]
    : [['list'], ['html', { open: 'never', outputFolder: './tests/e2e/report' }]],
};

export default config;
