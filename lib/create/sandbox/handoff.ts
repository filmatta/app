import { IDEATION_SECTIONS, type IdeationCue, type IdeationSynthesis } from "../ideation/contract.ts";

export function emptySandboxSynthesis(summary: string): IdeationSynthesis {
  const sections = Object.fromEntries(IDEATION_SECTIONS.map((id) =>
    [id, { text: id === "premise" ? summary.slice(0, 1000) : "", basis: id === "premise" && summary ? "source" : "open" }]));
  return { sections: sections as IdeationSynthesis["sections"], cues: [] };
}

export function addSandboxGuideMaterial(base: IdeationSynthesis,
  selected: { id: string; content: string; state: string }[], questions: string[], newDecisions: string[]): IdeationSynthesis {
  const cues = [...base.cues];
  const already = new Set<string>();
  for (const cue of cues) {
    already.add(cue.cue.trim().toLowerCase());
    if ("sourcePossibilityId" in cue) already.add(String(cue.sourcePossibilityId));
  }
  for (const item of selected) {
    if (cues.length >= 10) break;
    const normalized = item.content.trim().toLowerCase();
    if (already.has(item.id) || already.has(normalized)) continue;
    const cue: IdeationCue & { sourcePossibilityId: string } = {
      label: (item.content.trim().split(/[.!?]/u)[0] || "Decisión").slice(0, 100),
      objective: item.state === "canon" ? "Desarrollar esta decisión aceptada." : "Explorar esta posibilidad sin fijarla.",
      cue: item.content.trim().slice(0, 220), characters: [], setup: "", payoff: "",
      basis: item.state === "canon" ? "source" : "suggestion", sourcePossibilityId: item.id,
    };
    cues.push(cue); already.add(item.id); already.add(normalized);
  }
  for (const text of newDecisions) {
    if (cues.length >= 10) break;
    const clean = text.trim(); if (!clean || already.has(clean.toLowerCase())) continue;
    cues.push({ label: clean.slice(0, 100), objective: "Desarrollar la decisión añadida durante el traspaso.",
      cue: clean.slice(0, 220), characters: [], setup: "", payoff: "", basis: "source" });
    already.add(clean.toLowerCase());
  }
  const extraQuestions = questions.map((value) => value.trim()).filter(Boolean).join(" · ");
  const currentQuestions = base.sections.openQuestions.text.trim();
  const combinedQuestions = [currentQuestions, extraQuestions].filter(Boolean).join(" · ").slice(0, 1800);
  return { sections: { ...base.sections, openQuestions: {
    text: combinedQuestions, basis: combinedQuestions ? "source" : "open",
  } }, cues };
}
