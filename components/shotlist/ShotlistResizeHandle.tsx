"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export type ShotlistPanelSide = "left" | "right";
export const SHOTLIST_PANEL_DEFAULTS = { left: 260, right: 320 } as const;
export const SHOTLIST_PANEL_LIMITS = { left: { min: 220, max: 360 }, right: { min: 280, max: 440 } } as const;
const MIN_CENTER = 560;

export default function ShotlistResizeHandle({ side, value, otherValue, workspaceRef, onCommit }: {
  side: ShotlistPanelSide;
  value: number;
  otherValue: number;
  workspaceRef: RefObject<HTMLDivElement | null>;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const displayed = draft ?? value;
  useEffect(() => () => document.body.classList.remove("shotlist-panel-resizing"), []);

  function clamp(next: number) {
    const available = (workspaceRef.current?.clientWidth ?? window.innerWidth) - otherValue - MIN_CENTER;
    const limits = SHOTLIST_PANEL_LIMITS[side];
    return Math.max(limits.min, Math.min(Math.min(limits.max, available), Math.round(next)));
  }

  function apply(next: number, commit: boolean) {
    const width = clamp(next);
    workspaceRef.current?.style.setProperty(side === "left" ? "--shotlist-left-width" : "--shotlist-right-width", `${width}px`);
    if (commit) { setDraft(null); onCommit(width); }
    else setDraft(width);
    return width;
  }

  function start(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = displayed;
    const pointerId = event.pointerId;
    let next = startWidth;
    handle.setPointerCapture(pointerId);
    handle.dataset.dragging = "true";
    document.body.classList.add("shotlist-panel-resizing");
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      next = apply(startWidth + (side === "left" ? moveEvent.clientX - startX : startX - moveEvent.clientX), false);
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      delete handle.dataset.dragging;
      document.body.classList.remove("shotlist-panel-resizing");
      apply(finishEvent.type === "pointercancel" ? startWidth : next, finishEvent.type !== "pointercancel");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  const limits = SHOTLIST_PANEL_LIMITS[side];
  const label = side === "left" ? "Ajustar ancho de escenas" : "Ajustar ancho del inspector";
  return <div className={`shotlist-resize-handle is-${side}`} role="separator" aria-label={label} aria-orientation="vertical"
    aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={displayed} tabIndex={0}
    title={`${label}. Doble clic para restablecer.`} onPointerDown={start}
    onDoubleClick={() => apply(SHOTLIST_PANEL_DEFAULTS[side], true)}
    onKeyDown={(event) => {
      const sign = side === "left" ? 1 : -1;
      const next = event.key === "ArrowRight" ? displayed + sign * 16
        : event.key === "ArrowLeft" ? displayed - sign * 16
          : event.key === "Home" ? limits.min : event.key === "End" ? limits.max : null;
      if (next === null) return;
      event.preventDefault();
      apply(next, true);
    }} />;
}
