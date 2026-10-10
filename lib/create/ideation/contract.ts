export const IDEATION_FIELDS = [
  "premise", "protagonist", "goal", "conflict", "antagonist", "stakes", "incident",
  "escalation", "images", "turn", "ending", "theme", "tone", "openQuestions",
] as const;

export type IdeationFieldId = (typeof IDEATION_FIELDS)[number];
export type FieldStatus = "known" | "partial" | "missing" | "contradictory";
export type IdeationField = { status: FieldStatus; value: string; evidence: string; confidence: number };
export type IdeationAnalysis = { fields: Record<IdeationFieldId, IdeationField> };
export type IdeationSection = { text: string; basis: "source" | "inference" | "open" };
export const IDEATION_SECTIONS = ["premise", "protagonists", "goal", "conflict", "stakes", "incident", "milestones", "images", "ending", "theme", "openQuestions"] as const;
export type IdeationSectionId = (typeof IDEATION_SECTIONS)[number];
export type IdeationCue = { label: string; objective: string; cue: string; characters: string[]; setup: string; payoff: string; basis: "source" | "suggestion" };
export type IdeationSynthesis = { sections: Record<IdeationSectionId, IdeationSection>; cues: IdeationCue[] };

export const IDEATION_QUESTIONS = [
  { id: "protagonist", title: "¿Quién protagoniza esta historia?", helper: "La persona cuyas decisiones hacen avanzar la historia." },
  { id: "goal", title: "¿Qué quiere conseguir?", helper: "Un deseo concreto ayuda a ver hacia dónde se mueve la historia." },
  { id: "conflict", title: "¿Qué se lo impide?", helper: "El conflicto es la fuerza que dificulta alcanzar ese objetivo." },
  { id: "stakes", title: "¿Qué puede perder?", helper: "Las apuestas muestran qué cambia si fracasa." },
  { id: "incident", title: "¿Qué pone la historia en marcha?", helper: "Una decisión o hecho que rompe la normalidad." },
  { id: "escalation", title: "¿Cómo se complica?", helper: "Piensa en obstáculos o cambios que aumentan la presión." },
  { id: "images", title: "¿Qué escenas o imágenes ya ves?", helper: "Momentos concretos, aunque aún no sepas dónde encajan." },
  { id: "turn", title: "¿Hay un giro o revelación?", helper: "Puede cambiar lo que sabemos o el rumbo de la historia." },
  { id: "ending", title: "¿Cómo imaginas el final?", helper: "Puede ser una imagen, emoción o consecuencia." },
  { id: "theme", title: "¿Qué quieres que permanezca?", helper: "Una pregunta o sensación que quieras dejar en quien la vea." },
] as const;

export type IdeationQuestionId = (typeof IDEATION_QUESTIONS)[number]["id"];

export function selectQuestions(analysis: IdeationAnalysis, answers: Record<string, string>): IdeationQuestionId[] {
  return IDEATION_QUESTIONS.filter(({ id }) => !answers[id]?.trim() && analysis.fields[id].status !== "known")
    .map(({ id }) => id);
}

export function isIdeationAnalysis(value: unknown): value is IdeationAnalysis {
  if (!isRecord(value) || !isRecord(value.fields)) return false;
  const fields = value.fields;
  return IDEATION_FIELDS.every((id) => {
    const field = fields[id];
    return isRecord(field) && ["known", "partial", "missing", "contradictory"].includes(String(field.status))
      && typeof field.value === "string" && field.value.length <= 500
      && typeof field.evidence === "string" && field.evidence.length <= 500
      && typeof field.confidence === "number" && field.confidence >= 0 && field.confidence <= 1;
  });
}

export function isIdeationSynthesis(value: unknown): value is IdeationSynthesis {
  if (!isRecord(value) || !isRecord(value.sections) || !Array.isArray(value.cues) || value.cues.length > 10) return false;
  const sections = value.sections;
  if (!IDEATION_SECTIONS.every((id) => {
    const section = sections[id];
    return isRecord(section) && typeof section.text === "string" && section.text.length <= 1800
      && ["source", "inference", "open"].includes(String(section.basis));
  })) return false;
  return value.cues.every((cue) => isRecord(cue) && ["label", "objective", "cue", "setup", "payoff"].every((key) => typeof cue[key] === "string" && (cue[key] as string).length <= 220 && !(cue[key] as string).includes("\n"))
    && Array.isArray(cue.characters) && cue.characters.length <= 8 && cue.characters.every((name) => typeof name === "string" && name.length <= 80)
    && ["source", "suggestion"].includes(String(cue.basis)));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
