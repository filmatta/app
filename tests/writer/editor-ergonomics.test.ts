import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  createWriterFormatBaseline,
  invalidateWriterFormatBaseline,
  shouldInvalidateFormatBaseline,
  writerReadinessWithFormatBaseline,
} from "../../lib/writer/format-baseline.ts";
import { createMockWriterIdeas } from "../../lib/writer/ideas.ts";
import { findWriterSmartCandidates, findWriterText } from "../../lib/writer/search.ts";
import { countRedundantWriterBlankBlocks, redundantWriterBlankBlockIds } from "../../lib/writer/spacing.ts";
import { isWriterTextInputKey } from "../../lib/writer/typewriter-sound.ts";

function longDocument(sceneCount = 150): WriterDocument {
  return {
    type: "doc",
    content: Array.from({ length: sceneCount }, (_, index) => [
      createBlock("sceneHeading", `INT. LUGAR ${index + 1} - DÍA`),
      createBlock("action", index === 73 ? "María se tropieza con el cable junto a la puerta." : `Acción de la escena ${index + 1}.`),
      createBlock("character", "MARA"),
      createBlock("dialogue", `Línea ${index + 1}.`),
    ]).flat(),
  };
}

test("long Writer fixture has 150 scenes and search keeps stable block references", () => {
  const document = longDocument();
  assert.equal(document.content.filter((block) => block.attrs.kind === "sceneHeading").length, 150);
  const exact = findWriterText(document, "tropieza", {
    caseSensitive: false,
    wholeWord: true,
    scope: "document",
    sceneId: null,
  });
  assert.equal(exact.length, 1);
  assert.equal(exact[0]?.sceneNumber, 74);
  assert.match(exact[0]?.snippet ?? "", /María se tropieza/u);
  assert.match(exact[0]?.blockId ?? "", /^[0-9a-f-]{36}$/u);
  const smart = findWriterSmartCandidates(document, "¿En qué parte del guion se tropieza María?", "document", null);
  assert.equal(smart[0]?.sceneNumber, 74);
});

test("format baseline survives normal edits and scopes structural invalidation", () => {
  const document = longDocument(3);
  const baseline = createWriterFormatBaseline(document, 4);
  assert.equal(shouldInvalidateFormatBaseline({ kind: "text" }), false);
  assert.equal(shouldInvalidateFormatBaseline({ kind: "autosave" }), false);
  assert.equal(shouldInvalidateFormatBaseline({ kind: "structural", reason: "largeReplace", replacementCount: 7 }), false);
  assert.equal(shouldInvalidateFormatBaseline({ kind: "structural", reason: "largeReplace", replacementCount: 8 }), true);
  assert.equal(writerReadinessWithFormatBaseline(document, baseline).state, "READY");
  const pasted = createBlock("action", "EXT. NUEVO LUGAR - NOCHE");
  const partial = { ...document, content: [...document.content, pasted] };
  const invalidated = invalidateWriterFormatBaseline(baseline, {
    kind: "structural",
    reason: "significantPaste",
    affectedBlockIds: [pasted.attrs.id],
  });
  assert.equal(writerReadinessWithFormatBaseline(partial, invalidated).state, "PARTIALLY_FORMATTED");
  assert.deepEqual(writerReadinessWithFormatBaseline(partial, invalidated).suspiciousBlockIds, [pasted.attrs.id]);
});

test("automatic format identifies only redundant presentation blank runs", () => {
  const first = createBlock("action");
  const second = createBlock("action");
  const third = createBlock("action");
  const document: WriterDocument = { type: "doc", content: [
    createBlock("action", "Una puerta se abre."), first, second, third,
    createBlock("character", "MARA"), createBlock("dialogue", "Llegué."),
  ] };
  assert.equal(countRedundantWriterBlankBlocks(document), 2);
  assert.deepEqual(redundantWriterBlankBlockIds(document), [second.attrs.id, third.attrs.id]);
});

test("Ideas QA contract returns conceptual directions without screenplay dialogue", () => {
  const ideas = createMockWriterIdeas(longDocument(2), {
    scope: "scene",
    sceneId: longDocument(1).content[0]?.attrs.id ?? null,
    question: "Aumentar el conflicto",
    category: "Conflicto",
  });
  assert.equal(ideas.length, 5);
  assert.equal(ideas[0]?.category, "Conflicto");
  for (const idea of ideas) {
    assert.ok(idea.direction.length > 20);
    assert.ok(idea.consequence.length > 20);
    assert.doesNotMatch(idea.direction, /^(?:INT\.|EXT\.|[A-ZÁÉÍÓÚÑ ]+:)/u);
  }
});

test("typewriter trigger excludes shortcuts, navigation and IME", () => {
  assert.equal(isWriterTextInputKey({ key: "a", ctrlKey: false, metaKey: false, altKey: false, isComposing: false }), true);
  assert.equal(isWriterTextInputKey({ key: "c", ctrlKey: true, metaKey: false, altKey: false, isComposing: false }), false);
  assert.equal(isWriterTextInputKey({ key: "ArrowLeft", ctrlKey: false, metaKey: false, altKey: false, isComposing: false }), false);
  assert.equal(isWriterTextInputKey({ key: "あ", ctrlKey: false, metaKey: false, altKey: false, isComposing: true }), false);
});

test("Writer UI exposes independent scroll regions, usable thumbs and expanded analysis", () => {
  const css = readFileSync(new URL("../../app/writer/writer.css", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../../components/writer/WriterWorkspace.tsx", import.meta.url), "utf8");
  const timeline = readFileSync(new URL("../../components/writer/WriterTimeline.tsx", import.meta.url), "utf8");
  assert.match(css, /::-webkit-scrollbar-thumb[^}]*min-height:\s*40px/u);
  assert.match(css, /\.writer-scene-region[^}]*overflow-y:\s*auto/u);
  assert.match(css, /\.writer-character-section\s*>\s*ul[^}]*overflow-y:\s*auto/u);
  assert.match(css, /writer-workspace--timeline-expanded/u);
  assert.match(workspace, /charactersCollapsed/u);
  assert.match(timeline, /⛶ Expandir/u);
});

test("checkpoints are owner-scoped, bounded and created before structural operations", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20261001010000_writer_editor_ergonomics_v1.sql", import.meta.url), "utf8");
  const aclFix = readFileSync(new URL("../../supabase/migrations/20261001011000_writer_editor_ergonomics_acl_fix.sql", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/writer/scripts/[id]/checkpoints/route.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../../components/writer/WriterWorkspace.tsx", import.meta.url), "utf8");
  assert.match(migration, /alter table public\.writer_checkpoints enable row level security/u);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/u);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete).* to anon/iu);
  assert.match(aclFix, /revoke all on public\.writer_checkpoints from service_role/u);
  assert.match(aclFix, /grant select, insert, update on public\.writer_smart_tool_operations to service_role/u);
  assert.doesNotMatch(aclFix, /grant (?:delete|truncate|trigger|references)/iu);
  assert.match(route, /WRITER_AUTO_CHECKPOINT_RETENTION/u);
  assert.match(workspace, /kind: "before_auto_format"/u);
  assert.match(workspace, /kind: "before_replace_all"/u);
  assert.match(workspace, /kind: "before_restore"/u);
});

test("Smart Search and Ideas endpoints are local QA implementations with zero external cost", () => {
  const smart = readFileSync(new URL("../../app/api/writer/scripts/[id]/smart-search/route.ts", import.meta.url), "utf8");
  const ideas = readFileSync(new URL("../../app/api/writer/scripts/[id]/ideas/route.ts", import.meta.url), "utf8");
  assert.match(smart, /buildWriterSmartSearchContext/u);
  assert.match(ideas, /buildGuidedWritingContext/u);
  for (const source of [smart, ideas]) {
    assert.doesNotMatch(source, /openai|responses\.create|chat\.completions/iu);
    assert.match(source, /costMicrousd:\s*0/u);
    assert.match(source, /mocked:\s*true/u);
  }
});
