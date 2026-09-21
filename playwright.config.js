import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  projects: ['chromium', 'firefox', 'webkit'].map(browserName => ({ name: browserName, use: { browserName } })),
  use: { baseURL: 'http://127.0.0.1:4180' },
  webServer: {
    command: 'node tests/serve.mjs',
    url: 'http://127.0.0.1:4180/tests/fixture.html',
    reuseExistingServer: !process.env.CI,
  },
});
