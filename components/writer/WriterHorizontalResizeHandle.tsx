"use client";

import { useEffect, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  WRITER_HORIZONTAL_PANEL_LIMITS,
  WRITER_WORKSPACE_LAYOUT_DEFAULTS,
  clampWriterHorizontalPanelHeight,
  type WriterHorizontalPanel,
} from "@/lib/writer/workspace-layout";

const KEYBOARD_STEP = 16;

export default function WriterHorizontalResizeHandle({
  panel,
  value,
  workspaceRef,
  onCommit,
}: {
  panel: WriterHorizontalPanel;
  value: number;
  workspaceRef: RefObject<HTMLDivElement | null>;
  onCommit: (value: number) => void;
}) {
  const property = panel === "timeline" ? "--writer-timeline-panel-height" : "--writer-character-panel-height";
  const defaults = panel === "timeline" ? WRITER_WORKSPACE_LAYOUT_DEFAULTS.timelineHeight : WRITER_WORKSPACE_LAYOUT_DEFAULTS.charactersHeight;
  const label = panel === "timeline" ? "Cambiar altura de Timeline y Narrative Pulse" : "Cambiar altura del panel de personajes";

  useEffect(() => () => document.body.classList.remove("writer-horizontal-panel-resizing"), []);

  function availableMax() {
    const rootHeight = workspaceRef.current?.clientHeight ?? window.innerHeight;
    const ratio = panel === "timeline" ? 0.68 : 0.58;
    return Math.min(WRITER_HORIZONTAL_PANEL_LIMITS[panel].max, Math.floor(rootHeight * ratio));
  }

  function apply(next: number, commit: boolean) {
    const bounded = Math.min(availableMax(), clampWriterHorizontalPanelHeight(panel, next));
    workspaceRef.current?.style.setProperty(property, `${bounded}px`);
    if (commit) onCommit(bounded);
    return bounded;
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = value;
    let draft = startHeight;
    handle.setPointerCapture(pointerId);
    handle.dataset.dragging = "true";
    document.body.classList.add("writer-horizontal-panel-resizing");

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      draft = apply(startHeight - (moveEvent.clientY - startY), false);
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      delete handle.dataset.dragging;
      document.body.classList.remove("writer-horizontal-panel-resizing");
      apply(draft, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  return (
    <div
      className={`writer-horizontal-resize-handle writer-horizontal-resize-handle--${panel}`}
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={WRITER_HORIZONTAL_PANEL_LIMITS[panel].min}
      aria-valuemax={WRITER_HORIZONTAL_PANEL_LIMITS[panel].max}
      aria-valuenow={value}
      tabIndex={0}
      title={`${label}. Doble clic para restablecer.`}
      onPointerDown={startResize}
      onDoubleClick={() => apply(defaults, true)}
      onKeyDown={(event) => {
        let next: number | null = null;
        if (event.key === "Home") next = WRITER_HORIZONTAL_PANEL_LIMITS[panel].min;
        if (event.key === "End") next = availableMax();
        if (event.key === "ArrowUp") next = value + KEYBOARD_STEP;
        if (event.key === "ArrowDown") next = value - KEYBOARD_STEP;
        if (next === null) return;
        event.preventDefault();
        apply(next, true);
      }}
    />
  );
}
