export type WriterPanelSide = "left" | "right";

export type WriterPanelLayout = {
  left: number;
  right: number;
};

export const WRITER_PANEL_DESKTOP_MIN_WIDTH = 1200;
export const WRITER_EDITOR_MIN_WIDTH = 520;
export const WRITER_PANEL_LAYOUT_DEFAULTS: WriterPanelLayout = {
  left: 264,
  right: 360,
};

export const WRITER_PANEL_LIMITS = {
  left: { min: 200, max: 420 },
  right: { min: 300, max: 520 },
} as const;

export function writerPanelStorageKey(userId: string) {
  return `filmatta.writer.panel-layout.v1:${userId}`;
}

export function clampWriterPanelWidth(side: WriterPanelSide, value: number) {
  const limits = WRITER_PANEL_LIMITS[side];
  if (!Number.isFinite(value)) return WRITER_PANEL_LAYOUT_DEFAULTS[side];
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

export function parseWriterPanelLayout(value: string | null): WriterPanelLayout {
  if (!value) return { ...WRITER_PANEL_LAYOUT_DEFAULTS };
  try {
    const parsed = JSON.parse(value) as Partial<WriterPanelLayout> | null;
    if (!parsed || typeof parsed !== "object") return { ...WRITER_PANEL_LAYOUT_DEFAULTS };
    return {
      left: clampWriterPanelWidth("left", Number(parsed.left)),
      right: clampWriterPanelWidth("right", Number(parsed.right)),
    };
  } catch {
    return { ...WRITER_PANEL_LAYOUT_DEFAULTS };
  }
}

export function writerPanelBounds(
  side: WriterPanelSide,
  containerWidth: number,
  otherWidth: number,
  otherVisible: boolean,
) {
  const limits = WRITER_PANEL_LIMITS[side];
  const reserved = WRITER_EDITOR_MIN_WIDTH + (otherVisible ? otherWidth : 0);
  return {
    min: limits.min,
    max: Math.max(limits.min, Math.min(limits.max, Math.floor(containerWidth - reserved))),
  };
}

export function fitWriterPanelLayout(
  layout: WriterPanelLayout,
  containerWidth: number,
  rightVisible: boolean,
): WriterPanelLayout {
  const left = clampWriterPanelWidth("left", layout.left);
  const right = clampWriterPanelWidth("right", layout.right);
  if (containerWidth < WRITER_PANEL_DESKTOP_MIN_WIDTH) return { left, right };

  if (!rightVisible) {
    const bounds = writerPanelBounds("left", containerWidth, 0, false);
    return { left: Math.min(left, bounds.max), right };
  }

  const leftBounds = writerPanelBounds("left", containerWidth, WRITER_PANEL_LIMITS.right.min, true);
  const fittedLeft = Math.min(left, leftBounds.max);
  const rightBounds = writerPanelBounds("right", containerWidth, fittedLeft, true);
  return { left: fittedLeft, right: Math.min(right, rightBounds.max) };
}
