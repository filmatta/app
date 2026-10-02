import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const baseURL = "http://127.0.0.1:3105";
const qaDir = path.resolve("docs/create-v1/qa");
for (const directory of [qaDir]) {
  fs.mkdirSync(directory, { recursive: true });
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];

for (const [name, width, height] of [
  ["1920", 1920, 1080],
  ["1440", 1440, 1000],
  ["834", 834, 1112],
  ["768", 768, 1024],
  ["390", 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  report.push({ page: "home", name, width, height, overflow });
  await page.screenshot({ path: path.join(qaDir, `home-${name}.png`), fullPage: true });
  await page.locator("#writer").screenshot({ path: path.join(qaDir, `writer-section-${name}.png`) });
  await page.locator("#shotlist").screenshot({ path: path.join(qaDir, `shotlist-section-${name}.png`) });
  await page.locator("#storyboard").screenshot({ path: path.join(qaDir, `storyboard-section-${name}.png`) });
  await page.close();
}

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "11111111-1111-4111-8111-111111111111", exp: 4102444800, role: "authenticated" })}.local-signature`;
await context.addCookies([{
  name: "sb-127-auth-token",
  value: "base64-" + b64({
    access_token: token,
    refresh_token: "local-refresh",
    expires_at: 4102444800,
    token_type: "bearer",
    user: { id: "11111111-1111-4111-8111-111111111111" },
  }),
  domain: "127.0.0.1",
  path: "/",
}]);
const dashboard = await context.newPage();
await dashboard.goto(`${baseURL}/cuenta`, { waitUntil: "networkidle" });
report.push({ page: "dashboard", overflow: await dashboard.evaluate(() => ({
  viewport: document.documentElement.clientWidth,
  content: document.documentElement.scrollWidth,
})) });
await dashboard.screenshot({ path: path.join(qaDir, "dashboard-new-user-1440.png"), fullPage: true });
await context.close();

fs.writeFileSync(path.join(qaDir, "capture-report.json"), JSON.stringify(report, null, 2) + "\n");
await browser.close();
