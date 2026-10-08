export type ProductionPlan = {
  id: string;
  ownerId: string;
  projectId: string | null;
  name: string;
  timezone: string;
  scriptId: string | null;
  shotlistId: string | null;
  sourceScriptRevision: number | null;
  sourceShotlistRevision: number | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductionDay = {
  id: string;
  productionId: string;
  position: number;
  name: string;
  shootDate: string | null;
  callTime: string | null;
  wrapTime: string | null;
  wrapNextDay: boolean;
  notes: string | null;
  revision: number;
};

export type ScheduleItemType = "scene" | "shot" | "manual" | "logistics";
export type LogisticsType = "call" | "meal" | "transfer" | "break" | "other";

export type ProductionScheduleItem = {
  id: string;
  productionId: string;
  dayId: string | null;
  position: number;
  itemType: ScheduleItemType;
  logisticsType: LogisticsType | null;
  title: string;
  notes: string | null;
  sourceSceneId: string | null;
  sourceGroupId: string | null;
  sourceShotId: string | null;
  sourceLabel: string | null;
  sourceRevision: number | null;
  shootMinutes: number | null;
  startTime: string | null;
  endTime: string | null;
  endNextDay: boolean;
  revision: number;
};

export type RequirementCategory =
  | "talent" | "crew" | "location" | "prop" | "wardrobe" | "vehicle"
  | "animal" | "makeup" | "practical_effect" | "visual_effect" | "stunt"
  | "sound_music" | "equipment" | "service" | "other";

export type ProductionRequirement = {
  id: string;
  productionId: string;
  category: RequirementCategory;
  name: string;
  origin: "breakdown" | "manual";
  sourceElementId: string | null;
  sourceScriptId: string | null;
  sourceIdentityKey: string | null;
  sourceLabel: string | null;
  sourceRevision: number | null;
  notes: string | null;
  revision: number;
  sourceSceneIds: string[];
};

export type ResourceType = "person" | "location" | "prop" | "wardrobe" | "vehicle" | "equipment" | "service" | "other";

export type ProductionResource = {
  id: string;
  productionId: string;
  name: string;
  resourceType: ResourceType;
  contact: string | null;
  address: string | null;
  notes: string | null;
  availabilityNotes: string | null;
  role: string | null;
  phone: string | null;
  includeInCallSheet: boolean;
  revision: number;
};

export type ProductionDocumentExport = {
  documentKey: string;
  versionMajor: number;
  versionMinor: number;
  generatedAt: string;
  generatedBy: string;
  sourceUpdatedAt: string;
  sourceFingerprint: string;
  revision: number;
};

export type CoverageStatus = "unassigned" | "tentative" | "confirmed" | "unavailable";

export type ProductionCoverage = {
  id: string;
  productionId: string;
  requirementId: string;
  dayId: string;
  resourceId: string | null;
  status: CoverageStatus;
  requiredTime: string | null;
  arrivalTime: string | null;
  notes: string | null;
  confirmedForDate: string | null;
  needsReconfirmation: boolean;
  revision: number;
};

export type ProductionTask = {
  id: string;
  productionId: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  assigneeText: string | null;
  assigneeResourceId: string | null;
  dueDate: string | null;
  department: string | null;
  notes: string | null;
  dayId: string | null;
  scheduleItemId: string | null;
  requirementId: string | null;
  resourceId: string | null;
  revision: number;
};

export type SourceScriptOption = { id: string; projectId: string | null; title: string; revision: number; sceneCount: number; eligibleRequirementCount: number };
export type SourceShotlistOption = { id: string; projectId: string | null; scriptId: string | null; title: string; revision: number; groupCount: number; shotCount: number };
export type SourceScene = { id: string; title: string; position: number; revision: number };
export type SourceShot = {
  id: string;
  groupId: string;
  sceneId: string | null;
  title: string;
  shotType: string;
  subject: string;
  durationSeconds: number | null;
  position: number;
  revision: number;
};
export type SourceGroup = {
  id: string;
  sceneId: string | null;
  title: string;
  position: number;
  revision: number;
  sourceStatus: "linked" | "missing" | "manual";
  shots: SourceShot[];
};

export type EligibleRequirement = {
  sourceElementId: string;
  sourceScriptId: string;
  category: RequirementCategory;
  name: string;
  identityKey: string;
  sourceRevision: number;
  sceneIds: string[];
  alreadyImported: boolean;
};

export type ProductionSourceState = {
  script: { id: string; title: string; revision: number; updatedAt?: string; available: true } | { id: string; available: false } | null;
  shotlist: { id: string; title: string; revision: number; updatedAt?: string; scriptId: string | null; available: true } | { id: string; available: false } | null;
  scenes: SourceScene[];
  groups: SourceGroup[];
  eligibleRequirements: EligibleRequirement[];
};

export type ProductionWorkspaceData = {
  production: ProductionPlan;
  days: ProductionDay[];
  scheduleItems: ProductionScheduleItem[];
  requirements: ProductionRequirement[];
  resources: ProductionResource[];
  coverages: ProductionCoverage[];
  tasks: ProductionTask[];
  documentExports: ProductionDocumentExport[];
  storyboardFingerprint?: string | null;
  storyboardUpdatedAt?: string | null;
  source: ProductionSourceState;
  sourceOptions: { scripts: SourceScriptOption[]; shotlists: SourceShotlistOption[] };
};

export type ProductionListItem = ProductionPlan & { dayCount: number; scheduledCount: number; pendingTaskCount: number };

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: "invalid" | "unauthorized" | "not_found" | "conflict" | "duplicate" | "storage"; message: string };
