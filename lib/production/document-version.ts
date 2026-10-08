import type { ProductionDay, ProductionDocumentExport, ProductionWorkspaceData } from "./types";

/**
 * Stable content fingerprint for production exports. This is an identifier,
 * not an incrementing revision number.
 */
export function productionDocumentVersion(data: ProductionWorkspaceData): string {
  const { production } = data;
  const relevant = {
    production: {
      id: production.id,
      name: production.name,
      timezone: production.timezone,
      scriptId: production.scriptId,
      shotlistId: production.shotlistId,
      sourceScriptRevision: production.sourceScriptRevision,
      sourceShotlistRevision: production.sourceShotlistRevision,
      revision: production.revision,
    },
    days: data.days,
    scheduleItems: data.scheduleItems,
    requirements: data.requirements,
    resources: data.resources,
    coverages: data.coverages,
    tasks: data.tasks,
    source: { script: data.source.script, shotlist: data.source.shotlist, scenes: data.source.scenes, groups: data.source.groups },
  };
  return fingerprint(relevant);
}

export function productionDocumentKey(kind: "call-sheet" | "calendar" | "shotlist" | "storyboard" | "script" | "pack", dayId?: string) {
  return kind === "call-sheet" ? `call-sheet:${dayId ?? ""}` : kind;
}

export function productionDocumentFingerprint(data: ProductionWorkspaceData, key: string): string {
  const base = { name: data.production.name, timezone: data.production.timezone };
  if (key.startsWith("call-sheet:")) {
    const dayId = key.slice("call-sheet:".length);
    const day = data.days.find((item) => item.id === dayId) ?? null;
    const schedule = data.scheduleItems.filter((item) => item.dayId === dayId);
    const coverages = data.coverages.filter((item) => item.dayId === dayId);
    const resourceIds = new Set(coverages.flatMap((item) => item.resourceId ? [item.resourceId] : []));
    const sourceGroupIds = new Set(schedule.flatMap((item) => item.sourceGroupId ? [item.sourceGroupId] : []));
    return fingerprint({ base, day, schedule, coverages,
      resources: data.resources.filter((item) => resourceIds.has(item.id) || item.resourceType === "person" && item.includeInCallSheet),
      tasks: data.tasks.filter((item) => item.dayId === dayId), source: data.source.groups.filter((item) => sourceGroupIds.has(item.id)) });
  }
  if (key === "calendar") return fingerprint({ base, days: data.days, schedule: data.scheduleItems, coverages: data.coverages,
    locations: data.resources.filter((item) => item.resourceType === "location"), source: data.source.scenes });
  if (key === "shotlist") return fingerprint({ base, source: data.source.shotlist, groups: data.source.groups });
  if (key === "storyboard") return fingerprint({ base, source: data.source.shotlist, groups: data.source.groups,
    storyboardFingerprint: data.storyboardFingerprint ?? null });
  if (key === "script") return fingerprint({ base, source: data.source.script, scenes: data.source.scenes });
  return productionDocumentVersion(data);
}

export function nextDocumentVersion(last?: Pick<ProductionDocumentExport, "versionMajor" | "versionMinor"> | null): string {
  return `v${last?.versionMajor ?? 1}.${(last?.versionMinor ?? 0) + 1}`;
}

export function exportedDocumentVersion(last?: Pick<ProductionDocumentExport, "versionMajor" | "versionMinor"> | null): string {
  return last ? `v${last.versionMajor}.${last.versionMinor}` : "Sin exportar";
}

export function documentHasChanges(data: ProductionWorkspaceData, key: string, last?: ProductionDocumentExport | null): boolean {
  return Boolean(last && last.sourceFingerprint !== productionDocumentFingerprint(data, key));
}

export function documentSourceUpdatedAt(data: ProductionWorkspaceData, key: string): string {
  const candidates = [data.production.updatedAt];
  if (["shotlist", "storyboard", "pack"].includes(key) || key.startsWith("call-sheet:")) {
    if (data.source.shotlist?.available && data.source.shotlist.updatedAt) candidates.push(data.source.shotlist.updatedAt);
  }
  if (["script", "pack", "calendar"].includes(key) || key.startsWith("call-sheet:")) {
    if (data.source.script?.available && data.source.script.updatedAt) candidates.push(data.source.script.updatedAt);
  }
  if (["storyboard", "pack"].includes(key) && data.storyboardUpdatedAt) candidates.push(data.storyboardUpdatedAt);
  return candidates.sort().at(-1) ?? data.production.updatedAt;
}

function fingerprint(value: unknown) {
  const serialized = canonicalSerialize(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `VC-${hex(first)}${hex(second).slice(0, 4)}`;
}

export function sortProductionDocumentDays(days: ProductionDay[]): ProductionDay[] {
  return [...days].sort((a, b) =>
    (validDateKey(a.shootDate) ?? "9999-12-31").localeCompare(validDateKey(b.shootDate) ?? "9999-12-31")
    || a.position - b.position
    || a.id.localeCompare(b.id)
  );
}

function validDateKey(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return null;
  const key = value.slice(0, 10);
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? null : key;
}

function canonicalSerialize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).sort().join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalSerialize(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function hex(value: number) {
  return (value >>> 0).toString(16).padStart(8, "0").toUpperCase();
}
