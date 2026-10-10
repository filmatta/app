import { isRecord, type IdeationSynthesis } from "./contract.ts";

export type IdeationPossibility = { content: string; state: string };
export type IdeationSandboxContext = {
  version: 1;
  originalIdea: string;
  synthesis: IdeationSynthesis;
  answers: Record<string, string>;
  knownCharacters: string;
  conflict: string;
  milestones: string;
  openQuestions: string;
  acceptedDecisions: string[];
  possibilities: string[];
};

export function buildIdeationSandboxContext(context: unknown, synthesis: IdeationSynthesis, items: IdeationPossibility[]): IdeationSandboxContext {
  const base = isRecord(context) ? context : {};
  const rawAnswers = isRecord(base.answers) ? base.answers : {};
  const answers = Object.fromEntries(Object.entries(rawAnswers).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return {
    version: 1,
    originalIdea: typeof base.originalIdea === "string" ? base.originalIdea : "",
    synthesis,
    answers,
    knownCharacters: synthesis.sections.protagonists.text,
    conflict: synthesis.sections.conflict.text,
    milestones: synthesis.sections.milestones.text,
    openQuestions: synthesis.sections.openQuestions.text,
    acceptedDecisions: items.filter((item) => item.state === "canon").map((item) => item.content),
    possibilities: items.filter((item) => item.state === "maybe").map((item) => item.content),
  };
}
