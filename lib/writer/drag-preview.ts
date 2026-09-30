const PREVIEW_REMOVE_DELAY_MS = 0;

export function setWriterDragPreview(event: DragEvent, source: HTMLElement) {
  if (!event.dataTransfer || typeof document === "undefined") return;
  const bounds = source.getBoundingClientRect();
  const preview = source.cloneNode(true) as HTMLElement;
  preview.classList.add("writer-drag-preview");
  preview.classList.remove("is-drop-before", "is-drop-after", "is-dragging");
  preview.querySelectorAll<HTMLElement>("[role='menu'], input").forEach((element) => element.remove());
  Object.assign(preview.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    width: `${Math.max(160, bounds.width)}px`,
    height: `${bounds.height}px`,
    pointerEvents: "none",
  });
  document.body.append(preview);
  event.dataTransfer.setDragImage(preview, Math.min(32, bounds.width / 2), Math.min(24, bounds.height / 2));
  window.setTimeout(() => preview.remove(), PREVIEW_REMOVE_DELAY_MS);
}
