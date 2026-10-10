import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  parseWriterInternalHistory,
  recordWriterInternalRoute,
  sanitizeWriterInternalRoute,
  stepWriterInternalHistory,
} from "../../lib/writer/internal-navigation.ts";

test("Writer internal history allowlists product routes and strips sensitive queries", () => {
  assert.equal(sanitizeWriterInternalRoute("/writer/11111111-1111-4111-8111-111111111111?scene=22222222-2222-4222-8222-222222222222&token=secret"), "/writer/11111111-1111-4111-8111-111111111111?scene=22222222-2222-4222-8222-222222222222");
  assert.equal(sanitizeWriterInternalRoute("https://example.com/writer"), null);
  assert.equal(sanitizeWriterInternalRoute("/login?next=/writer"), null);
  assert.equal(sanitizeWriterInternalRoute("/_vercel_share/token"), null);
});

test("Writer internal history branches after Back without duplicating adjacent routes", () => {
  let history = parseWriterInternalHistory(null);
  history = recordWriterInternalRoute(history, "/writer");
  history = recordWriterInternalRoute(history, "/writer/11111111-1111-4111-8111-111111111111");
  history = recordWriterInternalRoute(history, "/shotlists/22222222-2222-4222-8222-222222222222");
  const back = stepWriterInternalHistory(history, -1);
  assert.ok(back);
  history = recordWriterInternalRoute(back.history, "/writer/33333333-3333-4333-8333-333333333333");
  assert.deepEqual(history.entries, [
    "/writer",
    "/writer/11111111-1111-4111-8111-111111111111",
    "/writer/33333333-3333-4333-8333-333333333333",
  ]);
  assert.equal(stepWriterInternalHistory(history, 1), null);
});

test("Writer V3 keeps local import in the current document and exposes assisted new-script import", () => {
  const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
  const timeline = fs.readFileSync("components/writer/WriterTimeline.tsx", "utf8");
  const library = fs.readFileSync("components/writer/WriterLibrary.tsx", "utf8");
  assert.match(workspace, /currentDocument=\{\{ title, empty:/u);
  assert.match(workspace, /applyWriterImportedDocument\(editor, imported/u);
  assert.match(timeline, /onSelectScene=\{\(scene\) => activateScene\(scene, true\)\}/u);
  assert.match(library, /<WriterImportFlow onClose=/u);
  assert.match(library, />\s*Importar guion\s*</u);
  assert.match(library, /\+ Crear guión/u);
});

test("Writer V3 exposes distinct Shotlist loading, error, generate and open states", () => {
  const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
  assert.match(workspace, /"loading" \| "ready" \| "error"/u);
  assert.match(workspace, /Comprobando Shotlist/u);
  assert.match(workspace, /Reintentar consulta de Shotlist/u);
  assert.match(workspace, /Abrir shotlist/u);
  assert.match(workspace, /GENERAR SHOTLIST/u);
});
