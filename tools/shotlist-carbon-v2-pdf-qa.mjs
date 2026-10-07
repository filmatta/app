// Download the existing horizontal Shotlist PDF from an immutable Test Preview.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { TEST_REF } from "./portfolio-test-context.mjs";

assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF);
const preview = process.env.FILMATTA_SHOTLIST_V2_PREVIEW;
assert.match(preview ?? "", /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/u);
const qa = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "filmatta-storyboard-foundation-fixture.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "filmatta-shotlist-carbon-v2-fixture.json"), "utf8"));
const share = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "filmatta-shotlist-carbon-v2-preview-share.json"), "utf8"));
assert.equal(qa.projectRef, TEST_REF);
assert.equal(fixture.userId, qa.userId);
assert.equal(share.preview, preview);

const output = path.resolve("output/pdf/shotlist-carbon-v2-qa.pdf");
fs.mkdirSync(path.dirname(output), { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
try {
  await page.goto(share.shareUrl);
  await page.goto(`${preview}/login?next=${encodeURIComponent(`/shotlists/${fixture.linkedId}`)}`);
  await page.locator("#email").fill(qa.email);
  await page.locator("#password").fill(qa.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.getByRole("heading", { name: "Lista de planos" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /Exportar/u }).click();
  const dialog = page.getByRole("dialog", { name: "Exportar Shotlist" });
  await dialog.getByText("PDF tabular horizontal").waitFor();
  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await dialog.getByRole("button", { name: "Exportar PDF" }).click();
  const download = await downloadPromise;
  await download.saveAs(output);
  assert.ok(fs.statSync(output).size > 1000, "Exported PDF is empty.");
  console.log(JSON.stringify({ preview, pdfPath: output, bytes: fs.statSync(output).size, downloadSucceeded: true }));
} finally {
  await context.close();
  await browser.close();
}
