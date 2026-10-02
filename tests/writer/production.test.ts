import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  detectWriterBreakdownRules,
  sceneLocationLabel,
  writerShotlistCsv,
  writerShotlistSummary,
  type WriterShotlist,
} from "../../lib/writer/production.ts";

test("Breakdown rules retain exact evidence and avoid metaphor/mention invention", () => {
  const heading = createBlock("sceneHeading", "INT. RADIO K-17 / CABINA - NOCHE", "11111111-1111-4111-8111-111111111111");
  const character = createBlock("character", "MARA", "22222222-2222-4222-8222-222222222222");
  const action = createBlock("action", "Mara sostiene una pistola mientras escucha. Su mirada era una pistola.", "33333333-3333-4333-8333-333333333333");
  const mention = createBlock("action", "Mara recuerda que su padre tenía una pistola.", "44444444-4444-4444-8444-444444444444");
  const document: WriterDocument = { type: "doc", content: [heading, character, action, mention] };
  const candidates = detectWriterBreakdownRules(document);
  assert.equal(candidates.filter((candidate) => candidate.category === "location").length, 1);
  assert.equal(candidates.filter((candidate) => candidate.category === "character").length, 1);
  const props = candidates.filter((candidate) => candidate.category === "prop");
  assert.equal(props.length, 1);
  assert.equal(props[0]?.name, "pistola");
  assert.equal(props[0]?.blockId, action.attrs.id);
  assert.equal(props[0]?.nature, "used");
  assert.equal(action.content?.[0]?.type === "text" ? action.content[0].text.slice(props[0]!.fromOffset, props[0]!.toOffset) : "", "pistola");
});

test("scene locations preserve hierarchy", () => {
  assert.equal(sceneLocationLabel("INT. RADIO K-17 / CABINA - NOCHE"), "RADIO K-17 / CABINA");
  assert.notEqual(sceneLocationLabel("INT. RADIO K-17 / ARCHIVO - NOCHE"), sceneLocationLabel("INT. RADIO K-17 / CABINA - NOCHE"));
});

test("CSV preserves Spanish and neutralizes spreadsheet formulas", () => {
  const shotlist = fixtureShotlist();
  shotlist.groups[0]!.shots[0]!.subject = "=HYPERLINK(\"https://invalid\")";
  shotlist.groups[0]!.shots[0]!.description = "Mara escucha la canción número veintidós.";
  const csv = writerShotlistCsv(shotlist);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /canción número veintidós/u);
  assert.ok(csv.endsWith("\r\n"));
});

test("summary reports partial duration honestly", () => {
  const shotlist = fixtureShotlist();
  const summary = writerShotlistSummary(shotlist.groups);
  assert.deepEqual(summary, { totalShots: 2, plannedGroups: 1, totalGroups: 1, durationSeconds: 6, missingDurations: 1 });
});

test("150 scenes and 3,000 shots derive summary and CSV within a bounded local budget", () => {
  const template = fixtureShotlist().groups[0]!.shots[0]!;
  const groups = Array.from({ length: 150 }, (_, groupIndex) => ({
    ...fixtureShotlist().groups[0]!, id: crypto.randomUUID(), position: groupIndex, title: `ESCENA ${groupIndex + 1}`,
    shots: Array.from({ length: 20 }, (_, shotIndex) => ({ ...template, id: crypto.randomUUID(), groupId: `g-${groupIndex}`, position: shotIndex, subject: `Acción ${groupIndex + 1}.${shotIndex + 1}` })),
  }));
  const started = performance.now();
  const summary = writerShotlistSummary(groups);
  const csv = writerShotlistCsv({ ...fixtureShotlist(), groups });
  const elapsed = performance.now() - started;
  assert.equal(summary.totalShots, 3_000);
  assert.ok(csv.length > 300_000);
  assert.ok(elapsed < 1_500, `derivation took ${elapsed.toFixed(1)} ms`);
});

function fixtureShotlist(): WriterShotlist {
  return { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", scriptId: null, title: "LA FRECUENCIA", sourceRevision: null, revision: 1, groups: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", shotlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceSceneId: null, sourceSceneTitle: null, title: "INT. RADIO K-17 — NOCHE", position: 0, sourceStatus: "manual", revision: 1, shots: [0, 1].map((position) => ({ id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${position}`, shotlistId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", groupId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sourceBlockId: null, origin: "manual", shotType: "Plano medio", composition: null, subject: "Mara escucha", angle: "A nivel", movement: "Fijo", support: null, lens: "50 mm", setup: "A", durationSeconds: position === 0 ? 6 : null, status: position === 0 ? "ready" : "pending", description: null, intention: null, notes: null, assetId: null, position, sourceRevision: null, revision: 1 })) }] };
}
