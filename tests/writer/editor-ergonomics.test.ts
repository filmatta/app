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
import {
  countRedundantWriterBlankBlocks,
  normalizeWriterPresentationContent,
  redundantWriterBlankBlockIds,
} from "../../lib/writer/spacing.ts";
import {
  isWriterTextInputKey,
  WRITER_TYPEWRITER_AUDIO_URL,
  WRITER_TYPEWRITER_EFFECTIVE_DURATION_SECONDS,
  WRITER_TYPEWRITER_MAX_ACTIVE_VOICES,
  writerTypewriterVoiceSettings,
} from "../../lib/writer/typewriter-sound.ts";

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

test("automatic format removes technical blank blocks because spacing is stylesheet-owned", () => {
  const first = createBlock("action");
  const second = createBlock("action");
  const third = createBlock("action");
  const document: WriterDocument = { type: "doc", content: [
    createBlock("action", "Una puerta se abre."), first, second, third,
    createBlock("character", "MARA"), createBlock("dialogue", "Llegué."),
  ] };
  assert.equal(countRedundantWriterBlankBlocks(document), 3);
  assert.deepEqual(redundantWriterBlankBlockIds(document), [first.attrs.id, second.attrs.id, third.attrs.id]);
});

test("spacing fixture normalizes 1, 2, 3 and 5 blank runs without touching semantic text", () => {
  const runLengths = [1, 2, 3, 5];
  const blanks = runLengths.flatMap((length) => Array.from({ length }, () => createBlock("action", "\u00a0")));
  const document: WriterDocument = {
    type: "doc",
    content: [
      createBlock("sceneHeading", "INT. CABINA - NOCHE"),
      createBlock("action", "Una radio espera."),
      ...blanks.slice(0, 1),
      createBlock("character", "MARA"),
      ...blanks.slice(1, 3),
      createBlock("dialogue", "Sigue encendida."),
      ...blanks.slice(3, 6),
      createBlock("action", "Detrás del cristal, la ciudad duerme."),
      ...blanks.slice(6),
      createBlock("transition", "CORTE A:"),
    ],
  };
  assert.equal(countRedundantWriterBlankBlocks(document), 11);
  assert.deepEqual(redundantWriterBlankBlockIds(document), blanks.map((block) => block.attrs.id));
  const semanticBefore = document.content.map((block) => block.content?.map((node) => node.type === "text" ? node.text : "").join("") ?? "").join(" ").match(/\S+/gu);
  const semanticAfter = document.content
    .filter((block) => !redundantWriterBlankBlockIds(document).includes(block.attrs.id))
    .map((block) => block.content?.map((node) => node.type === "text" ? node.text : "").join("") ?? "")
    .join(" ")
    .match(/\S+/gu);
  assert.deepEqual(semanticAfter, semanticBefore);
});

test("automatic format collapses technical newlines and imported presentation whitespace", () => {
  const block = createBlock("action", "placeholder");
  block.content = [
    { type: "hardBreak" },
    { type: "text", text: "  Detrás\u00a0del cristal.  " },
    { type: "hardBreak" },
    { type: "hardBreak" },
    { type: "text", text: "  La ciudad duerme.\u200b" },
    { type: "hardBreak" },
  ];
  const normalized = normalizeWriterPresentationContent(block);
  assert.deepEqual(normalized, [
    { type: "text", text: "Detrás del cristal." },
    { type: "hardBreak" },
    { type: "text", text: "La ciudad duerme." },
  ]);
  const wordsBefore = block.content.flatMap((node) => node.type === "text" ? node.text.replace(/[\u00a0\u200b]/gu, " ").match(/\S+/gu) ?? [] : []);
  const wordsAfter = normalized?.flatMap((node) => node.type === "text" ? node.text.match(/\S+/gu) ?? [] : []) ?? [];
  assert.deepEqual(wordsAfter, wordsBefore);
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
  assert.equal(isWriterTextInputKey({ key: "Backspace", ctrlKey: false, metaKey: false, altKey: false, isComposing: false }), false);
  assert.equal(isWriterTextInputKey({ key: "Enter", ctrlKey: false, metaKey: false, altKey: false, isComposing: false }), false);
});

test("typewriter WAV playback is short, quiet and bounded", () => {
  const settings = writerTypewriterVoiceSettings(() => 0);
  const upper = writerTypewriterVoiceSettings(() => 1);
  assert.equal(WRITER_TYPEWRITER_AUDIO_URL, "/audio/writer/typewriter-key.wav");
  assert.equal(WRITER_TYPEWRITER_EFFECTIVE_DURATION_SECONDS, 0.2);
  assert.equal(WRITER_TYPEWRITER_MAX_ACTIVE_VOICES, 4);
  assert.ok(settings.gain >= 0.048 && upper.gain <= 0.059);
  assert.ok(settings.playbackRate >= 0.975 && upper.playbackRate <= 1.025);
  const source = readFileSync(new URL("../../lib/writer/typewriter-sound.ts", import.meta.url), "utf8");
  assert.match(source, /decodeAudioData/u);
  assert.match(source, /createBufferSource/u);
  assert.doesNotMatch(source, /createOscillator/u);
});

test("typewriter WAV bypasses the session proxy and remains a static asset", () => {
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /webp\|wav/u);
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
  assert.match(timeline, /name=\{expanded \? "collapse" : "expand"\}/u);
  assert.doesNotMatch(timeline, /⛶/u);
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
