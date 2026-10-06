import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import { assertOwnedWriterScript, loadWriterShotlist } from "@/lib/writer/production-server";
import { deriveWriterSceneSources } from "@/lib/writer/script-assistant";
import { parseShotlistUpload, publicWorkbookPreview } from "@/lib/shotlist/import-server";
import type { ShotlistColumnKey } from "@/lib/shotlist/ux";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMPORTABLE = new Set<ShotlistColumnKey | "skip">([
  "skip", "number", "scene", "location", "interiorExterior", "shotType", "subject", "description", "lens",
  "composition", "angle", "movement", "support", "setup", "durationSeconds", "status", "notes",
]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  try { await loadWriterShotlist(session.supabase, session.user.id, id); } catch { return writerJson({ error: "Shotlist no encontrada.", code: "not_found" }, 404); }
  const scriptId = new URL(request.url).searchParams.get("scriptId");
  if (scriptId) {
    if (!validUuid(scriptId)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
    try {
      const script = await assertOwnedWriterScript(session.supabase, session.user.id, scriptId);
      return writerJson({ script: { id: script.id, title: script.title, revision: script.revision }, scenes: deriveWriterSceneSources(script.document).map((scene) => ({ sceneId: scene.sceneId, heading: scene.heading, context: scene.blocks.filter((block) => block.kind === "action" || block.kind === "dialogue").slice(0, 4).map((block) => block.text).join(" ").slice(0, 500) })) });
    } catch { return writerJson({ error: "Guion no encontrado.", code: "not_found" }, 404); }
  }
  const scripts = await session.supabase.from("writer_scripts").select("id,title,revision,updated_at").eq("owner_id", session.user.id).order("updated_at", { ascending: false }).limit(100);
  if (scripts.error) return writerJson({ error: "No pudimos cargar tus guiones.", code: "server_error" }, 500);
  return writerJson({ scripts: (scripts.data ?? []).map((row) => ({ id: String(row.id), title: String(row.title), revision: Number(row.revision), updatedAt: String(row.updated_at) })) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await params;
  if (!validUuid(id)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  let current: Awaited<ReturnType<typeof loadWriterShotlist>>;
  try { current = await loadWriterShotlist(session.supabase, session.user.id, id); } catch { return writerJson({ error: "Shotlist no encontrada.", code: "not_found" }, 404); }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return importWriter(request, session.user.id, id, current.shotlist.scriptId, session.supabase);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 8.5 * 1024 * 1024) return writerJson({ error: "El archivo supera 8 MB.", code: "too_large" }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return writerJson({ error: "No pudimos leer el archivo.", code: "invalid" }, 400); }
  const file = form.get("file");
  if (!(file instanceof File)) return writerJson({ error: "Selecciona un archivo.", code: "invalid" }, 400);
  try {
    const workbook = await parseShotlistUpload(file);
    if (form.get("mode") !== "apply") return writerJson(publicWorkbookPreview(workbook));
    const sheetName = String(form.get("sheet") ?? workbook.sheets[0]?.name ?? "");
    const sheet = workbook.sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet) return writerJson({ error: "Selecciona una hoja válida.", code: "invalid" }, 400);
    const mapping = parseMapping(form.get("mapping"), sheet.table.headers.length);
    const operationId = String(form.get("operationId") ?? "");
    if (!mapping || !validUuid(operationId)) return writerJson({ error: "Revisa el mapeo de columnas.", code: "invalid" }, 400);
    const result = await persistRows({ db: session.supabase, userId: session.user.id, shotlistId: id, operationId, headers: sheet.table.headers, rows: sheet.table.rows, mapping });
    return writerJson({ saved: true, ...result });
  } catch (cause) {
    return writerJson({ error: cause instanceof Error ? cause.message : "No pudimos importar el archivo.", code: "invalid" }, 400);
  }
}

async function importWriter(request: Request, userId: string, shotlistId: string, currentScriptId: string | null, db: Parameters<typeof assertOwnedWriterScript>[0]) {
  let body: unknown;
  try { body = await request.json(); } catch { return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400); }
  if (!record(body) || body.mode !== "writer" || !validUuid(body.scriptId) || !validUuid(body.operationId) || !Array.isArray(body.sceneIds) || !body.sceneIds.length || !body.sceneIds.every(validUuid)) return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  if (currentScriptId && currentScriptId !== body.scriptId) return writerJson({ error: "Esta Shotlist ya está vinculada a otro guion. No se sustituirá el vínculo.", code: "conflict" }, 409);
  const script = await assertOwnedWriterScript(db, userId, body.scriptId);
  const requested = new Set(body.sceneIds as string[]);
  const scenes = deriveWriterSceneSources(script.document).filter((scene) => requested.has(scene.sceneId));
  if (scenes.length !== requested.size) return writerJson({ error: "Una escena ya no está disponible.", code: "conflict" }, 409);
  const admin = createAdminClient();
  const existing = await admin.from("writer_shotlist_groups").select("source_scene_id").eq("owner_id", userId).eq("shotlist_id", shotlistId).in("source_scene_id", [...requested]);
  if (existing.error) return writerJson({ error: "No pudimos comprobar las escenas.", code: "server_error" }, 500);
  const existingIds = new Set((existing.data ?? []).flatMap((row) => row.source_scene_id ? [String(row.source_scene_id)] : []));
  let added = 0;
  for (const scene of scenes) {
    if (existingIds.has(scene.sceneId)) continue;
    const operation = deterministicUuid(String(body.operationId), `writer:${scene.sceneId}`);
    const created = await db.rpc("writer_add_shotlist_group", { p_shotlist_id: shotlistId, p_title: scene.heading.slice(0, 180), p_operation_id: operation });
    if (created.error || !created.data) return writerJson({ error: "No pudimos incorporar todas las escenas.", code: "partial" }, 409);
    const updated = await admin.from("writer_shotlist_groups").update({ source_scene_id: scene.sceneId, source_scene_title: scene.heading.slice(0, 180), source_status: "linked", updated_at: new Date().toISOString() }).eq("id", created.data).eq("owner_id", userId).eq("shotlist_id", shotlistId);
    if (updated.error) return writerJson({ error: "No pudimos vincular todas las escenas.", code: "partial" }, 409);
    added += 1;
  }
  const linked = await admin.from("writer_shotlists").update({ script_id: body.scriptId, source_revision: script.revision, updated_at: new Date().toISOString() }).eq("id", shotlistId).eq("owner_id", userId);
  if (linked.error) return writerJson({ error: "No pudimos guardar el vínculo con Writer.", code: "partial" }, 409);
  return writerJson({ saved: true, added, skipped: scenes.length - added, aiCalls: 0 });
}

async function persistRows(input: { db: Parameters<typeof assertOwnedWriterScript>[0]; userId: string; shotlistId: string; operationId: string; headers: string[]; rows: string[][]; mapping: Array<ShotlistColumnKey | "skip"> }) {
  const groups = new Map<string, Array<{ row: string[]; sourceIndex: number }>>();
  input.rows.forEach((row, sourceIndex) => {
    const scene = mapped(row, input.mapping, "scene");
    const location = mapped(row, input.mapping, "location");
    const interiorExterior = mapped(row, input.mapping, "interiorExterior");
    const title = clean(scene || [interiorExterior, location].filter(Boolean).join(" ") || "Importado", 180) || "Importado";
    groups.set(title, [...(groups.get(title) ?? []), { row, sourceIndex }]);
  });
  const admin = createAdminClient();
  let imported = 0;
  for (const [groupTitle, sourceRows] of groups) {
    const groupOperation = deterministicUuid(input.operationId, `group:${groupTitle}`);
    const existingGroup = await admin.from("writer_shotlist_groups").select("id").eq("owner_id", input.userId).eq("shotlist_id", input.shotlistId).eq("creation_operation_id", groupOperation).maybeSingle();
    let groupId = existingGroup.data?.id ? String(existingGroup.data.id) : null;
    if (!groupId) {
      const created = await input.db.rpc("writer_add_shotlist_group", { p_shotlist_id: input.shotlistId, p_title: groupTitle, p_operation_id: groupOperation });
      if (created.error || !created.data) throw new Error("No pudimos crear un grupo de importación.");
      groupId = String(created.data);
    }
    const operationIds = sourceRows.map(({ sourceIndex }) => deterministicUuid(input.operationId, `row:${sourceIndex}`));
    const existing = new Set<string>();
    for (let offset = 0; offset < operationIds.length; offset += 400) {
      const result = await admin.from("writer_shotlist_shots").select("creation_operation_id").eq("owner_id", input.userId).eq("shotlist_id", input.shotlistId).in("creation_operation_id", operationIds.slice(offset, offset + 400));
      if (result.error) throw new Error("No pudimos comprobar el estado de la importación.");
      for (const row of result.data ?? []) existing.add(String(row.creation_operation_id));
    }
    const inserts = sourceRows.flatMap(({ row, sourceIndex }, index) => {
      const creationOperationId = operationIds[index]!;
      if (existing.has(creationOperationId)) return [];
      return [{
        owner_id: input.userId,
        shotlist_id: input.shotlistId,
        group_id: groupId,
        origin: "manual",
        shot_type: clean(mapped(row, input.mapping, "shotType"), 80) || "General",
        subject: clean(mapped(row, input.mapping, "subject"), 500) || "",
        description: clean(mapped(row, input.mapping, "description"), 4_000),
        lens: clean(mapped(row, input.mapping, "lens"), 40),
        composition: clean(mapped(row, input.mapping, "composition"), 80),
        angle: clean(mapped(row, input.mapping, "angle"), 80) || "A nivel",
        movement: clean(mapped(row, input.mapping, "movement"), 80) || "Fijo",
        support: clean(mapped(row, input.mapping, "support"), 80),
        setup: clean(mapped(row, input.mapping, "setup"), 40),
        duration_seconds: duration(mapped(row, input.mapping, "durationSeconds")),
        status: normalizeStatus(mapped(row, input.mapping, "status")),
        notes: clean(mapped(row, input.mapping, "notes"), 4_000),
        position: sourceIndex,
        creation_operation_id: creationOperationId,
      }];
    });
    for (let offset = 0; offset < inserts.length; offset += 400) {
      const inserted = await admin.from("writer_shotlist_shots").insert(inserts.slice(offset, offset + 400));
      if (inserted.error) throw new Error("La importación quedó parcial. Puedes reintentarlo sin duplicar las filas ya guardadas.");
      imported += Math.min(400, inserts.length - offset);
    }
  }
  const touched = await admin.from("writer_shotlists").update({ updated_at: new Date().toISOString() }).eq("id", input.shotlistId).eq("owner_id", input.userId);
  if (touched.error) throw new Error("La importación quedó parcial. Puedes reintentarlo sin duplicar las filas ya guardadas.");
  return { imported, skipped: input.rows.length - imported, groups: groups.size, aiCalls: 0 };
}

function parseMapping(value: FormDataEntryValue | null, columns: number) {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== columns || !parsed.every((item) => typeof item === "string" && IMPORTABLE.has(item as ShotlistColumnKey | "skip"))) return null;
    const assigned = parsed.filter((item) => item !== "skip");
    if (new Set(assigned).size !== assigned.length) return null;
    return parsed as Array<ShotlistColumnKey | "skip">;
  } catch { return null; }
}

function mapped(row: string[], mapping: Array<ShotlistColumnKey | "skip">, target: ShotlistColumnKey) {
  const index = mapping.indexOf(target);
  return index < 0 ? "" : String(row[index] ?? "").trim();
}

function deterministicUuid(root: string, label: string) {
  const hex = createHash("sha256").update(`${root}:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function clean(value: string, max: number) { const text = value.trim(); return text ? text.slice(0, max) : null; }
function duration(value: string) { const parsed = Number(value.replace(",", ".").replace(/\s*s$/iu, "")); return Number.isFinite(parsed) && parsed >= 0 && parsed <= 86_400 ? parsed : null; }
function normalizeStatus(value: string) { return /^(?:listo|ready|ok|hecho)$/iu.test(value.trim()) ? "ready" : "pending"; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
