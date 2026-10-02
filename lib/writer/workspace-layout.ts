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
  charactersHeight: 260,
};

export const WRITER_HORIZONTAL_PANEL_LIMITS = {
  timeline: { min: 160, max: 720 },
  characters: { min: 120, max: 520 },
} as const;

export type WriterHorizontalPanel = keyof typeof WRITER_HORIZONTAL_PANEL_LIMITS;

export function writerWorkspaceLayoutStorageKey(userId: string) {
  return `filmatta.writer.workspace-layout.v1:${userId}`;
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
