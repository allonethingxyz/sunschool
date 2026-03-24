import { PlaywrightTestConfig } from '@playwright/test';

// Target the Replit deployment or local server
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5000';

const config: PlaywrightTestConfig = {
  globalTeardown: './tests/e2e/global-teardown.ts',
  testDir: './tests/e2e',
  timeout: 600000, // 10 minutes per test (lesson generation is slow)
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
  outputDir: './tests/e2e/screenshots',
  reporter: [['list'], ['html', { open: 'never', outputFolder: './tests/e2e/report' }]],
};

export default config;
