import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const server = fs.readFileSync("lib/writer/narrative-pulse-server.ts", "utf8");
const route = fs.readFileSync("app/api/writer/scripts/[id]/narrative-pulse/route.ts", "utf8");
const client = fs.readFileSync("lib/writer/narrative-pulse-client.ts", "utf8");
const component = fs.readFileSync("components/writer/WriterNarrativePulse.tsx", "utf8");
const timeline = fs.readFileSync("components/writer/WriterTimeline.tsx", "utf8");
const exportsSource = fs.readFileSync("lib/writer/export.ts", "utf8");
const scriptReadGrant = fs.readFileSync("supabase/migrations/20260930230000_writer_service_role_script_read.sql", "utf8");

test("Pulse runs one explicit strict Terra request and never analyzes on view load", () => { assert.match(server, /model:\s*WRITER_NARRATIVE_PULSE_MODEL/u); assert.match(server, /strict:\s*true/u); assert.match(server, /store:\s*false/u); assert.equal((client.match(/method:\s*"POST"/gu) ?? []).length, 1); assert.doesNotMatch(client, /setInterval|WebSocket/u); });
test("route authenticates before parsing and validates owner plus saved hash", () => { assert.ok(route.indexOf("writerApiSession()") < route.indexOf("readWriterJson(request)")); assert.match(server, /\.eq\("owner_id", userId\)/u); assert.match(server, /sourceHash !== request\.sourceHash/u); });
test("human milestones are authoritative while reanalysis replaces only pending AI suggestions", () => { assert.match(server, /source:\s*"user"/u); assert.match(server, /moved_by_user:\s*true/u); assert.match(server, /row\.source === "ai" && row\.status === "suggested"/u); assert.match(server, /known\.has\(fingerprint\)/u); });
test("Timeline and Pulse share selection, zoom and stable scene IDs", () => { assert.match(timeline, /selectedSceneKey/u); assert.match(timeline, /columnWidth=\{columnWidth\}/u); assert.match(timeline, /data-pulse-scene-id/u); assert.match(component, /scene\.sourceId/u); });
test("Pulse does not enter canonical exports or editor content", () => { assert.doesNotMatch(exportsSource, /narrative-pulse|NarrativePulse|writer_narrative_pulse/u); assert.doesNotMatch(component, /setContent|insertContent|chain\(\)\.focus/u); });
test("service role receives only the canonical script read privilege", () => { const grants = (scriptReadGrant.match(/grant\s+[^;]+;/giu) ?? []).join("\n"); assert.equal(grants.trim().toLowerCase(), "grant select on public.writer_scripts to service_role;"); assert.doesNotMatch(grants, /\b(?:anon|authenticated)\b/iu); });
