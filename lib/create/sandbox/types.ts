export type SandboxMode = "divergence" | "convergence";
export type SandboxPlan = "free" | "unlocked";
export type SandboxPossibilityState = "proposed" | "maybe" | "canon" | "discarded";

export type SandboxSession = {
  id: string;
  project_id: string;
  mode: SandboxMode;
  status: "active" | "archived";
  memory_summary: string;
};

export type SandboxTurn = {
  id: string;
  session_id: string;
  mode: SandboxMode;
  status: "pending" | "completed" | "failed";
  response: SandboxAiResponse | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

export type SandboxMessage = {
  id: string;
  turn_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type SandboxPossibility = {
  id: string;
  content: string;
  title: string | null;
  state: SandboxPossibilityState;
  conflicts_with_id: string | null;
  source_turn_id: string | null;
  created_at: string;
};

export type SandboxAiPossibility = {
  title: string;
  content: string;
  conflicts_with_canon_id: string | null;
};

export type SandboxAiResponse = {
  assistant_message: string;
  possibilities: SandboxAiPossibility[];
  questions: string[];
  contradictions: string[];
  signals: string[];
  session_summary: string;
};

export type SandboxQuota = {
  plan: SandboxPlan;
  limit: number;
  used: number;
};

export function isSandboxAiResponse(value: unknown): value is SandboxAiResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const bounded = (text: unknown, max: number) => typeof text === "string" && text.trim().length > 0 && text.length <= max;
  if (!bounded(data.assistant_message, 4000) || typeof data.session_summary !== "string" || data.session_summary.length > 2400) return false;
  if (!Array.isArray(data.possibilities) || data.possibilities.length > 5 ||
      !data.possibilities.every((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const row = item as Record<string, unknown>;
        return bounded(row.title, 160) && bounded(row.content, 2000) &&
          (row.conflicts_with_canon_id === null || typeof row.conflicts_with_canon_id === "string");
      })) return false;
  return (["questions", "contradictions", "signals"] as const).every((key) =>
    Array.isArray(data[key]) && data[key].length <= 5 && data[key].every((item: unknown) => bounded(item, 300)));
}
