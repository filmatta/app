import { defineConfig } from "@playwright/test";
import { testConfiguration } from "./tests/integration/test-project.mjs";
// Explicit opt-in and fixed Test ref are checked before starting a browser/server.
const config = testConfiguration();
export default defineConfig({
  testDir: "./tests/remote",
  testMatch: "**/catalogs.spec.mjs",
  workers: 1,
  timeout: 600000,
  expect: { timeout: 20000 },
  use: { baseURL: "http://127.0.0.1:3106", channel: "chrome", headless: true },
  webServer: {
    command:
      process.env.FILMATTA_TEST_BUILD === "true"
        ? "npm run start -- --hostname 127.0.0.1 --port 3106"
        : "npm run dev -- --hostname 127.0.0.1 --port 3106",
    url: "http://127.0.0.1:3106",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: config.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      BILLING_ENABLED: "false",
    },
  },
});
