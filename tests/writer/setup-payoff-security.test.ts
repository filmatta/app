import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const server = fs.readFileSync("lib/writer/setup-payoff-server.ts", "utf8");
const route = fs.readFileSync("app/api/writer/scripts/[id]/setup-payoff/route.ts", "utf8");
const client = fs.readFileSync("lib/writer/setup-payoff-client.ts", "utf8");
const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
const panel = fs.readFileSync("components/writer/WriterSetupPayoff.tsx", "utf8");
const exports = fs.readFileSync("lib/writer/export.ts", "utf8");

test("Setup / Payoff uses one explicit strict Terra request and never writes screenplay text", () => {
  assert.match(server, /model:\s*WRITER_SETUP_PAYOFF_MODEL/u);
  assert.match(server, /reasoning:\s*\{\s*effort:\s*"none"\s*\}/u);
  assert.match(server, /store:\s*false/u);
  assert.match(server, /strict:\s*true/u);
  assert.match(server, /sin escribir, reescribir ni sugerir escenas o diálogos/u);
  assert.doesNotMatch(server, /gpt-5\.6-sol|tools:\s*\[/u);
  assert.doesNotMatch(client, /setInterval|WebSocket/u);
  assert.equal((client.match(/method:\s*"POST"/gu) ?? []).length, 1);
});

test("the route authenticates before reading input and validates manual scene/block references", () => {
  assert.ok(route.indexOf("writerApiSession()") < route.indexOf("readWriterJson(request)"));
  assert.match(server, /\.eq\("owner_id", userId\)/u);
  assert.match(server, /sourceHash !== request\.sourceHash/u);
  assert.match(route, /deriveWriterSceneSources/u);
  assert.match(route, /stale_reference/u);
});

test("human authority, manual linking, scene navigation and Focus isolation are wired into Writer", () => {
  assert.match(panel, /Confirmar relación/u);
  assert.match(panel, /Descartar/u);
  assert.match(panel, /Cambiar vínculo/u);
  assert.match(panel, /Vincular payoff/u);
  assert.match(panel, /Ir a Setup/u);
  assert.match(panel, /Ir a Payoff/u);
  assert.match(workspace, /recordCurrentNavigation\(\)/u);
  assert.match(client, /focusMode \? \[\] : elements/u);
});

test("narrative relations remain external to canonical JSON, FDX and PDF exports", () => {
  assert.doesNotMatch(exports, /writer_narrative_|setup-payoff|SetupPayoff/u);
});
