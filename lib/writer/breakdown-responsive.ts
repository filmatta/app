import type { WriterBreakdownCategory } from "./production";

export const WRITER_BREAKDOWN_CATEGORY_PRIORITY: readonly WriterBreakdownCategory[] = [
  "character",
  "prop",
  "location",
  "wardrobe",
  "vehicle",
  "animal",
  "other",
];

export const WRITER_BREAKDOWN_TAB_WIDTH = 40;
export const WRITER_BREAKDOWN_MORE_WIDTH = 56;
export const WRITER_BREAKDOWN_TAB_GAP = 2;
export const WRITER_BREAKDOWN_TAB_PADDING = 4;

export function writerBreakdownVisibleCategories(containerWidth: number, active: WriterBreakdownCategory) {
  const priority = WRITER_BREAKDOWN_CATEGORY_PRIORITY;
  const allWidth = WRITER_BREAKDOWN_TAB_PADDING
    + priority.length * WRITER_BREAKDOWN_TAB_WIDTH
    + (priority.length - 1) * WRITER_BREAKDOWN_TAB_GAP;
  if (!Number.isFinite(containerWidth) || containerWidth >= allWidth) return [...priority];

  const capacity = Math.max(1, Math.min(
    priority.length - 1,
    Math.floor((containerWidth - WRITER_BREAKDOWN_TAB_PADDING - WRITER_BREAKDOWN_MORE_WIDTH)
      / (WRITER_BREAKDOWN_TAB_WIDTH + WRITER_BREAKDOWN_TAB_GAP)),
  ));
  const preferred = priority.slice(0, capacity);
  if (preferred.includes(active)) return [...preferred];

  const visible = new Set([...preferred.slice(0, Math.max(0, capacity - 1)), active]);
  return priority.filter((category) => visible.has(category));
}
