"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  WRITER_PANEL_LAYOUT_DEFAULTS,
  WRITER_PANEL_LIMITS,
  writerPanelBounds,
  type WriterPanelSide,
} from "@/lib/writer/panel-layout";

const KEYBOARD_STEP = 16;

export default function WriterPanelResizeHandle({
  side,
  value,
  otherValue,
  otherVisible,
  workspaceRef,
  onCommit,
}: {
  side: WriterPanelSide;
  value: number;
  otherValue: number;
  otherVisible: boolean;
  workspaceRef: RefObject<HTMLDivElement | null>;
  onCommit: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState<number | null>(null);
  const displayValue = draftValue ?? value;

  useEffect(() => () => document.body.classList.remove("writer-panel-resizing"), []);

  function bounds() {
    return writerPanelBounds(
      side,
      workspaceRef.current?.clientWidth ?? (typeof window === "undefined" ? 1920 : window.innerWidth),
      otherValue,
      otherVisible,
    );
  }

  function apply(next: number, commit: boolean) {
    const limits = bounds();
    const clamped = Math.min(limits.max, Math.max(limits.min, Math.round(next)));
    workspaceRef.current?.style.setProperty(
      side === "left" ? "--writer-left-panel-width" : "--writer-right-panel-width",
      `${clamped}px`,
    );
    if (commit) {
      setDraftValue(null);
      onCommit(clamped);
    } else {
      setDraftValue(clamped);
    }
    return clamped;
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = displayValue;
    let draft = startWidth;
    handle.setPointerCapture(pointerId);
    handle.dataset.dragging = "true";
    document.body.classList.add("writer-panel-resizing");

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const delta = moveEvent.clientX - startX;
      draft = apply(startWidth + (side === "left" ? delta : -delta), false);
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      delete handle.dataset.dragging;
      document.body.classList.remove("writer-panel-resizing");
      apply(draft, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  const limits = WRITER_PANEL_LIMITS[side];
  const label = side === "left" ? "Cambiar ancho del panel de escenas" : "Cambiar ancho del panel de observaciones";

  return (
    <div
      className={`writer-panel-resize-handle writer-panel-resize-handle--${side}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={displayValue}
      tabIndex={0}
      title={`${label}. Doble clic para restablecer.`}
      onPointerDown={startResize}
      onDoubleClick={() => apply(WRITER_PANEL_LAYOUT_DEFAULTS[side], true)}
      onKeyDown={(event) => {
        let next: number | null = null;
        if (event.key === "Home") next = limits.min;
        if (event.key === "End") next = limits.max;
        if (event.key === "ArrowLeft") next = displayValue + (side === "left" ? -KEYBOARD_STEP : KEYBOARD_STEP);
        if (event.key === "ArrowRight") next = displayValue + (side === "left" ? KEYBOARD_STEP : -KEYBOARD_STEP);
        if (next === null) return;
        event.preventDefault();
        apply(next, true);
      }}
    />
  );
}
