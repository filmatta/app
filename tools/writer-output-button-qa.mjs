import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const TEST_REF = "ezlycwkuzkwcnhrhiruv";
const SUPABASE_CLI = "C:/Users/atlun/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe";
const baseUrl = process.env.FILMATTA_WRITER_QA_URL;
assert.ok(baseUrl, "FILMATTA_WRITER_QA_URL is required.");
assert.equal(process.env.FILMATTA_WRITER_QA_TEST_REF, TEST_REF, "Explicit Supabase Test opt-in required.");

const keys = JSON.parse(execFileSync(SUPABASE_CLI, [
  "projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const anonKey = keys.find((key) => key.name === "anon")?.api_key;
const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
assert.ok(anonKey && serviceKey, "Supabase Test keys unavailable.");

const url = `https://${TEST_REF}.supabase.co`;
const client = (key) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const service = client(serviceKey);
const email = `writer-output-${randomUUID()}@example.invalid`;
const password = `${randomBytes(24).toString("base64url")}aA1!`;
let userId = null;
let browser = null;

try {
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, created.error?.message);
  userId = created.data.user.id;
  const signed = client(anonKey);
  const session = await signed.auth.signInWithPassword({ email, password });
  assert.equal(session.error, null, session.error?.message);

  const document = makeLongDocument();
  const createdScript = await signed.rpc("writer_create_script", {
    p_operation_id: randomUUID(),
    p_title: "QA botón Outputs V1",
    p_document: document,
    p_schema_version: 1,
  });
  assert.equal(createdScript.error, null, createdScript.error?.message);
  const scriptId = createdScript.data[0].id;

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login?next=/writer/${scriptId}`, { waitUntil: "networkidle" });
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await Promise.all([
    page.waitForURL(new RegExp(`/writer/${scriptId}`), { timeout: 30_000 }),
    page.getByRole("button", { name: "Iniciar sesión" }).click(),
  ]);
  await page.locator(".writer-paper .tiptap").waitFor({ state: "visible" });
  await page.locator(".writer-save-status--cloud").waitFor({ state: "visible", timeout: 30_000 });

  const action = page.locator('[data-screenplay-kind="action"]').first();
  await action.click({ position: { x: 24, y: 16 } });
  await page.keyboard.press("End");
  await page.keyboard.type(" SNAPSHOT_ANTES_ñ");
  await page.getByRole("button", { name: "Exportar" }).click();
  await page.getByRole("button", { name: "PDF de guion" }).click();
  await page.getByRole("button", { name: "Generar PDF" }).click();
  await page.getByText("Generando PDF…", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Cancelar generación" }).click();
  await page.getByRole("button", { name: "Generar PDF" }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Generar PDF" }).click();
  await page.getByText("Generando PDF…", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });

  await action.click({ position: { x: 30, y: 16 } });
  await page.keyboard.press("End");
  await page.keyboard.type(" SNAPSHOT_DESPUES");
  await page.getByText(/PDF listo\./).waitFor({ state: "visible", timeout: 90_000 });

  const outputDir = path.resolve("tmp/pdfs");
  fs.mkdirSync(outputDir, { recursive: true });
  const pdfPath = path.join(outputDir, "filmatta-writer-boton-real.pdf");
  const pdfDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Descargar PDF" }).click(),
  ]);
  await pdfDownload[0].saveAs(pdfPath);
  assert.ok(fs.statSync(pdfPath).size > 10_000, "Downloaded PDF is unexpectedly small.");
  const editorTextAfterPdf = await page.locator(".writer-paper .tiptap").innerText();
  assert.match(editorTextAfterPdf, /SNAPSHOT_ANTES_ñ/);
  assert.match(editorTextAfterPdf, /SNAPSHOT_DESPUES/);
  await page.screenshot({ path: path.join(outputDir, "writer-output-panel-qa.png"), fullPage: false });

  await page.getByRole("button", { name: "Cerrar exportación PDF" }).click();
  await page.locator(".writer-save-status--cloud").waitFor({ state: "visible", timeout: 30_000 });
  const stableRemote = await signed.from("writer_scripts").select("revision,document").eq("id", scriptId).single();
  assert.equal(stableRemote.error, null, stableRemote.error?.message);
  assert.match(JSON.stringify(stableRemote.data.document), /SNAPSHOT_DESPUES/);

  await page.waitForTimeout(1_200);
  const afterExportRemote = await signed.from("writer_scripts").select("revision,document").eq("id", scriptId).single();
  assert.equal(afterExportRemote.error, null, afterExportRemote.error?.message);
  assert.equal(afterExportRemote.data.revision, stableRemote.data.revision, "Export changed the remote revision.");
  assert.deepEqual(afterExportRemote.data.document, stableRemote.data.document, "Export changed the remote document.");

  await page.getByRole("button", { name: "Exportar" }).click();
  const jsonPath = path.join(outputDir, "filmatta-writer-boton-real.json");
  const jsonDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Respaldo JSON" }).click(),
  ]);
  await jsonDownload[0].saveAs(jsonPath);
  const backup = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  assert.match(JSON.stringify(backup.document), /SNAPSHOT_DESPUES/);
  assert.deepEqual(
    backup.document.content.map((block) => block.attrs.id),
    stableRemote.data.document.content.map((block) => block.attrs.id),
  );

  await page.getByRole("button", { name: "Exportar" }).click();
  const fdxPath = path.join(outputDir, "filmatta-writer-boton-real.fdx");
  const fdxDownload = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "FDX básico" }).click(),
  ]);
  await fdxDownload[0].saveAs(fdxPath);
  const fdx = fs.readFileSync(fdxPath, "utf8");
  assert.match(fdx, /SNAPSHOT_DESPUES/);
  assert.doesNotMatch(fdx, /NOTA_PRIVADA_NO_EXPORTAR/);

  console.log(JSON.stringify({
    backend: TEST_REF,
    authenticatedFlow: "PASS",
    cancellation: "PASS",
    currentLocalSnapshot: "PASS",
    laterEditsExcludedFromInFlightPdf: "PENDING_PDF_EXTRACTION",
    editorRemainedInteractive: "PASS",
    exportDidNotMutateRemoteRevision: "PASS",
    exportDidNotMutateRemoteDocument: "PASS",
    jsonRegression: "PASS",
    fdxRegression: "PASS",
    pdfBytes: fs.statSync(pdfPath).size,
  }, null, 2));
} finally {
  await browser?.close();
  if (userId) {
    const removed = await service.auth.admin.deleteUser(userId);
    assert.equal(removed.error, null, removed.error?.message);
  }
}

function makeLongDocument() {
  const content = [];
  let words = 0;
  let scene = 1;
  while (words < 20_000) {
    content.push(makeBlock("sceneHeading", `EXT. QA ${scene} — NOCHE`));
    const action = Array.from({ length: 170 }, (_, index) => `acción${scene}_${index + 1}`);
    words += action.length;
    content.push(makeBlock("action", action.join(" ")));
    content.push(makeBlock("character", scene % 2 ? "ANA" : "MATEO"));
    content.push(makeBlock("parenthetical", "(en prueba)"));
    const dialogue = Array.from({ length: 130 }, (_, index) => `diálogo${scene}_${index + 1}`);
    words += dialogue.length;
    content.push(makeBlock("dialogue", dialogue.join(" ")));
    if (scene % 9 === 0) content.push(makeBlock("authorNote", `NOTA_PRIVADA_NO_EXPORTAR_${scene}`));
    scene += 1;
  }
  return { type: "doc", content };
}

function makeBlock(kind, value) {
  return {
    type: "screenplayBlock",
    attrs: { id: randomUUID(), kind },
    content: [{ type: "text", text: value }],
  };
}
