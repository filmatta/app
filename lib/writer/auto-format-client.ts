"use client";

import type { WriterAutoFormatClassification, WriterAutoFormatPlan } from "./smart-format";

export async function classifyWriterAutoFormat(
  scriptId: string,
  input: { scope: WriterAutoFormatPlan["scope"]; blockIds: readonly string[] },
): Promise<WriterAutoFormatClassification[]> {
  const response = await fetch(`/api/writer/scripts/${scriptId}/auto-format`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationId: crypto.randomUUID(), scope: input.scope, blockIds: input.blockIds }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.classifications)) {
    throw new Error(typeof data.error === "string" ? data.error : "No se pudo completar la clasificación contextual.");
  }
  return data.classifications as WriterAutoFormatClassification[];
}
