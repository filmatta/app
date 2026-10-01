import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const server = fs.readFileSync("lib/writer/guided-writing-server.ts", "utf8");
const client = fs.readFileSync("lib/writer/guided-writing-client.ts", "utf8");
const route = fs.readFileSync("app/api/writer/scripts/[id]/guided-writing/route.ts", "utf8");
const core = fs.readFileSync("lib/writer/guided-writing.ts", "utf8");
const panel = fs.readFileSync("components/writer/WriterGuidedWriting.tsx", "utf8");
const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
const assistant = fs.readFileSync("components/writer/WriterAssistantNarrative.tsx", "utf8");
const exports = fs.readFileSync("lib/writer/export.ts", "utf8");

test("Guided Writing uses one explicit strict Terra request and does not expose tools or screenplay generation", () => {
  assert.match(server, /model:\s*WRITER_GUIDED_WRITING_MODEL/u);
  assert.match(server, /reasoning:\s*\{\s*effort:\s*"none"\s*\}/u);
  assert.match(server, /store:\s*false/u);
  assert.match(server, /strict:\s*true/u);
  assert.match(server, /No escribas, completes ni reescribas escenas, di[aá]logos, acciones o p[aá]ginas/u);
  assert.doesNotMatch(server, /gpt-5\.6-sol|tools:\s*\[/u);
  assert.equal((client.match(/method:\s*"POST"/gu) ?? []).length, 1);
  assert.doesNotMatch(client, /setInterval|WebSocket/u);
});

test("the route authenticates before input parsing and the server validates saved owner/hash/context", () => {
  assert.ok(route.indexOf("writerApiSession()") < route.indexOf("readWriterJson(request)"));
  assert.match(server, /\.eq\("owner_id", userId\)/u);
  assert.match(server, /documentHash !== request\.documentHash/u);
  assert.match(server, /scene_not_found/u);
  assert.match(route, /validSelection/u);
});

test("references use stable internal IDs and human decisions outrank suggestions", () => {
  assert.match(core, /referenceId: `scene:\$\{scene\.sceneId\}`/u);
  assert.match(core, /referenceId: `observation:/u);
  assert.match(core, /referenceId: `narrative:/u);
  assert.match(core, /element\.source === "user" \? "user"/u);
  assert.match(core, /element\.status !== "dismissed"/u);
  assert.match(panel, /onReference\(reference\)/u);
  assert.match(workspace, /viewGuidedReference/u);
});

test("Focus isolation, cancellation, keyboard behavior and O-O-C scene copy are visible in the UI contract", () => {
  assert.match(workspace, /hidden=\{!observationsOpen \|\| focusMode\}/u);
  assert.match(panel, /Shift\+Enter añade una línea/u);
  assert.match(panel, /event\.nativeEvent\.isComposing/u);
  assert.match(panel, /Cancelar/u);
  assert.match(assistant, /O-O-C · Por escena/u);
});

test("Guided Writing state remains external to canonical JSON, FDX and PDF exports", () => {
  assert.doesNotMatch(exports, /guided-writing|GuidedWriting|writer_guided_/u);
  assert.ok(!workspace.includes("setContent(response"), "assistant responses must not enter editor content");
});
