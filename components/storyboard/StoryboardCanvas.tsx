"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { Arrow, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { StoryboardDocument, StoryboardObject } from "@/lib/storyboard/types";

export type StoryboardTool = "select" | "hand" | "brush" | "eraser" | "line" | "arrow" | "rectangle" | "ellipse" | "text" | "reference";

export type StoryboardCanvasHandle = {
  fit: () => void;
  zoomBy: (factor: number) => void;
  exportBlob: () => Promise<Blob>;
  assetsReady: () => boolean;
};

export type StoryboardCanvasProps = {
  document: StoryboardDocument;
  tool: StoryboardTool;
  color: string;
  brushWidth: number;
  selectedId: string | null;
  readOnly?: boolean;
  canvasRef?: Ref<StoryboardCanvasHandle>;
  onSelect: (id: string | null) => void;
  onCommit: (document: StoryboardDocument, label: string) => void;
  onViewportChange?: (zoom: number) => void;
};

type Viewport = { x: number; y: number; scale: number };
type Gesture = { distance: number; center: { x: number; y: number }; viewport: Viewport };

export default function StoryboardCanvas({
  document,
  tool,
  color,
  brushWidth,
  selectedId,
  readOnly = false,
  canvasRef,
  onSelect,
  onCommit,
  onViewportChange,
}: StoryboardCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const contentRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const [size, setSize] = useState({ width: 960, height: 540 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [draft, setDraft] = useState<StoryboardObject | null>(null);
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; value: string } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const panOrigin = useRef<{ x: number; y: number; viewport: Viewport } | null>(null);
  const referenceImage = usePrivateImage(document.reference?.assetId ?? null);

  const fitViewport = useMemo(() => {
    const padding = size.width < 640 ? 18 : 42;
    const scale = Math.min((size.width - padding * 2) / document.frame.width, (size.height - padding * 2) / document.frame.height);
    return {
      scale: Math.max(.05, scale),
      x: (size.width - document.frame.width * scale) / 2,
      y: (size.height - document.frame.height * scale) / 2,
    };
  }, [document.frame.height, document.frame.width, size.height, size.width]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: Math.max(280, Math.floor(entry.contentRect.width)), height: Math.max(320, Math.floor(entry.contentRect.height)) });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setViewport(fitViewport);
      onViewportChange?.(fitViewport.scale);
    });
    return () => cancelAnimationFrame(frame);
  }, [document.frame.height, document.frame.width, fitViewport, onViewportChange]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const node = selectedId ? stage.findOne(`#${selectedId}`) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, document.objects]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isEditableTarget(event.target)) { setSpaceDown(true); event.preventDefault(); }
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceDown(false); };
    const blur = () => { setSpaceDown(false); activePointers.current.clear(); gesture.current = null; panOrigin.current = null; setDraft(null); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);

  useImperativeHandle(canvasRef, () => ({
    fit() { setViewport(fitViewport); onViewportChange?.(fitViewport.scale); },
    zoomBy(factor) { setViewport((current) => zoomAt(current, factor, { x: size.width / 2, y: size.height / 2 })); },
    assetsReady() { return !document.reference || referenceImage.status === "ready"; },
    async exportBlob() {
      if (document.reference && referenceImage.status !== "ready") throw new Error("La referencia privada aún no está lista para exportar.");
      if (globalThis.document?.fonts) await globalThis.document.fonts.ready;
      const stage = stageRef.current;
      const group = contentRef.current;
      if (!stage || !group) throw new Error("El canvas no está listo.");
      const previousStage = { width: stage.width(), height: stage.height() };
      const previousGroup = { x: group.x(), y: group.y(), scaleX: group.scaleX(), scaleY: group.scaleY() };
      transformerRef.current?.visible(false);
      stage.size({ width: document.frame.width, height: document.frame.height });
      group.position({ x: 0, y: 0 });
      group.scale({ x: 1, y: 1 });
      stage.draw();
      try {
        const canvas = stage.toCanvas({ x: 0, y: 0, width: document.frame.width, height: document.frame.height, pixelRatio: 1 });
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo generar el PNG.")), "image/png"));
      } finally {
        stage.size(previousStage);
        group.position({ x: previousGroup.x, y: previousGroup.y });
        group.scale({ x: previousGroup.scaleX, y: previousGroup.scaleY });
        transformerRef.current?.visible(true);
        stage.draw();
      }
    },
  }), [document.frame.height, document.frame.width, document.reference, fitViewport, onViewportChange, referenceImage.status, size.height, size.width]);

  function logicalPointer() {
    const point = stageRef.current?.getPointerPosition();
    if (!point) return null;
    return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
  }

  function handlePointerDown(event: KonvaEventObject<PointerEvent>) {
    if (readOnly) return;
    hostRef.current?.focus();
    const native = event.evt;
    activePointers.current.set(native.pointerId ?? 1, { x: native.clientX, y: native.clientY });
    if (activePointers.current.size >= 2) {
      setDraft(null);
      panOrigin.current = null;
      const pair = [...activePointers.current.values()].slice(0, 2);
      gesture.current = { distance: distance(pair[0]!, pair[1]!), center: center(pair[0]!, pair[1]!), viewport };
      return;
    }
    const point = logicalPointer();
    if (!point || !insideFrame(point, document)) return;
    if (tool === "hand" || spaceDown || native.button === 1) {
      panOrigin.current = { x: native.clientX, y: native.clientY, viewport };
      return;
    }
    const targetId = (event.target as Konva.Node).getAttr("dataObjectId") as string | undefined;
    if (tool === "eraser") {
      if (targetId) onCommit({ ...document, objects: document.objects.filter((object) => object.id !== targetId) }, "Borrar objeto");
      return;
    }
    if (tool === "select") { onSelect(targetId ?? null); return; }
    if (tool === "reference") { onSelect(null); return; }
    if (tool === "text") { setTextEditor({ x: point.x, y: point.y, value: "" }); return; }
    const id = crypto.randomUUID();
    const base = { id, color, opacity: 1, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    if (tool === "brush") setDraft({ ...base, type: "stroke", width: brushWidth, points: [point, point] });
    else if (tool === "line" || tool === "arrow") setDraft({ ...base, type: tool, width: brushWidth, points: [point.x, point.y, point.x, point.y] });
    else if (tool === "rectangle" || tool === "ellipse") setDraft({ ...base, type: tool, width: 1, height: 1, strokeWidth: brushWidth, fill: null, x: point.x, y: point.y });
  }

  function handlePointerMove(event: KonvaEventObject<PointerEvent>) {
    const native = event.evt;
    if (activePointers.current.has(native.pointerId ?? 1)) activePointers.current.set(native.pointerId ?? 1, { x: native.clientX, y: native.clientY });
    if (activePointers.current.size >= 2 && gesture.current) {
      const pair = [...activePointers.current.values()].slice(0, 2);
      const nextDistance = distance(pair[0]!, pair[1]!);
      const nextCenter = center(pair[0]!, pair[1]!);
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return;
      const start = gesture.current;
      const factor = Math.max(.25, Math.min(4, nextDistance / Math.max(1, start.distance)));
      const scale = clampScale(start.viewport.scale * factor, fitViewport.scale);
      setViewport({ x: start.viewport.x + nextCenter.x - start.center.x, y: start.viewport.y + nextCenter.y - start.center.y, scale });
      onViewportChange?.(scale);
      return;
    }
    if (panOrigin.current) {
      const origin = panOrigin.current;
      setViewport({ ...origin.viewport, x: origin.viewport.x + native.clientX - origin.x, y: origin.viewport.y + native.clientY - origin.y });
      return;
    }
    if (!draft) return;
    const point = logicalPointer();
    if (!point) return;
    if (draft.type === "stroke") setDraft({ ...draft, points: [...draft.points, { x: point.x, y: point.y, ...(native.pressure > 0 && native.pressure < 1 ? { pressure: native.pressure } : {}) }] });
    else if (draft.type === "line" || draft.type === "arrow") setDraft({ ...draft, points: [draft.points[0], draft.points[1], point.x, point.y] });
    else if (draft.type === "rectangle" || draft.type === "ellipse") setDraft({ ...draft, width: point.x - draft.x, height: point.y - draft.y });
  }

  function handlePointerUp(event: KonvaEventObject<PointerEvent>) {
    activePointers.current.delete(event.evt.pointerId ?? 1);
    if (activePointers.current.size < 2) gesture.current = null;
    panOrigin.current = null;
    if (!draft) return;
    const valid = draft.type === "stroke" ? draft.points.length > 1
      : draft.type === "line" || draft.type === "arrow" ? Math.hypot(draft.points[2] - draft.points[0], draft.points[3] - draft.points[1]) > 2
        : draft.type === "rectangle" || draft.type === "ellipse" ? Math.abs(draft.width) > 2 && Math.abs(draft.height) > 2
          : false;
    if (valid) onCommit({ ...document, objects: [...document.objects, normalizeDraft(draft)] }, tool === "brush" ? "Trazo" : "Crear objeto");
    setDraft(null);
  }

  function cancelPointer(event: KonvaEventObject<PointerEvent>) {
    activePointers.current.delete(event.evt.pointerId ?? 1);
    gesture.current = null; panOrigin.current = null; setDraft(null);
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const point = stageRef.current?.getPointerPosition();
    if (!point) return;
    const factor = event.evt.deltaY > 0 ? .9 : 1.1;
    setViewport((current) => {
      const next = zoomAt(current, factor, point, fitViewport.scale);
      onViewportChange?.(next.scale);
      return next;
    });
  }

  function updateObject(object: StoryboardObject) {
    onCommit({ ...document, objects: document.objects.map((candidate) => candidate.id === object.id ? object : candidate) }, "Mover o transformar objeto");
  }

  function commitText() {
    if (!textEditor?.value.trim()) { setTextEditor(null); return; }
    const text: StoryboardObject = {
      id: crypto.randomUUID(), type: "text", text: textEditor.value.trim(), color, opacity: 1,
      x: textEditor.x, y: textEditor.y, width: Math.min(600, document.frame.width - textEditor.x),
      fontSize: Math.max(20, brushWidth * 4), fontFamily: "Arial", align: "left", rotation: 0, scaleX: 1, scaleY: 1,
    };
    onCommit({ ...document, objects: [...document.objects, text] }, "Añadir texto");
    setTextEditor(null);
  }

  const editorStyle = textEditor ? {
    left: viewport.x + textEditor.x * viewport.scale,
    top: viewport.y + textEditor.y * viewport.scale,
    width: Math.min(420, Math.max(160, size.width - (viewport.x + textEditor.x * viewport.scale) - 16)),
    fontSize: Math.max(14, 28 * viewport.scale),
  } : undefined;

  return <div ref={hostRef} className="storyboard-canvas-host" tabIndex={0} role="img" aria-label="Canvas editable de storyboard. Usa la barra de herramientas para dibujar, borrar, crear formas, mover y anotar." onContextMenu={(event) => event.preventDefault()}>
    <Stage ref={stageRef} width={size.width} height={size.height} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={cancelPointer} onPointerLeave={(event) => { if (activePointers.current.size && event.evt.pointerType === "mouse") handlePointerUp(event); }} onWheel={handleWheel}>
      <Layer>
        <Group ref={contentRef} x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale} clipX={0} clipY={0} clipWidth={document.frame.width} clipHeight={document.frame.height}>
          <Rect width={document.frame.width} height={document.frame.height} fill="#f2f0ea" listening={false} />
          {document.reference && referenceImage.image && <KonvaImage image={referenceImage.image} x={document.reference.x} y={document.reference.y} width={document.reference.width} height={document.reference.height} rotation={document.reference.rotation} opacity={document.reference.opacity} draggable={!readOnly && tool === "reference"} onDragEnd={(event) => onCommit({ ...document, reference: { ...document.reference!, x: event.target.x(), y: event.target.y() } }, "Reencuadrar referencia")} />}
          {document.objects.map((object) => <CanvasObject key={object.id} object={object} selected={selectedId === object.id} selectable={!readOnly && tool === "select"} onSelect={() => onSelect(object.id)} onChange={updateObject} />)}
          {draft && <CanvasObject object={normalizeDraft(draft)} selected={false} selectable={false} onSelect={() => undefined} onChange={() => undefined} />}
          <Transformer ref={transformerRef} rotateEnabled enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} borderStroke="#e63b46" anchorFill="#f2f0ea" anchorStroke="#e63b46" anchorSize={10 / viewport.scale} />
        </Group>
      </Layer>
    </Stage>
    {textEditor && <textarea autoFocus className="storyboard-text-editor" style={editorStyle} value={textEditor.value} maxLength={1000} placeholder="Escribe una anotación…" onChange={(event) => setTextEditor({ ...textEditor, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setTextEditor(null); } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); commitText(); } }} onBlur={commitText} />}
    {document.reference && referenceImage.status === "loading" && <span className="storyboard-asset-status">Cargando referencia privada…</span>}
    {document.reference && referenceImage.status === "error" && <span className="storyboard-asset-status storyboard-asset-error">No se pudo cargar la referencia.</span>}
  </div>;
}

function CanvasObject({ object, selected, selectable, onSelect, onChange }: { object: StoryboardObject; selected: boolean; selectable: boolean; onSelect: () => void; onChange: (object: StoryboardObject) => void }) {
  const common = {
    id: object.id,
    name: "storyboard-object",
    "dataObjectId": object.id,
    x: object.x,
    y: object.y,
    rotation: object.rotation,
    scaleX: object.scaleX,
    scaleY: object.scaleY,
    opacity: object.opacity,
    draggable: selectable,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (event: KonvaEventObject<DragEvent>) => onChange({ ...object, x: event.target.x(), y: event.target.y() }),
    onTransformEnd: (event: KonvaEventObject<Event>) => onChange({ ...object, x: event.target.x(), y: event.target.y(), rotation: event.target.rotation(), scaleX: event.target.scaleX(), scaleY: event.target.scaleY() }),
    shadowColor: selected ? "#e63b46" : undefined,
    shadowBlur: selected ? 5 : 0,
  };
  if (object.type === "stroke") return <Line {...common} points={object.points.flatMap((point) => [point.x, point.y])} stroke={object.color} strokeWidth={object.width} lineCap="round" lineJoin="round" tension={.15} />;
  if (object.type === "line") return <Line {...common} points={object.points} stroke={object.color} strokeWidth={object.width} lineCap="round" />;
  if (object.type === "arrow") return <Arrow {...common} points={object.points} stroke={object.color} fill={object.color} strokeWidth={object.width} pointerLength={Math.max(12, object.width * 3)} pointerWidth={Math.max(10, object.width * 2.5)} />;
  if (object.type === "rectangle") return <Rect {...common} width={object.width} height={object.height} stroke={object.color} strokeWidth={object.strokeWidth} fill={object.fill ?? undefined} />;
  if (object.type === "ellipse") return <Ellipse {...common} radiusX={Math.abs(object.width) / 2} radiusY={Math.abs(object.height) / 2} offsetX={-object.width / 2} offsetY={-object.height / 2} stroke={object.color} strokeWidth={object.strokeWidth} fill={object.fill ?? undefined} />;
  if (object.type === "text") return <Text {...common} text={object.text} width={object.width} fontSize={object.fontSize} fontFamily={object.fontFamily} align={object.align} fill={object.color} lineHeight={1.25} />;
  return null;
}

function normalizeDraft(object: StoryboardObject): StoryboardObject {
  if (object.type !== "rectangle" && object.type !== "ellipse") return object;
  return { ...object, x: object.width < 0 ? object.x + object.width : object.x, y: object.height < 0 ? object.y + object.height : object.y, width: Math.abs(object.width), height: Math.abs(object.height) };
}

function usePrivateImage(assetId: string | null) {
  const [state, setState] = useState<{ assetId: string | null; image: HTMLImageElement | null; status: "ready" | "error" }>({ assetId: null, image: null, status: "error" });
  useEffect(() => {
    if (!assetId) return;
    const controller = new AbortController();
    let objectUrl = "";
    void fetch(`/api/writer/production-assets/${assetId}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("asset"); return response.blob(); })
      .then((blob) => new Promise<HTMLImageElement>((resolve, reject) => {
        objectUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = objectUrl;
      }))
      .then((image) => setState({ assetId, image, status: "ready" }))
      .catch((error) => { if (error?.name !== "AbortError") setState({ assetId, image: null, status: "error" }); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId]);
  if (state.assetId === assetId) return state;
  return { assetId, image: null, status: assetId ? "loading" as const : "idle" as const };
}

function insideFrame(point: { x: number; y: number }, document: StoryboardDocument) {
  return point.x >= 0 && point.y >= 0 && point.x <= document.frame.width && point.y <= document.frame.height;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) { return Math.hypot(a.x - b.x, a.y - b.y); }
function center(a: { x: number; y: number }, b: { x: number; y: number }) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function clampScale(scale: number, fit = 1) { return Math.max(fit * .5, Math.min(fit * 12, scale)); }
function zoomAt(viewport: Viewport, factor: number, point: { x: number; y: number }, fit = 1): Viewport {
  const scale = clampScale(viewport.scale * factor, fit);
  const logical = { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
  return { scale, x: point.x - logical.x * scale, y: point.y - logical.y * scale };
}
function isEditableTarget(target: EventTarget | null) { return target instanceof HTMLElement && Boolean(target.closest("input,textarea,select,[contenteditable=true]")); }
