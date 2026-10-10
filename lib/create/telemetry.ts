import "server-only";

type CreateEvent =
  | "project_created"
  | "writer_opened"
  | "shotlist_created"
  | "storyboard_opened"
  | "production_created"
  | "production_pack_exported"
  | "sandbox_opened"
  | "sandbox_message_sent"
  | "sandbox_response_received"
  | "sandbox_possibility_saved"
  | "sandbox_marked_maybe"
  | "sandbox_marked_canon"
  | "sandbox_possibility_discarded"
  | "sandbox_handoff_started"
  | "sandbox_handoff_applied"
  | "sandbox_free_limit_reached"
  | "sandbox_upgrade_clicked";

type CreateModule = "project" | "writer" | "shotlist" | "storyboard" | "production";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Preview logs are a small beta signal. Values are fixed event names and
// technical UUIDs only; creative text and user contact details never enter them.
export function recordCreateEvent(event: CreateEvent, ids: { userId?: string; projectId?: string | null; artifactId?: string | null }) {
  if (process.env.VERCEL_ENV !== "preview") return;
  console.info(JSON.stringify({
    source: "create_beta", event, at: new Date().toISOString(),
    userId: safeId(ids.userId), projectId: safeId(ids.projectId), artifactId: safeId(ids.artifactId),
  }));
}

export function reportCreateFailure(module: CreateModule, operation: string, cause: unknown, projectId?: string | null) {
  const errorType = cause instanceof Error ? cause.name : "unknown";
  const code = typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string"
    ? cause.code.slice(0, 24) : null;
  console.error(JSON.stringify({
    source: "create_beta", level: "error", module, operation: operation.slice(0, 48),
    errorType, code, projectId: safeId(projectId), at: new Date().toISOString(),
  }));
}

function safeId(value: string | null | undefined) { return value && UUID.test(value) ? value : null; }
