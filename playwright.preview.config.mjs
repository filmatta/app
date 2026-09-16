import { defineConfig } from "@playwright/test";
import { testConfiguration } from "./tests/integration/test-project.mjs";
import { previewBase } from "./tests/remote/preview-access.mjs";
testConfiguration();
if (!process.env.FILMATTA_PREVIEW_URL)
  throw Error("Explicit remote Preview URL required");
export default defineConfig({
  testDir: "./tests/remote",
  workers: 1,
  timeout: 900000,
  expect: { timeout: 20000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/preview-results.json" }],
  ],
  use: {
    baseURL: previewBase,
    actionTimeout: 30000,
    navigationTimeout: 45000,
    channel: "chrome",
    headless: true,
    trace: "off",
    screenshot: "off",
  },
});
