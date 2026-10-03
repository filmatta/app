import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Assistant surface has one clear name, four complete tabs and contextual help", () => {
  const panel = fs.readFileSync("components/writer/WriterObservationsPanel.tsx", "utf8");
  const workspace = fs.readFileSync("components/writer/WriterWorkspace.tsx", "utf8");
  assert.match(panel, /SmartFeatureIndicator label="Asistente"/u);
  for (const label of ["Formato", "O-O-C", "Setup \/ Payoff", "Guía"]) assert.match(panel, new RegExp(`>${label}<`, "u"));
  assert.match(panel, /<section aria-label="Formato">\s*<WriterAssistantSectionHeading title="FORMATO"/u);
  assert.match(panel, /No hay ajustes de formato pendientes en este documento\./u);
  assert.doesNotMatch(panel, /<small>Revisión<\/small>|<small>Assistant<\/small>|<small>Relaciones<\/small>/u);
  assert.match(workspace, /SmartFeatureIndicator label=\{`Asistente/u);
});

test("Breakdown exposes one full-document detection action and a presentation-only filter", () => {
  const panel = fs.readFileSync("components/writer/WriterBreakdownPanel.tsx", "utf8");
  const route = fs.readFileSync("app/api/writer/scripts/[id]/breakdown/route.ts", "utf8");
  assert.equal((panel.match(/label=\{busy \? "Detectando…" : "Detectar elementos"\}/gu) ?? []).length, 1);
  assert.match(panel, /action: "detectAll", scope: "document"/u);
  assert.match(panel, /<label>Mostrar<select/u);
  assert.match(panel, /className="writer-breakdown-more"/u);
  assert.match(fs.readFileSync("app/writer/writer.css", "utf8"), /\.writer-character-section \{[^}]*width:100%;[^}]*max-width:100%;[^}]*min-width:0;/u);
  assert.doesNotMatch(panel, /Detectar con asistencia|Escenas nuevas\/modificadas/u);
  assert.match(route, /Math\.ceil\(sceneIds\.length \/ 12\)/u);
  assert.match(route, /includeRules: false/u);
});

test("recognized characters render one appearance navigator instead of one button per reference", () => {
  const panel = fs.readFileSync("components/writer/WriterObservationsPanel.tsx", "utf8");
  assert.match(panel, /Aparición \{activeAppearanceIndex \+ 1\} de \{references\.length\}/u);
  assert.match(panel, /Ver dónde aparece/u);
  assert.doesNotMatch(panel, /references\.slice\([^)]*\)\.map/u);
});

test("Pulse observes its real container and uses one geometry for line and hit targets", () => {
  const component = fs.readFileSync("components/writer/WriterNarrativePulse.tsx", "utf8");
  assert.match(component, /new ResizeObserver\(measure\)/u);
  assert.match(component, /writerPulsePlotPoints\(displayPoints, graphWidth, graphHeight, 24\)/u);
  assert.match(component, /data-plot-x/u);
  assert.doesNotMatch(component, /const x = 24 \+ \(index/u);
});
