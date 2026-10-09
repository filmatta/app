import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { exportedDocumentVersion } from "@/lib/production/document-version";
import { CreateProjectError, type CreateProjectContext } from "./project";

export type RecentProjectDocument = {
  documentKey: string;
  label: string;
  productionId: string;
  productionName: string;
  version: string;
  generatedAt: string;
};

const documentLabels: Record<string, string> = {
  pack: "Production Pack",
  calendar: "Calendario de rodaje",
  script: "Guion de producción",
  shotlist: "Shotlist",
  storyboard: "Storyboard",
};

export async function getRecentProjectDocuments(
  db: SupabaseClient,
  ownerId: string,
  project: CreateProjectContext,
): Promise<RecentProjectDocument[]> {
  if (project.ownerId !== ownerId) throw new CreateProjectError("not_found", "Proyecto no encontrado.");

  const productionNames = new Map(project.productions
    .filter((production) => production.projectId === project.id)
    .map((production) => [production.id, production.title]));
  const productionIds = [...productionNames.keys()];
  if (!productionIds.length) return [];

  const result = await db.from("production_document_exports")
    .select("document_key,production_id,version_major,version_minor,generated_at")
    .eq("owner_id", ownerId)
    .in("production_id", productionIds)
    .order("generated_at", { ascending: false })
    .limit(4);
  if (result.error) throw new CreateProjectError("storage", "No pudimos cargar los documentos recientes.");

  return (result.data ?? []).flatMap((row) => {
    const productionId = String(row.production_id);
    const productionName = productionNames.get(productionId);
    if (!productionName) return [];
    const documentKey = String(row.document_key);
    return [{
      documentKey,
      label: documentKey.startsWith("call-sheet:") ? "Call Sheet" : documentLabels[documentKey] ?? documentKey,
      productionId,
      productionName,
      version: exportedDocumentVersion({ versionMajor: Number(row.version_major), versionMinor: Number(row.version_minor) }),
      generatedAt: String(row.generated_at),
    }];
  });
}
