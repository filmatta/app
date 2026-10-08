import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
const smart = fs.readFileSync("components/writer/WriterSmartFormatting.tsx", "utf8");
const setup = fs.readFileSync("components/writer/WriterSetupPayoff.tsx", "utf8");
const pulse = fs.readFileSync("components/writer/WriterNarrativePulse.tsx", "utf8");
const observations = fs.readFileSync("components/writer/WriterObservationsPanel.tsx", "utf8");
const css = fs.readFileSync("app/writer/writer.css", "utf8");

test("paste onboarding is an explicit modal with two decisions and one recovery flow", () => {
  assert.match(workspace, /assessWriterPaste\(text\)/u);
  assert.doesNotMatch(workspace, /writer-paste-assist/u);
  assert.match(smart, /WriterPasteFormatPrompt/u);
  assert.match(smart, /✦ Formatear este guion/u);
  assert.match(smart, /¿Continuar sin identificar la estructura\?/u);
  assert.match(smart, /CONTINUAR SIN FORMATO/u);
  assert.match(workspace, /startAutoFormat\("paste", pasteAssist\.blockIds\)/u);
  assert.match(smart, /Aplicar formato revisado/u);
});

test("readiness notices cover every structured Writer surface and remain dismissible", () => {
  for (const feature of ["review", "assistant", "setupPayoff", "guided", "timeline", "pulse"]) {
    assert.match(smart, new RegExp(`${feature}: \\{ title:`));
  }
  assert.match(smart, /Ahora no/u);
  assert.match(workspace, /timelineReadinessNotice=\{readinessNotice\("timeline"\)\}/u);
  assert.match(workspace, /pulseReadinessNotice=\{readinessNotice\("pulse"\)\}/u);
});

test("automatic formatting is hybrid, included, idempotent, and one undoable transaction", () => {
  assert.match(smart, /parser resuelve lo evidente/u);
  assert.match(smart, /0 AI Credits/u);
  assert.doesNotMatch(smart, /upgrade|paywall|checkout/iu);
  assert.match(workspace, /applyWriterAutoFormat\(editor, mutations, \{ blockIds: plan\.blockIds \}\)/u);
  assert.match(workspace, /refreshWriterDerivedStateAfterFormatting/u);
  assert.match(workspace, /Este documento ya parece estar correctamente formateado como guion/u);
});

test("Pulse turns one analysis intent into save, hash reload, and analysis", () => {
  assert.match(workspace, /onEnsureCurrentSaved=\{ensureCurrentDocumentSaved\}/u);
  assert.match(pulse, /Guardando cambios…/u);
  assert.match(pulse, /await onEnsureCurrentSaved\?\.\(\)/u);
  assert.match(pulse, /const latest = await pulse\.reload\(\)/u);
  assert.match(pulse, /pulse\.analyze\(latest\.currentSourceHash\)/u);
  assert.match(pulse, /Reintentar guardado/u);
});

test("smart indicator is shared only by analytical or automated actions", () => {
  assert.match(smart, /function SmartFeatureIndicator/u);
  assert.match(workspace, /label="FORMATO AUTOMÁTICO"/u);
  assert.match(pulse, /SmartFeatureIndicator label=\{pulse\.analysis/u);
  assert.doesNotMatch(workspace, /aria-label="Negrita"[^\n]*SmartFeatureIndicator/u);
});

test("Setup Payoff uses accessible inline accordions and separate navigation references", () => {
  assert.match(setup, /writer-setup-payoff-accordion/u);
  assert.match(setup, /aria-expanded=\{expanded\}/u);
  assert.match(setup, /writer-setup-payoff-reference/u);
  assert.doesNotMatch(setup, /selectedLink && <RelationDetail/u);
});

test("desktop layout keeps both sidebars and splitters full-height with Timeline only in center", () => {
  assert.match(css, /\.writer-sidebar \{[^}]*grid-row: 3 \/ -1/u);
  assert.match(css, /\.writer-observations-panel \{[^}]*grid-row: 3 \/ -1/u);
  assert.match(css, /\.writer-panel-resize-handle--left \{[^}]*grid-row: 3 \/ -1/u);
  assert.match(css, /\.writer-panel-resize-handle--right \{[^}]*grid-row: 3 \/ -1/u);
  assert.match(css, /\.writer-timeline-panel \{[^}]*grid-column: 2; grid-row: 4/u);
});

test("navigation uses one reference contract and a bounded highlight", () => {
  assert.match(workspace, /const navigateToWriterReference = useCallback/u);
  assert.match(workspace, /setWriterSceneHighlight\(editor, target\.id\)/u);
  assert.match(workspace, /window\.setTimeout\(clearSceneHighlight, 1_800\)/u);
  assert.match(workspace, /viewNarrativeObservation[\s\S]*navigateToWriterReference/u);
  assert.match(workspace, /viewSetupPayoffElement[\s\S]*navigateToWriterReference/u);
});

test("character review is binary first and asks about identity linking only after acceptance", () => {
  assert.match(observations, /¿“\{parseWriterCharacterCue\(first\.identity\)\.name[\s\S]*” es un personaje\?/u);
  assert.match(observations, /Sí, es personaje/u);
  assert.match(observations, />No<\/button>/u);
  assert.match(observations, /¿Es el mismo personaje que/u);
  assert.match(observations, /Crear identidad nueva/u);
  assert.doesNotMatch(observations, /Identidad por revisar|Vincular a existente|Sin evidencias claras/u);
});

test("character references use global navigation, stale copy, mobile close, and a bounded highlight", () => {
  assert.match(workspace, /function viewCharacterObservation[\s\S]*navigateToWriterReference/u);
  assert.match(workspace, /Este fragmento cambió desde la revisión\./u);
  assert.match(workspace, /viewCharacterObservation[\s\S]*max-width: 900px[\s\S]*setObservationsOpen\(false\)/u);
  assert.match(css, /writer-screenplay-block\.writer-scene-target-highlight[^}]*rgba\(86,205,230/u);
  assert.doesNotMatch(css, /writer-screenplay-block\.writer-scene-target-highlight[^}]*box-shadow/u);
});

test("Writer review keeps semantic colors on solid, compact controls", () => {
  assert.match(css, /--writer-intelligence:/u);
  assert.match(css, /--writer-review:/u);
  assert.match(css, /\.writer-character-review-card[^}]*border-radius: var\(--writer-radius-card\)[^}]*background: var\(--writer-panel-raised\)/u);
  assert.match(css, /\.writer-satin-button/u);
  assert.match(css, /\.writer-satin-button--primary/u);
});
