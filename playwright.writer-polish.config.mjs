import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "profiles-search-v1.spec.ts",
    "writer-polish-timeline.spec.ts",
    "writer-writing-ux.spec.ts",
    "writer-usability-import.spec.ts",
  ],
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3105",
    channel: "chrome",
    headless: true,
  },
});
