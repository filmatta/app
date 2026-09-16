import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:3105', channel: 'chrome', headless: true },
  webServer: [
    { command: 'node tests/e2e/mock-supabase.mjs', url: 'http://127.0.0.1:54329/health', reuseExistingServer: false },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3105',
      url: 'http://127.0.0.1:3105', timeout: 120000, reuseExistingServer: false,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-fixture-key', BILLING_ENABLED: 'false' },
    },
  ],
});
