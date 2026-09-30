import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const server = fs.readFileSync("lib/writer/script-assistant-server.ts", "utf8");
const route = fs.readFileSync("app/api/writer/scripts/[id]/assistant/route.ts", "utf8");
const client = fs.readFileSync("lib/writer/script-assistant-client.ts", "utf8");
const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
const exports = fs.readFileSync("lib/writer/export.ts", "utf8");

test("provider contract is Terra none, strict Responses, store false and tool-free", () => {
  assert.match(server, /model:\s*WRITER_SCRIPT_ASSISTANT_MODEL/u);
  assert.match(server, /reasoning:\s*\{\s*effort:\s*"none"\s*\}/u);
  assert.match(server, /store:\s*false/u);
  assert.match(server, /strict:\s*true/u);
  assert.doesNotMatch(server, /gpt-5\.6-sol|tools:\s*\[/u);
  assert.match(server, /Cada evidencia debe referir únicamente a un blockId/u);
  assert.doesNotMatch(server, /console\.(?:info|log)\([^\n]*(?:scene\.blocks|providerInput|output_text)/u);
});

test("authenticated route validates ownership and saved scene before any provider call", () => {
  assert.ok(route.indexOf("writerApiSession()") < route.indexOf("readWriterJson(request)"));
  assert.match(server, /\.eq\("owner_id", userId\)/u);
  assert.match(server, /validateWriterDocument/u);
  assert.match(server, /sourceHash !== request\.sourceHash/u);
  assert.match(route, /\{ readDb: session\.supabase \}/u);
});

test("automatic trigger is ACK/idle gated, coalesced, and disabled in Focus or when Assistant is OFF", () => {
  assert.match(client, /!loaded \|\| !enabled \|\| focusMode \|\| saveStatus !== "cloud"/u);
  assert.match(client, /window\.setTimeout\(\(\) => void analyzeScene\(activeSceneId\), 3_500\)/u);
  assert.match(client, /inFlightRef\.current\.has/u);
  assert.doesNotMatch(client, /setInterval|WebSocket/u);
});

test("assistant metadata remains outside canonical JSON, FDX, PDF and undoable document content", () => {
  assert.doesNotMatch(exports, /writer_scene_analys|assistant-core|NarrativeObservation/u);
  assert.match(workspace, /setWriterAssistantMarkers/u);
  assert.doesNotMatch(workspace, /attrs:\s*\{[^}]*assistant/u);
});
