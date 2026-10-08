import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateWriterDocument } from "@/lib/writer/document";
import { deriveWriterSceneSources } from "@/lib/writer/script-assistant";
import type {
  EligibleRequirement,
  ProductionCoverage,
  ProductionDay,
  ProductionDocumentExport,
  ProductionListItem,
  ProductionPlan,
  ProductionRequirement,
  ProductionResource,
  ProductionScheduleItem,
  ProductionSourceState,
  ProductionTask,
  ProductionWorkspaceData,
  RequirementCategory,
  SourceGroup,
  SourceScriptOption,
  SourceShotlistOption,
} from "./types";

export class ProductionError extends Error {
  constructor(
    readonly code: "invalid" | "unauthorized" | "not_found" | "conflict" | "duplicate" | "storage",
    message: string,
  ) {
    super(message);
  }
}

export async function listProductions(db: SupabaseClient, ownerId: string): Promise<ProductionListItem[]> {
  const [plans, days, schedule, tasks] = await Promise.all([
    db.from("production_plans").select("id,owner_id,project_id,name,timezone,script_id,shotlist_id,source_script_revision,source_shotlist_revision,revision,created_at,updated_at")
      .eq("owner_id", ownerId).order("updated_at", { ascending: false }),
    db.from("production_days").select("id,production_id").eq("owner_id", ownerId),
    db.from("production_schedule_items").select("id,production_id,day_id").eq("owner_id", ownerId).not("day_id", "is", null),
    db.from("production_tasks").select("id,production_id,status").eq("owner_id", ownerId).neq("status", "done"),
  ]);
  if (plans.error) {
    if (plans.error.code === "42P01") return [];
    throw new ProductionError("storage", "No pudimos cargar tus producciones.");
  }
  if (days.error || schedule.error || tasks.error) throw new ProductionError("storage", "No pudimos cargar el resumen de producción.");
  const count = (rows: Array<Record<string, unknown>>, id: string) => rows.filter((row) => row.production_id === id).length;
  return (plans.data ?? []).map((row) => ({
    ...mapPlan(row),
    dayCount: count((days.data ?? []) as Array<Record<string, unknown>>, String(row.id)),
    scheduledCount: count((schedule.data ?? []) as Array<Record<string, unknown>>, String(row.id)),
    pendingTaskCount: count((tasks.data ?? []) as Array<Record<string, unknown>>, String(row.id)),
  }));
}

export async function listProductionSourceOptions(db: SupabaseClient, ownerId: string) {
  const [scriptsResult, shotlistsResult, groupsResult, shotsResult, elementsResult, appearancesResult] = await Promise.all([
    db.from("writer_scripts").select("id,project_id,title,document,revision").eq("owner_id", ownerId).order("updated_at", { ascending: false }),
    db.from("writer_shotlists").select("id,project_id,script_id,title,revision").eq("owner_id", ownerId).order("updated_at", { ascending: false }),
    db.from("writer_shotlist_groups").select("id,shotlist_id").eq("owner_id", ownerId),
    db.from("writer_shotlist_shots").select("id,shotlist_id").eq("owner_id", ownerId),
    db.from("writer_breakdown_elements").select("id,script_id,status").eq("owner_id", ownerId).eq("status", "confirmed"),
    db.from("writer_breakdown_appearances").select("element_id,stale,nature").eq("owner_id", ownerId).eq("stale", false).in("nature", ["present", "used"]),
  ]);
  if ([scriptsResult, shotlistsResult, groupsResult, shotsResult, elementsResult, appearancesResult].some((result) => result.error)) {
    throw new ProductionError("storage", "No pudimos cargar tus fuentes de producción.");
  }
  const eligibleIds = new Set((appearancesResult.data ?? []).map((row) => String(row.element_id)));
  const scripts: SourceScriptOption[] = (scriptsResult.data ?? []).map((row) => {
    const document = validateWriterDocument(row.document);
    return {
      id: String(row.id), projectId: row.project_id ? String(row.project_id) : null, title: String(row.title), revision: Number(row.revision),
      sceneCount: document.ok ? deriveWriterSceneSources(document.document).length : 0,
      eligibleRequirementCount: (elementsResult.data ?? []).filter((element) => element.script_id === row.id && eligibleIds.has(String(element.id))).length,
    };
  });
  const shotlists: SourceShotlistOption[] = (shotlistsResult.data ?? []).map((row) => ({
    id: String(row.id), projectId: row.project_id ? String(row.project_id) : null, scriptId: row.script_id ? String(row.script_id) : null, title: String(row.title), revision: Number(row.revision),
    groupCount: (groupsResult.data ?? []).filter((group) => group.shotlist_id === row.id).length,
    shotCount: (shotsResult.data ?? []).filter((shot) => shot.shotlist_id === row.id).length,
  }));
  return { scripts, shotlists };
}

export async function assertOwnedProduction(db: SupabaseClient, ownerId: string, productionId: string) {
  const result = await db.from("production_plans")
    .select("id,owner_id,project_id,name,timezone,script_id,shotlist_id,source_script_revision,source_shotlist_revision,revision,created_at,updated_at")
    .eq("id", productionId).eq("owner_id", ownerId).maybeSingle();
  if (result.error || !result.data) throw new ProductionError("not_found", "Producción no encontrada.");
  return mapPlan(result.data);
}

export async function validateOwnedSources(db: SupabaseClient, ownerId: string, scriptId: string | null, shotlistId: string | null) {
  const scriptResult = scriptId
    ? await db.from("writer_scripts").select("id,project_id,title,revision").eq("id", scriptId).eq("owner_id", ownerId).maybeSingle()
    : { data: null, error: null };
  if (scriptId && (scriptResult.error || !scriptResult.data)) throw new ProductionError("not_found", "Guion no encontrado.");
  const shotlistResult = shotlistId
    ? await db.from("writer_shotlists").select("id,project_id,script_id,title,revision").eq("id", shotlistId).eq("owner_id", ownerId).maybeSingle()
    : { data: null, error: null };
  if (shotlistId && (shotlistResult.error || !shotlistResult.data)) throw new ProductionError("not_found", "Shotlist no encontrada.");
  const shotlistScriptId = shotlistResult.data?.script_id ? String(shotlistResult.data.script_id) : null;
  if (scriptId && shotlistScriptId && scriptId !== shotlistScriptId) {
    throw new ProductionError("invalid", "El guion y la Shotlist seleccionados no son compatibles.");
  }
  const effectiveScriptId = scriptId ?? shotlistScriptId;
  let effectiveScript = scriptResult.data;
  if (!effectiveScript && effectiveScriptId) {
    const adopted = await db.from("writer_scripts").select("id,project_id,title,revision").eq("id", effectiveScriptId).eq("owner_id", ownerId).maybeSingle();
    if (adopted.error || !adopted.data) throw new ProductionError("not_found", "El guion vinculado a la Shotlist no está disponible.");
    effectiveScript = adopted.data;
  }
  return {
    script: effectiveScript ? { id: String(effectiveScript.id), projectId: effectiveScript.project_id ? String(effectiveScript.project_id) : null, title: String(effectiveScript.title), revision: Number(effectiveScript.revision) } : null,
    shotlist: shotlistResult.data ? {
      id: String(shotlistResult.data.id), projectId: shotlistResult.data.project_id ? String(shotlistResult.data.project_id) : null, scriptId: shotlistScriptId, title: String(shotlistResult.data.title), revision: Number(shotlistResult.data.revision),
    } : null,
  };
}

export async function loadEligibleRequirements(
  db: SupabaseClient,
  ownerId: string,
  scriptId: string,
  productionId?: string,
): Promise<EligibleRequirement[]> {
  const [script, elements, appearances, imported] = await Promise.all([
    db.from("writer_scripts").select("id,revision").eq("id", scriptId).eq("owner_id", ownerId).maybeSingle(),
    db.from("writer_breakdown_elements").select("id,script_id,category,name,canonical_identity_key,revision")
      .eq("owner_id", ownerId).eq("script_id", scriptId).eq("status", "confirmed"),
    db.from("writer_breakdown_appearances").select("element_id,scene_id,nature,stale,source_revision")
      .eq("owner_id", ownerId).eq("script_id", scriptId).eq("stale", false).in("nature", ["present", "used"]),
    productionId
      ? db.from("production_requirements").select("source_element_id,source_identity_key").eq("owner_id", ownerId).eq("production_id", productionId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (script.error || !script.data) return [];
  if (elements.error || appearances.error || imported.error) throw new ProductionError("storage", "No pudimos revisar las necesidades confirmadas.");
  const appearancesByElement = new Map<string, NonNullable<typeof appearances.data>>();
  for (const appearance of appearances.data ?? []) {
    const id = String(appearance.element_id);
    appearancesByElement.set(id, [...(appearancesByElement.get(id) ?? []), appearance]);
  }
  const importedElements = new Set((imported.data ?? []).flatMap((row) => row.source_element_id ? [String(row.source_element_id)] : []));
  const importedIdentities = new Set((imported.data ?? []).flatMap((row) => row.source_identity_key ? [String(row.source_identity_key)] : []));
  return (elements.data ?? []).flatMap((row) => {
    const evidence = appearancesByElement.get(String(row.id)) ?? [];
    if (!evidence.length) return [];
    const category = mapBreakdownCategory(String(row.category));
    const identityKey = row.canonical_identity_key
      ? `${category}:${String(row.canonical_identity_key)}`
      : `${category}:${normalizeIdentity(String(row.name))}`;
    return [{
      sourceElementId: String(row.id), sourceScriptId: scriptId, category, name: String(row.name), identityKey,
      sourceRevision: Math.max(Number(row.revision), ...evidence.map((item) => Number(item.source_revision))),
      sceneIds: [...new Set(evidence.flatMap((item) => item.scene_id ? [String(item.scene_id)] : []))],
      alreadyImported: importedElements.has(String(row.id)) || importedIdentities.has(identityKey),
    }];
  });
}

export async function loadProductionWorkspace(db: SupabaseClient, ownerId: string, productionId: string): Promise<ProductionWorkspaceData> {
  const production = await assertOwnedProduction(db, ownerId, productionId);
  const [days, schedule, requirements, links, resources, coverages, tasks, documentExports, sourceOptions] = await Promise.all([
    db.from("production_days").select("id,production_id,position,name,shoot_date,call_time,wrap_time,wrap_next_day,notes,revision")
      .eq("owner_id", ownerId).eq("production_id", productionId).order("position"),
    db.from("production_schedule_items").select("id,production_id,day_id,position,item_type,logistics_type,title,notes,source_scene_id,source_group_id,source_shot_id,source_label,source_revision,shoot_minutes,start_time,end_time,end_next_day,revision")
      .eq("owner_id", ownerId).eq("production_id", productionId).order("position"),
    db.from("production_requirements").select("id,production_id,category,name,origin,source_element_id,source_script_id,source_identity_key,source_label,source_revision,notes,revision")
      .eq("owner_id", ownerId).eq("production_id", productionId).order("category").order("name"),
    db.from("production_requirement_scenes").select("requirement_id,source_scene_id").eq("owner_id", ownerId).eq("production_id", productionId),
    db.from("production_resources").select("id,production_id,name,resource_type,contact,address,notes,availability_notes,role,phone,include_in_call_sheet,revision")
      .eq("owner_id", ownerId).eq("production_id", productionId).order("resource_type").order("name"),
    db.from("production_coverages").select("id,production_id,requirement_id,day_id,resource_id,status,required_time,arrival_time,notes,confirmed_for_date,needs_reconfirmation,revision")
      .eq("owner_id", ownerId).eq("production_id", productionId),
    db.from("production_tasks").select("id,production_id,title,status,priority,assignee_text,assignee_resource_id,due_date,department,notes,day_id,schedule_item_id,requirement_id,resource_id,revision")
      .eq("owner_id", ownerId).eq("production_id", productionId).order("created_at", { ascending: false }),
    db.from("production_document_exports").select("document_key,version_major,version_minor,generated_at,generated_by,source_updated_at,source_fingerprint,revision")
      .eq("owner_id", ownerId).eq("production_id", productionId),
    listProductionSourceOptions(db, ownerId),
  ]);
  if ([days, schedule, requirements, links, resources, coverages, tasks, documentExports].some((result) => result.error)) {
    throw new ProductionError("storage", "No pudimos cargar el espacio de producción.");
  }
  const source = await loadProductionSourceState(db, ownerId, production);
  const storyboardPanels = production.shotlistId
    ? await db.from("storyboard_panels").select("id,current_revision_id,updated_at")
      .eq("owner_id", ownerId).eq("shotlist_id", production.shotlistId).order("id")
    : null;
  if (storyboardPanels?.error) throw new ProductionError("storage", "No pudimos cargar el estado del Storyboard.");
  const linksByRequirement = new Map<string, string[]>();
  for (const row of links.data ?? []) {
    const id = String(row.requirement_id);
    linksByRequirement.set(id, [...(linksByRequirement.get(id) ?? []), String(row.source_scene_id)]);
  }
  return {
    production,
    days: (days.data ?? []).map(mapDay),
    scheduleItems: (schedule.data ?? []).map(mapScheduleItem),
    requirements: (requirements.data ?? []).map((row) => mapRequirement(row, linksByRequirement.get(String(row.id)) ?? [])),
    resources: (resources.data ?? []).map(mapResource),
    coverages: (coverages.data ?? []).map(mapCoverage),
    tasks: (tasks.data ?? []).map(mapTask),
    documentExports: (documentExports.data ?? []).map(mapDocumentExport),
    storyboardFingerprint: storyboardPanels?.data?.map((row) => `${row.id}:${row.current_revision_id}`).join("|") ?? null,
    storyboardUpdatedAt: storyboardPanels?.data?.reduce<string | null>((latest, row) => !latest || String(row.updated_at) > latest ? String(row.updated_at) : latest, null) ?? null,
    source,
    sourceOptions,
  };
}

async function loadProductionSourceState(db: SupabaseClient, ownerId: string, production: ProductionPlan): Promise<ProductionSourceState> {
  let script: ProductionSourceState["script"] = null;
  let scenes: ProductionSourceState["scenes"] = [];
  if (production.scriptId) {
    const result = await db.from("writer_scripts").select("id,title,document,revision,updated_at").eq("id", production.scriptId).eq("owner_id", ownerId).maybeSingle();
    if (result.error || !result.data) script = { id: production.scriptId, available: false };
    else {
      const scriptRevision = Number(result.data.revision);
      script = { id: production.scriptId, title: String(result.data.title), revision: scriptRevision, updatedAt: String(result.data.updated_at), available: true };
      const document = validateWriterDocument(result.data.document);
      if (document.ok) scenes = deriveWriterSceneSources(document.document).map((scene, position) => ({ id: scene.sceneId, title: scene.heading, position, revision: scriptRevision }));
    }
  }
  let shotlist: ProductionSourceState["shotlist"] = null;
  let groups: SourceGroup[] = [];
  if (production.shotlistId) {
    const result = await db.from("writer_shotlists").select("id,title,script_id,revision,updated_at").eq("id", production.shotlistId).eq("owner_id", ownerId).maybeSingle();
    if (result.error || !result.data) shotlist = { id: production.shotlistId, available: false };
    else {
      shotlist = { id: production.shotlistId, title: String(result.data.title), revision: Number(result.data.revision), updatedAt: String(result.data.updated_at), scriptId: result.data.script_id ? String(result.data.script_id) : null, available: true };
      const [groupsResult, shotsResult] = await Promise.all([
        db.from("writer_shotlist_groups").select("id,source_scene_id,title,position,source_status,revision").eq("owner_id", ownerId).eq("shotlist_id", production.shotlistId).order("position"),
        db.from("writer_shotlist_shots").select("id,group_id,shot_type,subject,duration_seconds,position,revision").eq("owner_id", ownerId).eq("shotlist_id", production.shotlistId).order("position"),
      ]);
      if (groupsResult.error || shotsResult.error) throw new ProductionError("storage", "No pudimos cargar la Shotlist vinculada.");
      groups = (groupsResult.data ?? []).map((group) => ({
        id: String(group.id), sceneId: group.source_scene_id ? String(group.source_scene_id) : null, title: String(group.title),
        position: Number(group.position), revision: Number(group.revision), sourceStatus: group.source_status as SourceGroup["sourceStatus"],
        shots: (shotsResult.data ?? []).filter((shot) => shot.group_id === group.id).map((shot) => ({
          id: String(shot.id), groupId: String(group.id), sceneId: group.source_scene_id ? String(group.source_scene_id) : null,
          title: `${String(shot.shot_type)}${shot.subject ? ` · ${String(shot.subject)}` : ""}`,
          shotType: String(shot.shot_type), subject: String(shot.subject ?? ""),
          durationSeconds: shot.duration_seconds == null ? null : Number(shot.duration_seconds),
          position: Number(shot.position), revision: Number(shot.revision),
        })),
      }));
    }
  }
  const eligibleRequirements = production.scriptId ? await loadEligibleRequirements(db, ownerId, production.scriptId, production.id) : [];
  return { script, shotlist, scenes, groups, eligibleRequirements };
}

function mapPlan(row: Record<string, unknown>): ProductionPlan {
  return {
    id: String(row.id), ownerId: String(row.owner_id), projectId: row.project_id ? String(row.project_id) : null, name: String(row.name), timezone: String(row.timezone),
    scriptId: row.script_id ? String(row.script_id) : null, shotlistId: row.shotlist_id ? String(row.shotlist_id) : null,
    sourceScriptRevision: row.source_script_revision == null ? null : Number(row.source_script_revision),
    sourceShotlistRevision: row.source_shotlist_revision == null ? null : Number(row.source_shotlist_revision),
    revision: Number(row.revision), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapDay(row: Record<string, unknown>): ProductionDay {
  return { id: String(row.id), productionId: String(row.production_id), position: Number(row.position), name: String(row.name),
    shootDate: row.shoot_date ? String(row.shoot_date) : null, callTime: clock(row.call_time), wrapTime: clock(row.wrap_time),
    wrapNextDay: Boolean(row.wrap_next_day), notes: row.notes ? String(row.notes) : null, revision: Number(row.revision) };
}

function mapScheduleItem(row: Record<string, unknown>): ProductionScheduleItem {
  return { id: String(row.id), productionId: String(row.production_id), dayId: row.day_id ? String(row.day_id) : null,
    position: Number(row.position), itemType: row.item_type as ProductionScheduleItem["itemType"], logisticsType: row.logistics_type as ProductionScheduleItem["logisticsType"],
    title: String(row.title), notes: row.notes ? String(row.notes) : null, sourceSceneId: row.source_scene_id ? String(row.source_scene_id) : null,
    sourceGroupId: row.source_group_id ? String(row.source_group_id) : null, sourceShotId: row.source_shot_id ? String(row.source_shot_id) : null,
    sourceLabel: row.source_label ? String(row.source_label) : null, sourceRevision: row.source_revision == null ? null : Number(row.source_revision),
    shootMinutes: row.shoot_minutes == null ? null : Number(row.shoot_minutes), startTime: clock(row.start_time), endTime: clock(row.end_time),
    endNextDay: Boolean(row.end_next_day), revision: Number(row.revision) };
}

function mapRequirement(row: Record<string, unknown>, sourceSceneIds: string[]): ProductionRequirement {
  return { id: String(row.id), productionId: String(row.production_id), category: row.category as ProductionRequirement["category"], name: String(row.name),
    origin: row.origin as ProductionRequirement["origin"], sourceElementId: row.source_element_id ? String(row.source_element_id) : null,
    sourceScriptId: row.source_script_id ? String(row.source_script_id) : null, sourceIdentityKey: row.source_identity_key ? String(row.source_identity_key) : null,
    sourceLabel: row.source_label ? String(row.source_label) : null, sourceRevision: row.source_revision == null ? null : Number(row.source_revision),
    notes: row.notes ? String(row.notes) : null, revision: Number(row.revision), sourceSceneIds };
}

function mapResource(row: Record<string, unknown>): ProductionResource {
  return { id: String(row.id), productionId: String(row.production_id), name: String(row.name), resourceType: row.resource_type as ProductionResource["resourceType"],
    contact: row.contact ? String(row.contact) : null, address: row.address ? String(row.address) : null, notes: row.notes ? String(row.notes) : null,
    availabilityNotes: row.availability_notes ? String(row.availability_notes) : null,
    role: row.role ? String(row.role) : null, phone: row.phone ? String(row.phone) : null,
    includeInCallSheet: Boolean(row.include_in_call_sheet), revision: Number(row.revision) };
}

function mapDocumentExport(row: Record<string, unknown>): ProductionDocumentExport {
  return {
    documentKey: String(row.document_key), versionMajor: Number(row.version_major), versionMinor: Number(row.version_minor),
    generatedAt: String(row.generated_at), generatedBy: String(row.generated_by), sourceUpdatedAt: String(row.source_updated_at),
    sourceFingerprint: String(row.source_fingerprint), revision: Number(row.revision),
  };
}

function mapCoverage(row: Record<string, unknown>): ProductionCoverage {
  return { id: String(row.id), productionId: String(row.production_id), requirementId: String(row.requirement_id), dayId: String(row.day_id),
    resourceId: row.resource_id ? String(row.resource_id) : null, status: row.status as ProductionCoverage["status"],
    requiredTime: clock(row.required_time), arrivalTime: clock(row.arrival_time), notes: row.notes ? String(row.notes) : null,
    confirmedForDate: row.confirmed_for_date ? String(row.confirmed_for_date) : null, needsReconfirmation: Boolean(row.needs_reconfirmation), revision: Number(row.revision) };
}

function mapTask(row: Record<string, unknown>): ProductionTask {
  return { id: String(row.id), productionId: String(row.production_id), title: String(row.title), status: row.status as ProductionTask["status"],
    priority: row.priority as ProductionTask["priority"], assigneeText: row.assignee_text ? String(row.assignee_text) : null,
    assigneeResourceId: row.assignee_resource_id ? String(row.assignee_resource_id) : null, dueDate: row.due_date ? String(row.due_date) : null,
    department: row.department ? String(row.department) : null, notes: row.notes ? String(row.notes) : null,
    dayId: row.day_id ? String(row.day_id) : null, scheduleItemId: row.schedule_item_id ? String(row.schedule_item_id) : null,
    requirementId: row.requirement_id ? String(row.requirement_id) : null, resourceId: row.resource_id ? String(row.resource_id) : null, revision: Number(row.revision) };
}

function clock(value: unknown) { return value ? String(value).slice(0, 5) : null; }

export function mapBreakdownCategory(category: string): RequirementCategory {
  if (category === "character" || category === "extra") return "talent";
  if (["location", "prop", "wardrobe", "vehicle", "animal", "makeup", "practical_effect", "visual_effect", "stunt", "sound_music"].includes(category)) return category as RequirementCategory;
  return "other";
}

function normalizeIdentity(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleUpperCase("es-MX").slice(0, 180);
}
