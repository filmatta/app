export type WriterWorkspaceLayout = {
  leftSidebarVisible: boolean;
  rightSidebarVisible: boolean;
  timelineHeight: number;
  charactersHeight: number;
};

export const WRITER_WORKSPACE_LAYOUT_DEFAULTS: WriterWorkspaceLayout = {
  leftSidebarVisible: true,
  rightSidebarVisible: true,
  timelineHeight: 260,
  charactersHeight: 360,
};

export const WRITER_HORIZONTAL_PANEL_LIMITS = {
  timeline: { min: 160, max: 720 },
  characters: { min: 120, max: 620 },
} as const;

export type WriterHorizontalPanel = keyof typeof WRITER_HORIZONTAL_PANEL_LIMITS;

export function writerWorkspaceLayoutStorageKey(userId: string) {
  return `filmatta.writer.workspace-layout.v2:${userId}`;
}

export function legacyWriterWorkspaceLayoutStorageKey(userId: string) {
  return `filmatta.writer.workspace-layout.v1:${userId}`;
}

export function migrateWriterWorkspaceLayout(value: string | null): WriterWorkspaceLayout {
  const parsed = parseWriterWorkspaceLayout(value);
  // v1 persisted 260px even when the user never moved the splitter. Only that exact
  // legacy default is migrated; every other saved height is treated as deliberate.
  return parsed.charactersHeight === 260 ? { ...parsed, charactersHeight: 360 } : parsed;
}

export function clampWriterHorizontalPanelHeight(panel: WriterHorizontalPanel, value: number) {
  const limits = WRITER_HORIZONTAL_PANEL_LIMITS[panel];
  if (!Number.isFinite(value)) {
    return panel === "timeline"
      ? WRITER_WORKSPACE_LAYOUT_DEFAULTS.timelineHeight
      : WRITER_WORKSPACE_LAYOUT_DEFAULTS.charactersHeight;
  }
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

export function parseWriterWorkspaceLayout(value: string | null): WriterWorkspaceLayout {
  if (!value) return { ...WRITER_WORKSPACE_LAYOUT_DEFAULTS };
  try {
    const parsed = JSON.parse(value) as Partial<WriterWorkspaceLayout> | null;
    if (!parsed || typeof parsed !== "object") return { ...WRITER_WORKSPACE_LAYOUT_DEFAULTS };
    return {
      leftSidebarVisible: typeof parsed.leftSidebarVisible === "boolean" ? parsed.leftSidebarVisible : true,
      rightSidebarVisible: typeof parsed.rightSidebarVisible === "boolean" ? parsed.rightSidebarVisible : true,
      timelineHeight: clampWriterHorizontalPanelHeight("timeline", Number(parsed.timelineHeight)),
      charactersHeight: clampWriterHorizontalPanelHeight("characters", Number(parsed.charactersHeight)),
    };
  } catch {
    return { ...WRITER_WORKSPACE_LAYOUT_DEFAULTS };
  }
}
