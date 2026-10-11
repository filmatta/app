import { isIdeationSynthesis, isRecord, type IdeationSynthesis } from "../ideation/contract.ts";
import type { CreateProjectContext } from "../project";
import type { SandboxMessage, SandboxMode, SandboxPossibility } from "./types";
import type { ActiveWriterContext } from "./writer-context-server";

export type SandboxGuide = { context: unknown; synthesis: unknown; source_draft_id?: string | null };

export function initialSandboxBrief(project: Pick<CreateProjectContext, "name" | "summary">, guide: SandboxGuide | null) {
  const synthesis = guide && isIdeationSynthesis(guide.synthesis) ? guide.synthesis : null;
  if (!synthesis) return project.summary?.trim()
    ? `Estamos explorando «${project.name}». Lo que sabemos: ${project.summary.trim().slice(0, 280)}`
    : `Estamos explorando «${project.name}». Podemos partir de una premisa, un personaje, un conflicto o una imagen que ya tengas.`;
  const premise = synthesis.sections.premise.text.trim();
  const protagonists = synthesis.sections.protagonists.text.trim();
  const conflict = synthesis.sections.conflict.text.trim();
  const open = synthesis.sections.openQuestions.text.trim();
  return [
    premise ? `Estamos trabajando una historia sobre ${premise.slice(0, 230)}` : `Estamos explorando «${project.name}».`,
    protagonists && synthesis.sections.protagonists.basis !== "open" ? `Protagonista: ${protagonists.slice(0, 130)}.` : "",
    conflict && synthesis.sections.conflict.basis !== "open" ? `Conflicto: ${conflict.slice(0, 160)}.` : "",
    open && synthesis.sections.openQuestions.basis !== "open" ? `Sigue abierto: ${open.slice(0, 150)}.` : "",
  ].filter(Boolean).join(" ");
}

export function sandboxEntryPrompts(guide: SandboxGuide | null): string[] {
  const synthesis = guide && isIdeationSynthesis(guide.synthesis) ? guide.synthesis : null;
  if (!synthesis) return ["Cuestionar la premisa", "Explorar al protagonista", "Divagar libremente"];
  const prompts: string[] = [];
  if (synthesis.sections.protagonists.basis === "open") prompts.push("Explorar al protagonista");
  if (synthesis.sections.conflict.basis === "open") prompts.push("Intensificar el conflicto");
  if (synthesis.sections.ending.basis === "open") prompts.push("Buscar finales");
  if (synthesis.sections.images.basis === "open") prompts.push("Imaginar escenas");
  return [...prompts, "Cuestionar la premisa", "Divagar libremente"].slice(0, 5);
}

export function buildSandboxProviderContext(input: {
  project: Pick<CreateProjectContext, "id" | "name" | "summary" | "projectType" | "writers">;
  guide: SandboxGuide | null;
  possibilities: SandboxPossibility[];
  messages: SandboxMessage[];
  memorySummary: string;
  mode: SandboxMode;
  writerContext?: ActiveWriterContext | null;
}) {
  const synthesis: IdeationSynthesis | null = input.guide && isIdeationSynthesis(input.guide.synthesis) ? input.guide.synthesis : null;
  const source = input.guide && isRecord(input.guide.context) ? input.guide.context : {};
  const answers = isRecord(source.answers) ? source.answers : {};
  const canon = input.possibilities.filter((item) => item.state === "canon").map((item) => ({ id: item.id, content: item.content.slice(0, 1200) }));
  const maybe = input.possibilities.filter((item) => item.state === "maybe").map((item) => item.content.slice(0, 800));
  const latest = input.messages.slice(-14).map((message) => ({ role: message.role, content: message.content.slice(0, 3000) }));
  return {
    project: { id: input.project.id, title: input.project.name, summary: input.project.summary, type: input.project.projectType,
      writerTitles: input.project.writers.slice(0, 3).map((writer) => writer.title) },
    mode: input.mode,
    canon: canon.slice(-25),
    maybe: maybe.slice(-20),
    ideation: synthesis ? {
      originalIdea: typeof source.originalIdea === "string" ? source.originalIdea.slice(0, 10000) : "",
      answers: Object.fromEntries(Object.entries(answers).filter(([,value]) => typeof value === "string").slice(0, 12).map(([key,value]) => [key, String(value).slice(0, 800)])),
      analysis: isRecord(source.analysis) ? source.analysis : null,
      sections: synthesis.sections,
      cues: synthesis.cues.slice(0, 10),
    } : null,
    openQuestions: synthesis?.sections.openQuestions.text ?? "",
    writerContext: !synthesis && input.writerContext ? {
      source: "writer_opt_in", writerId: input.writerContext.writerId,
      writerRevision: input.writerContext.writerRevision, narrative: input.writerContext.summary,
    } : null,
    sessionSummary: input.memorySummary.slice(0, 2400),
    recentMessages: latest,
  };
}
