import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { ProductionError, loadProductionWorkspace } from "@/lib/production/server";
import { documentSourceUpdatedAt, nextDocumentVersion, productionDocumentFingerprint, productionDocumentKey } from "@/lib/production/document-version";
import { loadProductionDocumentSources } from "@/lib/production/document-sources";
import { ProductionPdfDocument, type ProductionPdfKind, type ProductionPdfOptions, type ProductionPdfSelection } from "@/lib/production/pdf-document";
import type { ProductionWorkspaceData } from "@/lib/production/types";
import { recordCreateEvent, reportCreateFailure } from "@/lib/create/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = new Set<ProductionPdfKind>(["call-sheet", "calendar", "shotlist", "storyboard", "script", "pack"]);
type RouteContext = { params: Promise<{ id: string; kind: string }> };

export async function GET(request: Request, context: RouteContext) {
  return documentRequest(request, context, false);
}

export async function POST(request: Request, context: RouteContext) {
  const origin = request.headers.get("origin");
  if (origin && !matchesRequestHost(request, origin)) return new Response("Origen no permitido.", { status: 403 });
  return documentRequest(request, context, true);
}

function matchesRequestHost(request: Request, rawOrigin: string) {
  try {
    const origin = new URL(rawOrigin);
    const host = request.headers.get("host");
    return Boolean(host) && origin.host === host && !origin.username && !origin.password
      && (origin.protocol === "https:" || process.env.NODE_ENV === "development"
        && origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname));
  } catch { return false; }
}

async function documentRequest(request: Request, context: RouteContext, submitted: boolean) {
  const { id, kind: rawKind } = await context.params;
  if (!UUID.test(id) || !kinds.has(rawKind as ProductionPdfKind)) return new Response("Documento no encontrado.", { status: 404 });
  const kind = rawKind as ProductionPdfKind;
  const viewer = await getViewer();
  if (!viewer) return new Response("Inicia sesión para consultar este documento.", { status: 401 });

  try {
    const db = await createClient();
    const data = await loadProductionWorkspace(db, viewer.id, id);
    const submission = submitted ? await readSubmission(request) : null;
    const preview = !submitted || submission?.preview === true;
    const selection = resolveSelection(kind, data, submission?.selection, new URL(request.url).searchParams.get("day"));
    const key = productionDocumentKey(kind, kind === "call-sheet" ? selection.callSheetDayIds[0] : undefined);
    const latest = data.documentExports.find((item) => item.documentKey === key) ?? null;
    const suggested = nextDocumentVersion(latest);
    const version = submission?.version?.trim() || suggested;
    if (!/^v[1-9]\d{0,2}\.[0-9]{1,3}$/.test(version)) return new Response("Usa una versión como v1.3.", { status: 400 });
    if (!preview && latest && compareVersion(version, `v${latest.versionMajor}.${latest.versionMinor}`) <= 0) {
      return new Response(`La siguiente versión debe ser mayor que v${latest.versionMajor}.${latest.versionMinor}.`, { status: 409 });
    }
    const logoDataUri = submission?.logo ? await validateLogo(submission.logo) : null;
    const watermarkText = submission?.watermarkText?.trim() || null;
    const options: ProductionPdfOptions = {
      version, preparedBy: submission?.preparedBy?.trim() || viewer.fullName || viewer.displayName || "Producción",
      confidential: submission?.confidential ?? true,
      watermarkText: submission?.watermark === false ? null : watermarkText || `${data.production.name.toUpperCase()} · PRODUCTION COPY`,
      showProductionName: submission?.showProductionName ?? true,
      showFilmattaFooter: submission?.showFilmattaFooter ?? true,
      logoDataUri,
    };
    if (options.preparedBy.length > 120 || (options.watermarkText?.length ?? 0) > 120) return new Response("Metadatos demasiado largos.", { status: 400 });
    const sources = await loadProductionDocumentSources(db, viewer.id, data, {
      script: kind === "script" || kind === "pack" && selection.script,
      shotlist: kind === "shotlist" || kind === "pack" && selection.shotlist,
      storyboard: kind === "storyboard" || kind === "pack" && selection.storyboard,
    });
    const generatedAt = new Date();
    const document = createElement(ProductionPdfDocument, { data, kind, selection, sources, options, generatedAt }) as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(document);
    if (!preview) {
      const recorded = await recordExport(db, viewer.id, data, key, version, latest?.revision ?? null, generatedAt);
      if (!recorded) return new Response("El documento cambió mientras se generaba. Revisa el centro y vuelve a exportar.", { status: 409 });
      revalidatePath(`/production/${id}`);
      if (kind === "pack") recordCreateEvent("production_pack_exported", { userId: viewer.id, projectId: data.production.projectId, artifactId: id });
    }
    const filename = filenameFor(data, kind, selection, version);
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Production-Version": version,
    } });
  } catch (cause) {
    reportCreateFailure("production", "document_export", cause);
    if (cause instanceof ProductionError) return new Response(cause.code === "not_found" ? "Producción no encontrada." : cause.message, { status: cause.code === "not_found" ? 404 : cause.code === "invalid" ? 422 : 500 });
    if (cause instanceof DocumentInputError) return new Response(cause.message, { status: cause.status });
    console.error("Production PDF failed", cause instanceof Error ? cause.name : "unknown");
    return new Response("No pudimos generar el documento. Intenta de nuevo.", { status: 500 });
  }
}

type Submission = {
  preview: boolean;
  selection?: Partial<ProductionPdfSelection>;
  version?: string;
  preparedBy?: string;
  confidential?: boolean;
  watermark?: boolean;
  watermarkText?: string;
  showProductionName?: boolean;
  showFilmattaFooter?: boolean;
  logo: File | null;
};

async function readSubmission(request: Request): Promise<Submission> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new DocumentInputError("Solicitud de documento no válida.", 400);
  const form = await request.formData();
  const raw = form.get("options");
  if (typeof raw !== "string" || raw.length > 16_000) throw new DocumentInputError("Opciones de documento no válidas.", 400);
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new DocumentInputError("Opciones de documento no válidas.", 400); }
  const selection = parsed.selection && typeof parsed.selection === "object" ? parsed.selection as Partial<ProductionPdfSelection> : undefined;
  const logo = form.get("logo");
  return {
    preview: parsed.preview === true,
    selection,
    version: typeof parsed.version === "string" ? parsed.version : undefined,
    preparedBy: typeof parsed.preparedBy === "string" ? parsed.preparedBy : undefined,
    confidential: typeof parsed.confidential === "boolean" ? parsed.confidential : undefined,
    watermark: typeof parsed.watermark === "boolean" ? parsed.watermark : undefined,
    watermarkText: typeof parsed.watermarkText === "string" ? parsed.watermarkText : undefined,
    showProductionName: typeof parsed.showProductionName === "boolean" ? parsed.showProductionName : undefined,
    showFilmattaFooter: typeof parsed.showFilmattaFooter === "boolean" ? parsed.showFilmattaFooter : undefined,
    logo: logo instanceof File && logo.size > 0 ? logo : null,
  };
}

function resolveSelection(kind: ProductionPdfKind, data: ProductionWorkspaceData, supplied?: Partial<ProductionPdfSelection>, queryDay?: string | null): ProductionPdfSelection {
  const allIds = new Set(data.days.map((day) => day.id));
  const dayIds = kind === "call-sheet" ? supplied?.callSheetDayIds ?? (queryDay ? [queryDay] : []) : kind === "pack" ? supplied?.callSheetDayIds ?? data.days.map((day) => day.id) : [];
  if (!Array.isArray(dayIds) || dayIds.some((id) => typeof id !== "string" || !allIds.has(id)) || new Set(dayIds).size !== dayIds.length) throw new DocumentInputError("Selecciona jornadas válidas.", 400);
  if (kind === "call-sheet" && dayIds.length !== 1) throw new DocumentInputError("Selecciona una jornada para el Call Sheet.", 400);
  const selection: ProductionPdfSelection = {
    callSheetDayIds: dayIds,
    calendar: kind === "calendar" || kind === "pack" && supplied?.calendar === true,
    shotlist: kind === "shotlist" || kind === "pack" && supplied?.shotlist === true,
    storyboard: kind === "storyboard" || kind === "pack" && supplied?.storyboard === true,
    script: kind === "script" || kind === "pack" && supplied?.script === true,
  };
  if (kind === "pack" && !dayIds.length && !selection.calendar && !selection.shotlist && !selection.storyboard && !selection.script) throw new DocumentInputError("Elige al menos un documento para el pack.", 400);
  if ((selection.calendar || selection.callSheetDayIds.length) && !data.days.length) throw new DocumentInputError("Crea una jornada antes de exportar.", 422);
  if (selection.shotlist && !data.source.shotlist?.available || selection.script && !data.source.script?.available || selection.storyboard && !data.storyboardFingerprint) throw new DocumentInputError("Una de las fuentes seleccionadas no está disponible.", 422);
  return selection;
}

async function validateLogo(file: File): Promise<string> {
  if (file.size > 2_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new DocumentInputError("El logo debe ser PNG, JPG o WebP de hasta 2 MB.", 400);
  try {
    const png = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "warning", limitInputPixels: 8_000_000 })
      .rotate().resize({ width: 400, height: 160, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch { throw new DocumentInputError("El logo no se pudo leer.", 400); }
}

async function recordExport(db: Awaited<ReturnType<typeof createClient>>, ownerId: string, data: ProductionWorkspaceData, key: string, version: string, expectedRevision: number | null, generatedAt: Date): Promise<boolean> {
  const match = /^v(\d+)\.(\d+)$/.exec(version)!;
  const values = {
    version_major: Number(match[1]), version_minor: Number(match[2]), generated_at: generatedAt.toISOString(), generated_by: ownerId,
    source_updated_at: documentSourceUpdatedAt(data, key), source_fingerprint: productionDocumentFingerprint(data, key),
  };
  if (expectedRevision) {
    const updated = await db.from("production_document_exports").update({ ...values, revision: expectedRevision + 1 })
      .eq("owner_id", ownerId).eq("production_id", data.production.id).eq("document_key", key).eq("revision", expectedRevision)
      .select("id").maybeSingle();
    if (updated.error) throw new ProductionError("storage", "No pudimos guardar la versión del documento.");
    return Boolean(updated.data);
  }
  const inserted = await db.from("production_document_exports").insert({ owner_id: ownerId, production_id: data.production.id, document_key: key, ...values });
  if (inserted.error?.code === "23505") return false;
  if (inserted.error) throw new ProductionError("storage", "No pudimos registrar el documento exportado.");
  return true;
}

function filenameFor(data: ProductionWorkspaceData, kind: ProductionPdfKind, selection: ProductionPdfSelection, version: string) {
  const name = data.production.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "PRODUCCION";
  const label = { "call-sheet": "CALL-SHEET", calendar: "CALENDAR", shotlist: "SHOTLIST", storyboard: "STORYBOARD", script: "SCRIPT", pack: "PRODUCTION-PACK" }[kind];
  const day = selection.callSheetDayIds.length === 1 ? data.days.find((item) => item.id === selection.callSheetDayIds[0]) : null;
  const dayPart = day ? `_DAY-${String(day.position + 1).padStart(2, "0")}` : "";
  return `${name}_${label}${dayPart}_${version}.pdf`;
}

function compareVersion(left: string, right: string) {
  const [a, b] = [left, right].map((value) => /^v(\d+)\.(\d+)$/.exec(value)!.slice(1).map(Number));
  return a[0] - b[0] || a[1] - b[1];
}

class DocumentInputError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
