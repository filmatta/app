import { validateWriterDocument, type WriterSnapshot } from "./document.ts";

export type WriterCheckpointKind = "manual" | "before_auto_format" | "before_replace_all" | "before_restore";
export type WriterCheckpoint = {
  id: string;
  kind: WriterCheckpointKind;
  label: string;
  sourceRevision: number;
  createdAt: string;
};

export const WRITER_AUTO_CHECKPOINT_RETENTION = 15;

export async function listWriterCheckpoints(scriptId: string): Promise<WriterCheckpoint[]> {
  const response = await fetch(`/api/writer/scripts/${scriptId}/checkpoints`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "No pudimos cargar las versiones.");
  return Array.isArray(data.checkpoints) ? data.checkpoints : [];
}

export async function createWriterCheckpoint(
  scriptId: string,
  input: { kind: WriterCheckpointKind; label: string; snapshot: WriterSnapshot; sourceRevision: number },
) {
  const response = await fetch(`/api/writer/scripts/${scriptId}/checkpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "No pudimos crear la versión.");
  return data.checkpoint as WriterCheckpoint;
}

export async function loadWriterCheckpoint(scriptId: string, checkpointId: string) {
  const response = await fetch(`/api/writer/scripts/${scriptId}/checkpoints/${checkpointId}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "No pudimos recuperar la versión.");
  const snapshot = data.snapshot as WriterSnapshot;
  const valid = validateWriterDocument(snapshot?.document);
  if (!valid.ok || typeof snapshot?.title !== "string" || !Number.isSafeInteger(snapshot?.schemaVersion)) {
    throw new Error("La versión guardada no es compatible con este Writer.");
  }
  return { ...snapshot, document: valid.document };
}

export function writerCheckpointLabel(kind: WriterCheckpointKind, value?: string) {
  const manual = value?.trim().replace(/\s+/gu, " ").slice(0, 120);
  if (kind === "manual") return manual || `Versión manual · ${formatNow()}`;
  if (kind === "before_auto_format") return "Antes de Formato Automático";
  if (kind === "before_replace_all") return "Antes de Reemplazar todos";
  return "Antes de restaurar una versión";
}

function formatNow() {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date());
}
