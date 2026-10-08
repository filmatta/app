import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { loadWriterShotlist } from "@/lib/writer/production-server";
import { validateWriterDocument, type WriterDocument } from "@/lib/writer/document";
import type { WriterShotlist } from "@/lib/writer/production";
import { loadStoryboardBoard } from "@/lib/storyboard/server";
import type { StoryboardBoard } from "@/lib/storyboard/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductionError } from "./server";
import type { ProductionWorkspaceData } from "./types";

export type ProductionStoryboardFrame = {
  groupTitle: string;
  shotNumber: string;
  shotType: string;
  description: string;
  movement: string;
  lens: string;
  image: string | null;
};

export type ProductionDocumentSources = {
  script: { title: string; document: WriterDocument } | null;
  shotlist: WriterShotlist | null;
  storyboard: ProductionStoryboardFrame[] | null;
};

export async function loadProductionDocumentSources(
  db: SupabaseClient,
  ownerId: string,
  data: ProductionWorkspaceData,
  selected: { script: boolean; shotlist: boolean; storyboard: boolean },
): Promise<ProductionDocumentSources> {
  const result: ProductionDocumentSources = { script: null, shotlist: null, storyboard: null };
  if (selected.script) {
    if (!data.production.scriptId) throw new ProductionError("invalid", "No hay guion vinculado a esta producción.");
    const row = await db.from("writer_scripts").select("title,document").eq("id", data.production.scriptId).eq("owner_id", ownerId).maybeSingle();
    if (row.error || !row.data) throw new ProductionError("invalid", "No pudimos cargar el guion vinculado.");
    const validated = validateWriterDocument(row.data.document);
    if (!validated.ok) throw new ProductionError("invalid", "El guion vinculado no tiene un formato compatible.");
    result.script = { title: String(row.data.title), document: validated.document };
  }
  if (selected.shotlist) {
    if (!data.production.shotlistId) throw new ProductionError("invalid", "No hay Shotlist vinculada a esta producción.");
    result.shotlist = (await loadWriterShotlist(db, ownerId, data.production.shotlistId)).shotlist;
  }
  if (selected.storyboard) {
    if (!data.production.shotlistId) throw new ProductionError("invalid", "No hay Storyboard vinculado a esta producción.");
    const board: StoryboardBoard = await loadStoryboardBoard(db, ownerId, data.production.shotlistId);
    const panels = board.groups.flatMap((group, groupIndex) => group.shots.flatMap((shot, shotIndex) =>
      shot.panels.map((panel, panelIndex) => ({ group, groupIndex, shot, shotIndex, panel, panelIndex }))));
    if (!panels.length) throw new ProductionError("invalid", "Esta producción todavía no tiene paneles de Storyboard.");
    if (panels.length > 200) throw new ProductionError("invalid", "El Storyboard supera 200 paneles. Exporta una selección más pequeña desde Storyboard.");
    const imageAssetId = (panel: StoryboardBoard["groups"][number]["shots"][number]["panels"][number]) =>
      panel.previewAssetId ?? panel.currentRevision.document?.reference?.assetId ?? panel.currentRevision.baseAssetId;
    const assetIds = [...new Set(panels.flatMap(({ panel }) => {
      const assetId = imageAssetId(panel);
      return assetId ? [assetId] : [];
    }))];
    const assetPaths = new Map<string, string>();
    if (assetIds.length) {
      const assets = await db.from("writer_production_assets").select("id,storage_path")
        .eq("owner_id", ownerId).in("id", assetIds);
      if (assets.error) throw new Error("No pudimos cargar las imágenes del Storyboard.");
      for (const asset of assets.data ?? []) assetPaths.set(String(asset.id), String(asset.storage_path));
    }
    const images = new Map<string, string>();
    const storage = createAdminClient().storage;
    for (const [assetId, path] of assetPaths) {
      const download = await storage.from("writer-production-assets").download(path);
      if (download.error || !download.data) continue;
      const png = await sharp(Buffer.from(await download.data.arrayBuffer())).resize({ width: 1000, withoutEnlargement: true }).png().toBuffer();
      images.set(assetId, `data:image/png;base64,${png.toString("base64")}`);
    }
    result.storyboard = panels.map(({ group, groupIndex, shot, shotIndex, panel, panelIndex }) => ({
      groupTitle: group.title,
      shotNumber: `${groupIndex + 1}.${shotIndex + 1}${panelIndex ? String.fromCharCode(65 + panelIndex) : ""}`,
      shotType: shot.shotType,
      description: shot.description || shot.subject || "Sin descripción",
      movement: shot.movement || "—",
      lens: shot.lens || "—",
      image: imageAssetId(panel) ? images.get(imageAssetId(panel)!) ?? null : null,
    }));
  }
  return result;
}
