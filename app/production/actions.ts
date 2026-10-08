"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateWriterDocument } from "@/lib/writer/document";
import { deriveWriterSceneSources } from "@/lib/writer/script-assistant";
import {
  assertOwnedProduction,
  loadEligibleRequirements,
  ProductionError,
  validateOwnedSources,
} from "@/lib/production/server";
import type {
  ActionResult,
  CoverageStatus,
  LogisticsType,
  RequirementCategory,
  ResourceType,
} from "@/lib/production/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUIREMENT_CATEGORIES = new Set<RequirementCategory>([
  "talent", "crew", "location", "prop", "wardrobe", "vehicle", "animal", "makeup",
  "practical_effect", "visual_effect", "stunt", "sound_music", "equipment", "service", "other",
]);
const RESOURCE_TYPES = new Set<ResourceType>(["person", "location", "prop", "wardrobe", "vehicle", "equipment", "service", "other"]);

export async function createProductionAction(input: {
  operationId: string;
  projectId: string;
  name: string;
  timezone: string;
  scriptId?: string | null;
  shotlistId?: string | null;
  importRequirements?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, userId } = await session();
    if (!validUuid(input.operationId) || !validUuid(input.projectId) || !clean(input.name, 160) || !validTimezone(input.timezone)) invalid("Revisa el nombre y la zona horaria.");
    const scriptId = nullableUuid(input.scriptId);
    const shotlistId = nullableUuid(input.shotlistId);
    if (input.scriptId && !scriptId || input.shotlistId && !shotlistId) invalid();
    const project = await db.from("projects").select("id").eq("id", input.projectId).eq("owner_id", userId).neq("lifecycle_status", "archived").maybeSingle();
    if (project.error || !project.data) invalid("Proyecto no disponible.");
    const sources = await validateOwnedSources(db, userId, scriptId, shotlistId);
    if (sources.script && sources.script.projectId !== input.projectId || sources.shotlist && sources.shotlist.projectId !== input.projectId) invalid("Las fuentes pertenecen a otro proyecto.");
    const created = await db.from("production_plans").insert({
      owner_id: userId,
      project_id: input.projectId,
      name: input.name.trim(),
      timezone: input.timezone,
      script_id: sources.script?.id ?? null,
      shotlist_id: sources.shotlist?.id ?? null,
      source_script_revision: sources.script?.revision ?? null,
      source_shotlist_revision: sources.shotlist?.revision ?? null,
      creation_operation_id: input.operationId,
    }).select("id").maybeSingle();
    let id = created.data?.id ? String(created.data.id) : null;
    if (created.error?.code === "23505") {
      const existing = await db.from("production_plans").select("id").eq("owner_id", userId).eq("creation_operation_id", input.operationId).maybeSingle();
      id = existing.data?.id ? String(existing.data.id) : null;
    } else if (created.error) storage();
    if (!id) storage();
    if (input.importRequirements && sources.script) await importRequirements(db, userId, id, sources.script.id);
    revalidatePath("/production");
    return { ok: true, data: { id } };
  } catch (cause) { return actionFailure(cause); }
}

export async function updateProductionSettingsAction(input: {
  productionId: string;
  expectedRevision: number;
  name: string;
  timezone: string;
}): Promise<ActionResult<{ revision: number }>> {
  try {
    const { db, userId } = await session();
    if (!validUuid(input.productionId) || !positiveInteger(input.expectedRevision) || !clean(input.name, 160) || !validTimezone(input.timezone)) invalid();
    const result = await db.from("production_plans").update({
      name: input.name.trim(), timezone: input.timezone, revision: input.expectedRevision + 1, updated_at: now(),
    }).eq("id", input.productionId).eq("owner_id", userId).eq("revision", input.expectedRevision).select("revision").maybeSingle();
    if (result.error) storage();
    if (!result.data) conflict();
    refresh(input.productionId);
    return { ok: true, data: { revision: Number(result.data.revision) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function linkProductionSourcesAction(input: {
  productionId: string;
  expectedRevision: number;
  scriptId?: string | null;
  shotlistId?: string | null;
}): Promise<ActionResult<{ revision: number }>> {
  try {
    const { db, userId } = await session();
    if (!validUuid(input.productionId) || !positiveInteger(input.expectedRevision)) invalid();
    const production = await assertOwnedProduction(db, userId, input.productionId);
    const scriptId = nullableUuid(input.scriptId);
    const shotlistId = nullableUuid(input.shotlistId);
    if (!scriptId && !shotlistId) invalid("Selecciona un guion o una Shotlist.");
    if ((production.scriptId && production.scriptId !== scriptId) || (production.shotlistId && production.shotlistId !== shotlistId)) {
      invalid("No se reemplaza una fuente vinculada desde esta Foundation.");
    }
    const sources = await validateOwnedSources(db, userId, scriptId, shotlistId);
    const targetProjectId = production.projectId ?? sources.script?.projectId ?? sources.shotlist?.projectId;
    if (!targetProjectId || sources.script && sources.script.projectId !== targetProjectId || sources.shotlist && sources.shotlist.projectId !== targetProjectId) invalid("Las fuentes pertenecen a otro proyecto.");
    const result = await db.from("production_plans").update({
      project_id: targetProjectId,
      script_id: sources.script?.id ?? null,
      shotlist_id: sources.shotlist?.id ?? null,
      source_script_revision: sources.script?.revision ?? null,
      source_shotlist_revision: sources.shotlist?.revision ?? null,
      revision: input.expectedRevision + 1,
      updated_at: now(),
    }).eq("id", input.productionId).eq("owner_id", userId).eq("revision", input.expectedRevision).select("revision").maybeSingle();
    if (result.error) storage();
    if (!result.data) conflict();
    refresh(input.productionId);
    return { ok: true, data: { revision: Number(result.data.revision) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function createDayAction(input: {
  productionId: string;
  name: string;
  shootDate?: string | null;
  callTime?: string | null;
  wrapTime?: string | null;
  wrapNextDay?: boolean;
  notes?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, userId } = await session();
    if (!validUuid(input.productionId) || !clean(input.name, 120) || !optionalDate(input.shootDate) || !optionalTime(input.callTime) || !optionalTime(input.wrapTime) || !optionalText(input.notes, 4000)) invalid();
    await assertOwnedProduction(db, userId, input.productionId);
    const last = await db.from("production_days").select("position").eq("owner_id", userId).eq("production_id", input.productionId).order("position", { ascending: false }).limit(1);
    if (last.error) storage();
    const position = Number(last.data?.[0]?.position ?? -1) + 1;
    const result = await db.from("production_days").insert({
      owner_id: userId, production_id: input.productionId, position, name: input.name.trim(),
      shoot_date: emptyToNull(input.shootDate), call_time: emptyToNull(input.callTime), wrap_time: emptyToNull(input.wrapTime),
      wrap_next_day: Boolean(input.wrapNextDay), notes: cleanNull(input.notes),
    }).select("id").single();
    if (result.error || !result.data) storage("No pudimos crear la jornada.");
    await touch(db, userId, input.productionId);
    refresh(input.productionId);
    return { ok: true, data: { id: String(result.data.id) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function updateDayAction(input: {
  productionId: string;
  dayId: string;
  expectedRevision: number;
  name: string;
  shootDate?: string | null;
  callTime?: string | null;
  wrapTime?: string | null;
  wrapNextDay?: boolean;
  notes?: string | null;
}): Promise<ActionResult<{ revision: number }>> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.dayId].every(validUuid) || !positiveInteger(input.expectedRevision) || !clean(input.name, 120)
      || !optionalDate(input.shootDate) || !optionalTime(input.callTime) || !optionalTime(input.wrapTime) || !optionalText(input.notes, 4000)) invalid();
    const result = await db.from("production_days").update({
      name: input.name.trim(), shoot_date: emptyToNull(input.shootDate), call_time: emptyToNull(input.callTime),
      wrap_time: emptyToNull(input.wrapTime), wrap_next_day: Boolean(input.wrapNextDay), notes: cleanNull(input.notes),
      revision: input.expectedRevision + 1, updated_at: now(),
    }).eq("id", input.dayId).eq("production_id", input.productionId).eq("owner_id", userId).eq("revision", input.expectedRevision).select("revision").maybeSingle();
    if (result.error) storage("No pudimos guardar la jornada.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId);
    refresh(input.productionId);
    return { ok: true, data: { revision: Number(result.data.revision) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function deleteDayAction(input: { productionId: string; dayId: string; expectedRevision: number }): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.dayId].every(validUuid) || !positiveInteger(input.expectedRevision)) invalid();
    const result = await db.from("production_days").delete().eq("id", input.dayId).eq("production_id", input.productionId)
      .eq("owner_id", userId).eq("revision", input.expectedRevision).select("id").maybeSingle();
    if (result.error) storage("No pudimos eliminar la jornada.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId);
    refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

export async function scheduleSourceAction(input: {
  productionId: string;
  dayId: string;
  sourceKind: "scene" | "shot";
  sourceId: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.dayId, input.sourceId].every(validUuid) || !["scene", "shot"].includes(input.sourceKind)) invalid();
    const production = await assertOwnedProduction(db, userId, input.productionId);
    await assertOwnedChild(db, "production_days", input.dayId, input.productionId, userId);
    let row: Record<string, unknown>;
    if (input.sourceKind === "shot") {
      if (!production.shotlistId) invalid("Esta producción no tiene una Shotlist vinculada.");
      const shot = await db.from("writer_shotlist_shots").select("id,group_id,shot_type,subject,revision")
        .eq("id", input.sourceId).eq("shotlist_id", production.shotlistId).eq("owner_id", userId).maybeSingle();
      if (shot.error || !shot.data) notFound("Plano no encontrado.");
      const group = await db.from("writer_shotlist_groups").select("id,source_scene_id,title")
        .eq("id", shot.data.group_id).eq("shotlist_id", production.shotlistId).eq("owner_id", userId).maybeSingle();
      if (group.error || !group.data) notFound("Escena de la Shotlist no encontrada.");
      row = {
        item_type: "shot", title: `${String(shot.data.shot_type)}${shot.data.subject ? ` · ${String(shot.data.subject)}` : ""}`,
        source_scene_id: group.data.source_scene_id, source_group_id: group.data.id, source_shot_id: shot.data.id,
        source_label: group.data.title, source_revision: shot.data.revision,
      };
    } else if (production.shotlistId) {
      const group = await db.from("writer_shotlist_groups").select("id,source_scene_id,title,revision")
        .eq("id", input.sourceId).eq("shotlist_id", production.shotlistId).eq("owner_id", userId).maybeSingle();
      if (group.error || !group.data) notFound("Escena no encontrada.");
      row = { item_type: "scene", title: group.data.title, source_scene_id: group.data.source_scene_id, source_group_id: group.data.id, source_label: group.data.title, source_revision: group.data.revision };
    } else {
      if (!production.scriptId) invalid("Esta producción no tiene un guion vinculado.");
      const script = await db.from("writer_scripts").select("document,revision").eq("id", production.scriptId).eq("owner_id", userId).maybeSingle();
      const document = script.data ? validateWriterDocument(script.data.document) : null;
      const scene = document?.ok ? deriveWriterSceneSources(document.document).find((candidate) => candidate.sceneId === input.sourceId) : null;
      if (script.error || !scene) notFound("Escena no encontrada.");
      row = { item_type: "scene", title: scene.heading, source_scene_id: scene.sceneId, source_label: scene.heading, source_revision: script.data?.revision };
    }
    const position = await nextSchedulePosition(db, userId, input.productionId, input.dayId);
    const result = await db.from("production_schedule_items").insert({ owner_id: userId, production_id: input.productionId, day_id: input.dayId, position, ...row }).select("id").single();
    if (result.error?.code === "23505") duplicate("Ese elemento ya está programado. Puedes moverlo a esta jornada.");
    if (result.error || !result.data) storage("No pudimos programar el elemento.");
    await touch(db, userId, input.productionId);
    refresh(input.productionId);
    return { ok: true, data: { id: String(result.data.id) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function createScheduleBlockAction(input: {
  productionId: string;
  dayId: string;
  itemType: "manual" | "logistics";
  logisticsType?: LogisticsType | null;
  title: string;
  notes?: string | null;
  shootMinutes?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  endNextDay?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.dayId].every(validUuid) || !["manual", "logistics"].includes(input.itemType) || !clean(input.title, 200)
      || !optionalText(input.notes, 4000) || !optionalMinutes(input.shootMinutes) || !optionalTime(input.startTime) || !optionalTime(input.endTime)) invalid();
    if (input.itemType === "logistics" && !["call", "meal", "transfer", "break", "other"].includes(String(input.logisticsType))) invalid();
    await assertOwnedChild(db, "production_days", input.dayId, input.productionId, userId);
    const position = await nextSchedulePosition(db, userId, input.productionId, input.dayId);
    const result = await db.from("production_schedule_items").insert({
      owner_id: userId, production_id: input.productionId, day_id: input.dayId, position, item_type: input.itemType,
      logistics_type: input.itemType === "logistics" ? input.logisticsType : null, title: input.title.trim(), notes: cleanNull(input.notes),
      shoot_minutes: input.shootMinutes ?? null, start_time: emptyToNull(input.startTime), end_time: emptyToNull(input.endTime), end_next_day: Boolean(input.endNextDay),
    }).select("id").single();
    if (result.error || !result.data) storage("No pudimos crear el bloque.");
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: { id: String(result.data.id) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function updateScheduleItemAction(input: {
  productionId: string;
  itemId: string;
  expectedRevision: number;
  title: string;
  notes?: string | null;
  shootMinutes?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  endNextDay?: boolean;
}): Promise<ActionResult<{ revision: number }>> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.itemId].every(validUuid) || !positiveInteger(input.expectedRevision) || !clean(input.title, 200)
      || !optionalText(input.notes, 4000) || !optionalMinutes(input.shootMinutes) || !optionalTime(input.startTime) || !optionalTime(input.endTime)) invalid();
    const result = await db.from("production_schedule_items").update({
      title: input.title.trim(), notes: cleanNull(input.notes), shoot_minutes: input.shootMinutes ?? null,
      start_time: emptyToNull(input.startTime), end_time: emptyToNull(input.endTime), end_next_day: Boolean(input.endNextDay),
      revision: input.expectedRevision + 1, updated_at: now(),
    }).eq("id", input.itemId).eq("production_id", input.productionId).eq("owner_id", userId).eq("revision", input.expectedRevision).select("revision").maybeSingle();
    if (result.error) storage("No pudimos guardar el bloque.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: { revision: Number(result.data.revision) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function moveScheduleItemAction(input: { productionId: string; itemId: string; dayId: string | null; expectedRevision: number }): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.itemId].every(validUuid) || input.dayId !== null && !validUuid(input.dayId) || !positiveInteger(input.expectedRevision)) invalid();
    if (input.dayId) await assertOwnedChild(db, "production_days", input.dayId, input.productionId, userId);
    const position = input.dayId ? await nextSchedulePosition(db, userId, input.productionId, input.dayId) : 0;
    const result = await db.from("production_schedule_items").update({ day_id: input.dayId, position, revision: input.expectedRevision + 1, updated_at: now() })
      .eq("id", input.itemId).eq("production_id", input.productionId).eq("owner_id", userId).eq("revision", input.expectedRevision).select("id").maybeSingle();
    if (result.error) storage("No pudimos mover el bloque.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

export async function reorderScheduleItemAction(input: { productionId: string; itemId: string; expectedRevision: number; direction: -1 | 1 }): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.itemId].every(validUuid) || !positiveInteger(input.expectedRevision) || ![-1, 1].includes(input.direction)) invalid();
    const result = await db.rpc("production_move_schedule_item", {
      p_production_id: input.productionId,
      p_item_id: input.itemId,
      p_expected_revision: input.expectedRevision,
      p_direction: input.direction,
    });
    if (result.error) storage("No pudimos cambiar el orden del bloque.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId);
    refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

export async function deleteScheduleItemAction(input: { productionId: string; itemId: string; expectedRevision: number }): Promise<ActionResult> {
  return deleteVersioned("production_schedule_items", input, "itemId", "No pudimos retirar el bloque de la programación.");
}

export async function importRequirementsAction(input: { productionId: string }): Promise<ActionResult<{ imported: number }>> {
  try {
    const { db, userId } = await session();
    if (!validUuid(input.productionId)) invalid();
    const production = await assertOwnedProduction(db, userId, input.productionId);
    if (!production.scriptId) invalid("Vincula un guion para importar necesidades.");
    const imported = await importRequirements(db, userId, production.id, production.scriptId);
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: { imported } };
  } catch (cause) { return actionFailure(cause); }
}

export async function createRequirementAction(input: { productionId: string; name: string; category: RequirementCategory; notes?: string | null }): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, userId } = await session();
    if (!validUuid(input.productionId) || !clean(input.name, 160) || !REQUIREMENT_CATEGORIES.has(input.category) || !optionalText(input.notes, 4000)) invalid();
    await assertOwnedProduction(db, userId, input.productionId);
    const result = await db.from("production_requirements").insert({ owner_id: userId, production_id: input.productionId, name: input.name.trim(), category: input.category, origin: "manual", notes: cleanNull(input.notes) }).select("id").single();
    if (result.error || !result.data) storage("No pudimos crear la necesidad.");
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: { id: String(result.data.id) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function updateRequirementAction(input: { productionId: string; requirementId: string; expectedRevision: number; name: string; category: RequirementCategory; notes?: string | null }): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.requirementId].every(validUuid) || !positiveInteger(input.expectedRevision) || !clean(input.name, 160)
      || !REQUIREMENT_CATEGORIES.has(input.category) || !optionalText(input.notes, 4000)) invalid();
    const result = await db.from("production_requirements").update({
      name: input.name.trim(), category: input.category, notes: cleanNull(input.notes), revision: input.expectedRevision + 1, updated_at: now(),
    }).eq("id", input.requirementId).eq("production_id", input.productionId).eq("owner_id", userId).eq("origin", "manual")
      .eq("revision", input.expectedRevision).select("id").maybeSingle();
    if (result.error) storage("No pudimos guardar la necesidad.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

export async function createResourceAction(input: {
  productionId: string;
  name: string;
  resourceType: ResourceType;
  contact?: string | null;
  address?: string | null;
  notes?: string | null;
  availabilityNotes?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, userId } = await session();
    if (!validUuid(input.productionId) || !clean(input.name, 160) || !RESOURCE_TYPES.has(input.resourceType)
      || !optionalText(input.contact, 500) || !optionalText(input.address, 1000) || !optionalText(input.notes, 4000) || !optionalText(input.availabilityNotes, 2000)) invalid();
    await assertOwnedProduction(db, userId, input.productionId);
    const result = await db.from("production_resources").insert({
      owner_id: userId, production_id: input.productionId, name: input.name.trim(), resource_type: input.resourceType,
      contact: cleanNull(input.contact), address: cleanNull(input.address), notes: cleanNull(input.notes), availability_notes: cleanNull(input.availabilityNotes),
    }).select("id").single();
    if (result.error || !result.data) storage("No pudimos crear el recurso.");
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: { id: String(result.data.id) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function updateResourceAction(input: {
  productionId: string;
  resourceId: string;
  expectedRevision: number;
  name: string;
  resourceType: ResourceType;
  contact?: string | null;
  address?: string | null;
  notes?: string | null;
  availabilityNotes?: string | null;
}): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.resourceId].every(validUuid) || !positiveInteger(input.expectedRevision) || !clean(input.name, 160)
      || !RESOURCE_TYPES.has(input.resourceType) || !optionalText(input.contact, 500) || !optionalText(input.address, 1000)
      || !optionalText(input.notes, 4000) || !optionalText(input.availabilityNotes, 2000)) invalid();
    const result = await db.from("production_resources").update({
      name: input.name.trim(), resource_type: input.resourceType, contact: cleanNull(input.contact), address: cleanNull(input.address),
      notes: cleanNull(input.notes), availability_notes: cleanNull(input.availabilityNotes), revision: input.expectedRevision + 1, updated_at: now(),
    }).eq("id", input.resourceId).eq("production_id", input.productionId).eq("owner_id", userId).eq("revision", input.expectedRevision)
      .select("id").maybeSingle();
    if (result.error) storage("No pudimos guardar el recurso.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

export async function upsertCoverageAction(input: {
  productionId: string;
  requirementId: string;
  dayId: string;
  resourceId?: string | null;
  status: CoverageStatus;
  requiredTime?: string | null;
  arrivalTime?: string | null;
  notes?: string | null;
  expectedRevision?: number | null;
}): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.requirementId, input.dayId].every(validUuid) || input.resourceId && !validUuid(input.resourceId)
      || !["unassigned", "tentative", "confirmed", "unavailable"].includes(input.status)
      || !optionalTime(input.requiredTime) || !optionalTime(input.arrivalTime) || !optionalText(input.notes, 2000)) invalid();
    const [day] = await Promise.all([
      assertOwnedChild(db, "production_days", input.dayId, input.productionId, userId, "id,shoot_date"),
      assertOwnedChild(db, "production_requirements", input.requirementId, input.productionId, userId),
      input.resourceId ? assertOwnedChild(db, "production_resources", input.resourceId, input.productionId, userId) : Promise.resolve(null),
    ]);
    if (input.status !== "unassigned" && !input.resourceId) invalid("Selecciona un recurso para cambiar el estado.");
    if (input.status === "confirmed" && !day.shoot_date) invalid("Define la fecha de la jornada antes de confirmar un recurso.");
    const values = {
      resource_id: input.status === "unassigned" ? null : input.resourceId,
      status: input.status,
      required_time: emptyToNull(input.requiredTime), arrival_time: emptyToNull(input.arrivalTime), notes: cleanNull(input.notes),
      confirmed_for_date: input.status === "confirmed" ? day.shoot_date : null,
      needs_reconfirmation: false,
      updated_at: now(),
    };
    if (input.expectedRevision) {
      const updated = await db.from("production_coverages").update({ ...values, revision: input.expectedRevision + 1 })
        .eq("owner_id", userId).eq("production_id", input.productionId).eq("requirement_id", input.requirementId).eq("day_id", input.dayId)
        .eq("revision", input.expectedRevision).select("id").maybeSingle();
      if (updated.error) storage("No pudimos guardar la cobertura.");
      if (!updated.data) conflict();
    } else {
      const inserted = await db.from("production_coverages").insert({ owner_id: userId, production_id: input.productionId, requirement_id: input.requirementId, day_id: input.dayId, ...values });
      if (inserted.error?.code === "23505") conflict();
      if (inserted.error) storage("No pudimos guardar la cobertura.");
    }
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

export async function createTaskAction(input: {
  productionId: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assigneeText?: string | null;
  assigneeResourceId?: string | null;
  dueDate?: string | null;
  department?: string | null;
  notes?: string | null;
  linkType?: "day" | "schedule" | "requirement" | "resource" | null;
  linkId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, userId } = await session();
    if (!validUuid(input.productionId) || !clean(input.title, 240) || !["pending", "in_progress", "done"].includes(input.status)
      || !["low", "medium", "high"].includes(input.priority) || !optionalText(input.assigneeText, 160)
      || input.assigneeResourceId && !validUuid(input.assigneeResourceId) || !optionalDate(input.dueDate)
      || !optionalText(input.department, 120) || !optionalText(input.notes, 4000)) invalid();
    await assertOwnedProduction(db, userId, input.productionId);
    if (input.assigneeResourceId) await assertOwnedChild(db, "production_resources", input.assigneeResourceId, input.productionId, userId);
    const links: Record<string, string | null> = { day_id: null, schedule_item_id: null, requirement_id: null, resource_id: null };
    if (input.linkType || input.linkId) {
      if (!input.linkType || !validUuid(input.linkId)) invalid();
      const table = { day: "production_days", schedule: "production_schedule_items", requirement: "production_requirements", resource: "production_resources" }[input.linkType];
      const column = { day: "day_id", schedule: "schedule_item_id", requirement: "requirement_id", resource: "resource_id" }[input.linkType];
      await assertOwnedChild(db, table, input.linkId, input.productionId, userId);
      links[column] = input.linkId;
    }
    const result = await db.from("production_tasks").insert({
      owner_id: userId, production_id: input.productionId, title: input.title.trim(), status: input.status, priority: input.priority,
      assignee_text: cleanNull(input.assigneeText), assignee_resource_id: input.assigneeResourceId ?? null, due_date: emptyToNull(input.dueDate),
      department: cleanNull(input.department), notes: cleanNull(input.notes), ...links,
    }).select("id").single();
    if (result.error || !result.data) storage("No pudimos crear la tarea.");
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: { id: String(result.data.id) } };
  } catch (cause) { return actionFailure(cause); }
}

export async function updateTaskStatusAction(input: { productionId: string; taskId: string; expectedRevision: number; status: "pending" | "in_progress" | "done" }): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.taskId].every(validUuid) || !positiveInteger(input.expectedRevision) || !["pending", "in_progress", "done"].includes(input.status)) invalid();
    const result = await db.from("production_tasks").update({ status: input.status, revision: input.expectedRevision + 1, updated_at: now() })
      .eq("id", input.taskId).eq("production_id", input.productionId).eq("owner_id", userId).eq("revision", input.expectedRevision).select("id").maybeSingle();
    if (result.error) storage("No pudimos actualizar la tarea.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

export async function updateTaskAction(input: {
  productionId: string;
  taskId: string;
  expectedRevision: number;
  title: string;
  priority: "low" | "medium" | "high";
  assigneeText?: string | null;
  dueDate?: string | null;
  department?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    if (![input.productionId, input.taskId].every(validUuid) || !positiveInteger(input.expectedRevision) || !clean(input.title, 240)
      || !["low", "medium", "high"].includes(input.priority) || !optionalText(input.assigneeText, 160)
      || !optionalDate(input.dueDate) || !optionalText(input.department, 120) || !optionalText(input.notes, 4000)) invalid();
    const result = await db.from("production_tasks").update({
      title: input.title.trim(), priority: input.priority, assignee_text: cleanNull(input.assigneeText), due_date: emptyToNull(input.dueDate),
      department: cleanNull(input.department), notes: cleanNull(input.notes), revision: input.expectedRevision + 1, updated_at: now(),
    }).eq("id", input.taskId).eq("production_id", input.productionId).eq("owner_id", userId).eq("revision", input.expectedRevision)
      .select("id").maybeSingle();
    if (result.error) storage("No pudimos guardar la tarea.");
    if (!result.data) conflict();
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

export async function deleteTaskAction(input: { productionId: string; taskId: string; expectedRevision: number }): Promise<ActionResult> {
  return deleteVersioned("production_tasks", input, "taskId", "No pudimos eliminar la tarea.");
}

async function importRequirements(db: Awaited<ReturnType<typeof createClient>>, userId: string, productionId: string, scriptId: string) {
  const candidates = await loadEligibleRequirements(db, userId, scriptId, productionId);
  let imported = 0;
  for (const candidate of candidates.filter((item) => !item.alreadyImported)) {
    const existing = await db.from("production_requirements").select("id").eq("owner_id", userId).eq("production_id", productionId)
      .eq("source_identity_key", candidate.identityKey).maybeSingle();
    if (existing.error) storage("No pudimos reconciliar las necesidades.");
    let requirementId = existing.data?.id ? String(existing.data.id) : null;
    if (!requirementId) {
      const created = await db.from("production_requirements").insert({
        owner_id: userId, production_id: productionId, category: candidate.category, name: candidate.name, origin: "breakdown",
        source_element_id: candidate.sourceElementId, source_script_id: candidate.sourceScriptId, source_identity_key: candidate.identityKey,
        source_label: candidate.name, source_revision: candidate.sourceRevision,
      }).select("id").maybeSingle();
      if (created.error?.code === "23505") continue;
      if (created.error || !created.data) storage("No pudimos importar una necesidad.");
      requirementId = String(created.data.id); imported += 1;
    }
    if (candidate.sceneIds.length) {
      const linked = await db.from("production_requirement_scenes").upsert(candidate.sceneIds.map((sceneId) => ({
        owner_id: userId, production_id: productionId, requirement_id: requirementId, source_scene_id: sceneId,
      })), { onConflict: "requirement_id,source_scene_id", ignoreDuplicates: true });
      if (linked.error) storage("No pudimos vincular la necesidad con sus escenas.");
    }
  }
  return imported;
}

async function deleteVersioned(
  table: "production_schedule_items" | "production_tasks",
  input: { productionId: string; expectedRevision: number; itemId?: string; taskId?: string },
  idKey: "itemId" | "taskId",
  message: string,
): Promise<ActionResult> {
  try {
    const { db, userId } = await session();
    const id = input[idKey];
    if (!validUuid(input.productionId) || !validUuid(id) || !positiveInteger(input.expectedRevision)) invalid();
    const result = await db.from(table).delete().eq("id", id).eq("production_id", input.productionId).eq("owner_id", userId)
      .eq("revision", input.expectedRevision).select("id").maybeSingle();
    if (result.error) storage(message);
    if (!result.data) conflict();
    await touch(db, userId, input.productionId); refresh(input.productionId);
    return { ok: true, data: undefined };
  } catch (cause) { return actionFailure(cause); }
}

async function session() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ProductionError("unauthorized", "Inicia sesión para continuar.");
  return { db, userId: data.user.id };
}

async function assertOwnedChild(
  db: Awaited<ReturnType<typeof createClient>>,
  table: string,
  id: string,
  productionId: string,
  ownerId: string,
  fields = "id",
) {
  const result = await db.from(table).select(fields).eq("id", id).eq("production_id", productionId).eq("owner_id", ownerId).maybeSingle();
  if (result.error || !result.data) notFound();
  return result.data as unknown as Record<string, unknown>;
}

async function nextSchedulePosition(db: Awaited<ReturnType<typeof createClient>>, ownerId: string, productionId: string, dayId: string) {
  const result = await db.from("production_schedule_items").select("position").eq("owner_id", ownerId).eq("production_id", productionId).eq("day_id", dayId)
    .order("position", { ascending: false }).limit(1);
  if (result.error) storage();
  return Number(result.data?.[0]?.position ?? -1) + 1;
}

async function touch(db: Awaited<ReturnType<typeof createClient>>, ownerId: string, productionId: string) {
  await db.from("production_plans").update({ updated_at: now() }).eq("id", productionId).eq("owner_id", ownerId);
}

function refresh(id: string) { revalidatePath(`/production/${id}`); revalidatePath("/production"); }
function actionFailure(cause: unknown): ActionResult<never> {
  if (cause instanceof ProductionError) return { ok: false, code: cause.code, message: cause.message };
  return { ok: false, code: "storage", message: "No pudimos guardar el cambio. Intenta de nuevo." };
}
function invalid(message = "La solicitud no es válida."): never { throw new ProductionError("invalid", message); }
function notFound(message = "No encontramos el elemento solicitado."): never { throw new ProductionError("not_found", message); }
function conflict(): never { throw new ProductionError("conflict", "Este contenido cambió en otra pestaña. Recarga antes de volver a guardar."); }
function duplicate(message: string): never { throw new ProductionError("duplicate", message); }
function storage(message = "No pudimos guardar el cambio."): never { throw new ProductionError("storage", message); }
function validUuid(value: unknown): value is string { return typeof value === "string" && UUID_PATTERN.test(value); }
function nullableUuid(value: unknown) { return value == null || value === "" ? null : validUuid(value) ? value : null; }
function clean(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= max; }
function optionalText(value: unknown, max: number) { return value == null || value === "" || typeof value === "string" && value.length <= max; }
function cleanNull(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function emptyToNull(value: unknown) { return typeof value === "string" && value ? value : null; }
function positiveInteger(value: unknown) { return Number.isSafeInteger(value) && Number(value) > 0; }
function optionalMinutes(value: unknown) { return value == null || value === "" || Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 1440; }
function optionalTime(value: unknown) { return value == null || value === "" || typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value); }
function optionalDate(value: unknown) { return value == null || value === "" || typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value); }
function validTimezone(value: unknown) {
  if (typeof value !== "string" || value.length < 1 || value.length > 80) return false;
  try { new Intl.DateTimeFormat("es-MX", { timeZone: value }).format(); return true; } catch { return false; }
}
function now() { return new Date().toISOString(); }
