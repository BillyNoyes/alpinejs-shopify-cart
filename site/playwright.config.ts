import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:4175/alpinejs-shopify-cart/',
    browserName: 'chromium',
  },
  webServer: {
    command: 'node tests/serve.mjs',
    url: 'http://127.0.0.1:4175/alpinejs-shopify-cart/',
    reuseExistingServer: !process.env.CI,
  },
});
