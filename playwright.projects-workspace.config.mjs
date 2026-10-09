import assert from "node:assert/strict";
import { defineConfig } from "@playwright/test";
import { testConfiguration } from "./tests/integration/test-project.mjs";
import { previewBase } from "./tests/remote/preview-access.mjs";

testConfiguration();
assert.match(previewBase, /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/, "Use only this Work's isolated Preview.");

export default defineConfig({
  testDir: "./tests/remote",
  testMatch: "**/projects-workspace.spec.mjs",
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  use: { baseURL: previewBase, channel: "chrome", headless: true },
});
