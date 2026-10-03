"use client";

/* eslint-disable @next/next/no-img-element -- private authenticated previews are not public optimizer inputs */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { storyboardContentKind } from "@/lib/storyboard/document";
import { StoryboardSaveCoordinator, type StoryboardSaveState } from "@/lib/storyboard/save-queue";
import {
  deleteLocalStoryboardDraft,
  loadLocalStoryboardDraft,
  saveLocalStoryboardDraft,
  storyboardDraftKey,
} from "@/lib/storyboard/storage";
import type { StoryboardBoard, StoryboardDocument, StoryboardGroup, StoryboardShot } from "@/lib/storyboard/types";
import { startWriterTabLease, type WriterTabLease } from "@/lib/writer/tab-lease";
import SketcherCanvasLoader from "./SketcherCanvasLoader";
import type { StoryboardCanvasHandle, StoryboardTool } from "./StoryboardCanvas";
import styles from "./storyboard.module.css";

type SketcherState = { board: StoryboardBoard; group: StoryboardGroup; shot: StoryboardShot };
type SaveSnapshot = { document: StoryboardDocument; visualNote: string | null };
type ConflictState = { message: string; remoteRevisionId: string };

const TOOLS: Array<{ id: StoryboardTool; label: string; shortcut?: string }> = [
  { id: "select", label: "Seleccionar", shortcut: "V" }, { id: "hand", label: "Mano", shortcut: "H" },
  { id: "brush", label: "Pincel", shortcut: "B" }, { id: "eraser", label: "Borrar objeto", shortcut: "E" },
  { id: "line", label: "Línea", shortcut: "L" }, { id: "arrow", label: "Flecha", shortcut: "A" },
  { id: "rectangle", label: "Rectángulo", shortcut: "R" }, { id: "ellipse", label: "Elipse", shortcut: "O" },
  { id: "text", label: "Texto", shortcut: "T" }, { id: "reference", label: "Encuadrar referencia" },
];

export default function StoryboardSketcher({ initialState, initialPanelId, userId }: { initialState: SketcherState; initialPanelId: string; userId: string }) {
  const router = useRouter();
  const state = initialState;
  const panel = state.shot.panels.find((candidate) => candidate.id === initialPanelId) ?? state.shot.panels[0]!;
  const initialDocument = panel.currentRevision.document!;
  const [drawing, setDrawing] = useState<StoryboardDocument>(initialDocument);
  const [visualNote, setVisualNote] = useState(panel.currentRevision.visualNote ?? "");
  const [tool, setTool] = useState<StoryboardTool>("brush");
  const [color, setColor] = useState("#202020");
  const [brushWidth, setBrushWidth] = useState(8);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<StoryboardSaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [thumbnailRevision, setThumbnailRevision] = useState<string | null>(null);
  const [approvedRevisionId, setApprovedRevisionId] = useState(panel.approvedRevisionId);
  const [headRevisionId, setHeadRevisionId] = useState(panel.currentRevisionId);
  const [acknowledgedContextHash, setAcknowledgedContextHash] = useState(panel.acknowledgedContextHash);
  const [tabBlocked, setTabBlocked] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [zoom, setZoom] = useState(1);
  const [briefOpen, setBriefOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [panelsOpen, setPanelsOpen] = useState(true);
  const [frameChoice, setFrameChoice] = useState<{ width: number; height: number; label: string } | null>(null);
  const canvasRef = useRef<StoryboardCanvasHandle | null>(null);
  const queueRef = useRef<StoryboardSaveCoordinator<SaveSnapshot> | null>(null);
  const leaseRef = useRef<WriterTabLease | null>(null);
  const undoRef = useRef<StoryboardDocument[]>([]);
  const redoRef = useRef<StoryboardDocument[]>([]);
  const [, setHistoryTick] = useState(0);
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const flatShots = state.board.groups.flatMap((group) => group.shots);
  const shotIndex = flatShots.findIndex((candidate) => candidate.id === state.shot.id);
  const label = panelLabel(state.board, state.shot.id, panel.id);
  const stale = panel.currentRevision.sourceContextHash !== state.shot.contextHash && acknowledgedContextHash !== state.shot.contextHash;
  const isApproved = approvedRevisionId === headRevisionId && storyboardContentKind(drawing) !== "empty";

  useEffect(() => {
    const tablet = window.matchMedia("(max-width: 1050px)");
    const mobile = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      if (tablet.matches) setPropertiesOpen(false);
      if (mobile.matches) setBriefOpen(false);
    };
    const frame = requestAnimationFrame(sync);
    tablet.addEventListener("change", sync);
    mobile.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      tablet.removeEventListener("change", sync);
      mobile.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const queue = new StoryboardSaveCoordinator<SaveSnapshot>(panel.currentRevisionId, async ({ value, expectedRevisionId, operationId, sequence }) => {
      const response = await fetch(`/api/shotlists/${state.board.shotlist.id}/storyboard/panels/${panel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Storyboard-Sequence": String(sequence) },
        body: JSON.stringify({ expectedRevisionId, operationId, document: value.document, visualNote: value.visualNote }),
      });
      const data = await response.json();
      if (!response.ok) {
        const failure = new Error(data.error ?? "No pudimos guardar el panel.") as Error & { code?: string };
        failure.code = data.code;
        throw failure;
      }
      return { revisionId: data.revisionId, revisionNumber: data.revisionNumber, noOp: data.noOp };
    }, (nextState, result, cause) => {
      setSaveState(nextState);
      if (nextState === "saved" && result) {
        setError(null);
        setHeadRevisionId(result.revisionId);
        if (!result.noOp) {
          setApprovedRevisionId(null);
          setThumbnailRevision(result.revisionId);
        }
        void deleteLocalStoryboardDraft(location.origin, userId, panel.id).catch(() => undefined);
      } else if (nextState === "error") {
        const saveError = cause as Error & { code?: string };
        setError(saveError?.message ?? "No pudimos guardar el panel.");
        if (saveError?.code === "conflict") setConflict({ message: saveError.message, remoteRevisionId: queue.revisionId });
      }
    });
    queueRef.current = queue;
    return () => { void queue.flush().catch(() => undefined); queueRef.current = null; };
  // The component is remounted by navigation for a different panel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id]);

  useEffect(() => {
    const lease = startWriterTabLease({ userId, scriptId: panel.id, sessionId, onBlocked: setTabBlocked });
    leaseRef.current = lease;
    return () => { lease.release(); leaseRef.current = null; };
  }, [panel.id, sessionId, userId]);

  useEffect(() => {
    void loadLocalStoryboardDraft(location.origin, userId, panel.id).then((draft) => {
      if (!draft || JSON.stringify(draft.document) === JSON.stringify(initialDocument)) return;
      if (draft.baseRevisionId === panel.currentRevisionId) {
        if (window.confirm("Encontramos un borrador local pendiente de este panel. ¿Recuperarlo?")) {
          undoRef.current.push(initialDocument);
          setDrawing(draft.document);
          setVisualNote(draft.visualNote ?? "");
          queueRef.current?.enqueue({ document: draft.document, visualNote: draft.visualNote });
          setHistoryTick((value) => value + 1);
        }
      } else {
        setConflict({ message: "Hay un borrador local creado desde otra revisión. Se conserva hasta que decidas qué hacer.", remoteRevisionId: panel.currentRevisionId });
      }
    }).catch(() => undefined);
  }, [initialDocument, panel.currentRevisionId, panel.id, userId]);

  useEffect(() => {
    if (!thumbnailRevision || saveState !== "saved") return;
    const timer = window.setTimeout(async () => {
      if (queueRef.current?.revisionId !== thumbnailRevision || queueRef.current.hasPending) return;
      try {
        const blob = await canvasRef.current?.exportBlob();
        if (!blob) return;
        const form = new FormData();
        form.set("file", new File([blob], "thumbnail.png", { type: "image/png" }));
        form.set("revisionId", thumbnailRevision);
        form.set("operationId", crypto.randomUUID());
        const response = await fetch(`/api/shotlists/${state.board.shotlist.id}/storyboard/panels/${panel.id}/render`, { method: "POST", body: form });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "Miniatura fallida."); }
        setThumbnailError(null);
        setThumbnailRevision(null);
      } catch (cause) {
        setThumbnailError(cause instanceof Error ? cause.message : "El dibujo está guardado; la miniatura falló.");
      }
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [panel.id, saveState, state.board.shotlist.id, thumbnailRevision]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (isEditingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if ((event.metaKey || event.ctrlKey) && key === "y") { event.preventDefault(); redo(); return; }
      if ((event.metaKey || event.ctrlKey) && key === "s") { event.preventDefault(); void flush(); return; }
      const toolMatch = TOOLS.find((item) => item.shortcut?.toLowerCase() === key);
      if (toolMatch) { event.preventDefault(); setTool(toolMatch.id); }
      if (key === "0") { event.preventDefault(); canvasRef.current?.fit(); }
      if ((key === "delete" || key === "backspace") && selectedId) {
        event.preventDefault(); commitDocument({ ...drawing, objects: drawing.objects.filter((object) => object.id !== selectedId) }, "Eliminar objeto"); setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  function persistDraft(next: StoryboardDocument, note = visualNote.trim() || null, sequence = Date.now()) {
    void saveLocalStoryboardDraft({
      key: storyboardDraftKey(location.origin, userId, panel.id), origin: location.origin, userId,
      shotlistId: state.board.shotlist.id, panelId: panel.id, sessionId,
      baseRevisionId: queueRef.current?.revisionId ?? panel.currentRevisionId,
      document: next, visualNote: note, sequence, updatedAt: Date.now(),
    }).catch(() => undefined);
  }

  function scheduleSave(next: StoryboardDocument, note = visualNote.trim() || null) {
    const sequence = queueRef.current?.enqueue({ document: next, visualNote: note }) ?? Date.now();
    persistDraft(next, note, sequence);
  }

  function commitDocument(next: StoryboardDocument, label: string) {
    void label;
    undoRef.current = [...undoRef.current.slice(-59), drawing];
    redoRef.current = [];
    setDrawing(next);
    setApprovedRevisionId(null);
    setHistoryTick((value) => value + 1);
    scheduleSave(next);
  }

  function undo() {
    const previous = undoRef.current.at(-1);
    if (!previous) return;
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current.slice(-59), drawing];
    setDrawing(previous); setSelectedId(null); setHistoryTick((value) => value + 1); scheduleSave(previous);
  }

  function redo() {
    const next = redoRef.current.at(-1);
    if (!next) return;
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current.slice(-59), drawing];
    setDrawing(next); setSelectedId(null); setHistoryTick((value) => value + 1); scheduleSave(next);
  }

  async function flush() {
    try { await queueRef.current?.flush(); return true; }
    catch { return false; }
  }

  async function navigateSafely(path: string) {
    const saved = await flush();
    if (!saved && !window.confirm("No pudimos guardar. El borrador local está protegido. ¿Salir de todos modos?")) return;
    router.push(path);
  }

  async function approve() {
    if (storyboardContentKind(drawing) === "empty") return setError("Un panel vacío no se puede aprobar.");
    if (!await flush()) return;
    const revisionId = queueRef.current?.revisionId;
    if (!revisionId) return;
    const response = await fetch(`/api/shotlists/${state.board.shotlist.id}/storyboard/panels/${panel.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revisionId }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "No pudimos aprobar el panel.");
    setApprovedRevisionId(revisionId); setError(null);
  }

  async function acknowledge() {
    if (!await flush()) return;
    const revisionId = queueRef.current?.revisionId;
    if (!revisionId) return;
    const response = await fetch(`/api/shotlists/${state.board.shotlist.id}/storyboard/panels/${panel.id}/acknowledge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revisionId }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "No pudimos reconocer el cambio.");
    setAcknowledgedContextHash(state.shot.contextHash); setError(null);
  }

  async function createPanel() {
    if (!await flush()) return;
    const response = await fetch(`/api/shotlists/${state.board.shotlist.id}/storyboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shotId: state.shot.id, operationId: crypto.randomUUID() }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "No pudimos crear el panel.");
    router.push(`/shotlists/${state.board.shotlist.id}/storyboard/shots/${state.shot.id}?panel=${data.panelId}`);
  }

  async function duplicatePanel() {
    if (!await flush()) return;
    const response = await fetch(`/api/shotlists/${state.board.shotlist.id}/storyboard/panels/${panel.id}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationId: crypto.randomUUID() }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "No pudimos duplicar el panel.");
    router.push(`/shotlists/${state.board.shotlist.id}/storyboard/shots/${state.shot.id}?panel=${data.panelId}`);
  }

  async function deletePanel() {
    if (!window.confirm("Eliminar este panel y sus revisiones? El plano continuará en la Shotlist.")) return;
    const response = await fetch(`/api/shotlists/${state.board.shotlist.id}/storyboard/panels/${panel.id}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json(); return setError(data.error ?? "No pudimos eliminar el panel."); }
    const next = state.shot.panels.find((candidate) => candidate.id !== panel.id);
    router.push(next ? `/shotlists/${state.board.shotlist.id}/storyboard/shots/${state.shot.id}?panel=${next.id}` : `/shotlists/${state.board.shotlist.id}/storyboard`);
  }

  async function addReference(form: FormData) {
    setError(null);
    const response = await fetch(`/api/shotlists/${state.board.shotlist.id}/storyboard/panels/${panel.id}/reference`, { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "No pudimos preparar la referencia.");
    const scale = Math.min(drawing.frame.width / data.width, drawing.frame.height / data.height);
    const width = data.width * scale; const height = data.height * scale;
    commitDocument({ ...drawing, reference: { assetId: data.assetId, x: (drawing.frame.width - width) / 2, y: (drawing.frame.height - height) / 2, width, height, rotation: 0, opacity: 1 } }, "Añadir referencia");
    setTool("reference");
  }

  async function exportPng() {
    if (!await flush()) return;
    try {
      const blob = await canvasRef.current?.exportBlob();
      if (!blob) throw new Error("El canvas no está listo.");
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url; link.download = `${safeFilename(state.board.shotlist.title)}-${label}.png`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos exportar el PNG."); }
  }

  function requestFrame(value: string) {
    const presets: Record<string, { width: number; height: number; label: string }> = {
      "16:9": { width: 1600, height: 900, label: "16:9" }, "1.85": { width: 1665, height: 900, label: "1.85:1" },
      "2.39": { width: 2151, height: 900, label: "2.39:1" }, "4:3": { width: 1200, height: 900, label: "4:3" },
    };
    if (value === "custom") {
      const raw = window.prompt("Dimensiones lógicas (ancho×alto), entre 240 y 8192", `${drawing.frame.width}×${drawing.frame.height}`);
      const match = raw?.match(/^\s*(\d+)\s*[x×]\s*(\d+)\s*$/iu);
      if (!match) return;
      const width = Number(match[1]); const height = Number(match[2]);
      if (width < 240 || height < 240 || width > 8192 || height > 8192) return setError("Las dimensiones deben estar entre 240 y 8192.");
      setFrameChoice({ width, height, label: "Personalizado" });
    } else setFrameChoice(presets[value] ?? null);
  }

  function applyFrame(mode: "fit" | "keep") {
    if (!frameChoice) return;
    if (mode === "keep") commitDocument({ ...drawing, frame: { width: frameChoice.width, height: frameChoice.height } }, "Cambiar encuadre");
    else {
      const factor = Math.min(frameChoice.width / drawing.frame.width, frameChoice.height / drawing.frame.height);
      const scaledObjects = drawing.objects.map((object) => ({ ...object, x: object.x * factor, y: object.y * factor, scaleX: object.scaleX * factor, scaleY: object.scaleY * factor }));
      const reference = drawing.reference ? { ...drawing.reference, x: drawing.reference.x * factor, y: drawing.reference.y * factor, width: drawing.reference.width * factor, height: drawing.reference.height * factor } : null;
      commitDocument({ ...drawing, frame: { width: frameChoice.width, height: frameChoice.height }, objects: scaledObjects, reference }, "Ajustar contenido al encuadre");
    }
    setFrameChoice(null);
  }

  function navigateShot(direction: -1 | 1) {
    const target = flatShots[shotIndex + direction];
    if (!target) return;
    if (target.panels[0]) void navigateSafely(`/shotlists/${state.board.shotlist.id}/storyboard/shots/${target.id}?panel=${target.panels[0].id}`);
    else void navigateSafely(`/shotlists/${state.board.shotlist.id}/storyboard#story-shot-${target.id}`);
  }

  return <main className={styles.sketcherShell}>
    <header className={styles.sketcherHeader}>
      <div className={styles.sketcherIdentity}><button type="button" onClick={() => void navigateSafely(`/shotlists/${state.board.shotlist.id}/storyboard`)}>←</button><div><small>{state.board.shotlist.title} / {state.group.title}</small><strong>PLANO {label.replace(/[a-z]+$/u, "")} · PANEL {label}</strong></div></div>
      <div className={styles.saveCluster}><span data-state={saveState}>{saveState === "saving" ? "Guardando…" : saveState === "error" ? "Error de guardado" : "Guardado"}</span>{thumbnailError && <em title={thumbnailError}>Miniatura pendiente</em>}{stale && <button type="button" className={styles.staleButton} onClick={() => void acknowledge()}>Plano cambió · Revisar</button>}<button type="button" onClick={() => void exportPng()}>Exportar PNG</button><button type="button" className={styles.approveButton} disabled={storyboardContentKind(drawing) === "empty" || isApproved} onClick={() => void approve()}>{isApproved ? "✓ Aprobado" : "Aprobar revisión"}</button></div>
    </header>
    {error && <div className={styles.errorBanner} role="alert">{error}<div><button type="button" onClick={() => void flush()}>Reintentar</button><button type="button" onClick={() => setError(null)}>Cerrar</button></div></div>}
    {tabBlocked && <div className={styles.leaseBanner}>Otra pestaña está editando este panel. Aquí queda en sólo lectura.<button type="button" onClick={() => leaseRef.current?.takeOver()}>Editar en esta pestaña</button></div>}
    <div className={styles.sketcherWorkspace}>
      <aside className={`${styles.briefPanel} ${briefOpen ? "" : styles.collapsedPanel}`}>
        <button type="button" className={styles.panelToggle} onClick={() => setBriefOpen((value) => !value)}>BRIEF DEL PLANO <span>{briefOpen ? "−" : "+"}</span></button>
        {briefOpen && <div className={styles.briefContent}><Brief label="Acción" value={state.shot.subject || state.shot.description} /><div className={styles.briefPair}><Brief label="Plano" value={state.shot.shotType} /><Brief label="Ángulo" value={state.shot.angle} /></div><div className={styles.briefPair}><Brief label="Lente" value={state.shot.lens} /><Brief label="Movimiento" value={state.shot.movement} /></div><Brief label="Composición" value={state.shot.composition} /><Brief label="Intención" value={state.shot.intention} /><Brief label="Notas del plano" value={state.shot.notes} /><button type="button" onClick={() => void navigateSafely(`/shotlists/${state.board.shotlist.id}?shot=${state.shot.id}`)}>Editar plano en Shotlist ↗</button>{state.board.shotlist.scriptId && state.group.sourceStatus === "linked" && state.group.sourceSceneId && <Link href={`/writer/${state.board.shotlist.scriptId}?scene=${state.group.sourceSceneId}&return=${encodeURIComponent(`/shotlists/${state.board.shotlist.id}/storyboard/shots/${state.shot.id}?panel=${panel.id}`)}`}>Ir al guion ↗</Link>}</div>}
      </aside>
      <section className={styles.canvasColumn}>
        <div className={styles.toolbar} role="toolbar" aria-label="Herramientas de dibujo">
          {TOOLS.map((item) => <button type="button" key={item.id} aria-pressed={tool === item.id} title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ""}`} onClick={() => setTool(item.id)}>{toolIcon(item.id)}<span>{item.label}</span></button>)}
          <i />
          <button type="button" disabled={!undoRef.current.length} onClick={undo} title="Deshacer (Ctrl+Z)">↶<span>Deshacer</span></button>
          <button type="button" disabled={!redoRef.current.length} onClick={redo} title="Rehacer (Ctrl+Y)">↷<span>Rehacer</span></button>
          <i />
          <label title="Color"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><span>Color</span></label>
          <label>Grosor <input type="range" min="1" max="40" value={brushWidth} onChange={(event) => setBrushWidth(Number(event.target.value))} /><b>{brushWidth}</b></label>
          <i />
          <button type="button" onClick={() => canvasRef.current?.zoomBy(.85)} aria-label="Alejar">−</button><button type="button" onClick={() => canvasRef.current?.fit()} title="Ajustar a ventana (0)">{Math.round(zoom * 100)}%</button><button type="button" onClick={() => canvasRef.current?.zoomBy(1.15)} aria-label="Acercar">＋</button>
        </div>
        <div className={styles.canvasStage}><SketcherCanvasLoader canvasRef={canvasRef} document={drawing} tool={tool} color={color} brushWidth={brushWidth} selectedId={selectedId} readOnly={tabBlocked} onSelect={setSelectedId} onCommit={commitDocument} onViewportChange={setZoom} /></div>
        <div className={styles.canvasFooter}><span>{drawing.frame.width}×{drawing.frame.height} · {storyboardContentKind(drawing) === "empty" ? "Sin contenido" : storyboardContentKind(drawing) === "mixed" ? "Referencia + dibujo" : storyboardContentKind(drawing) === "drawing" ? "Dibujo" : "Referencia"}</span><span>Mouse: herramienta activa · Espacio/Mano: desplazar · Touch: dos dedos para navegar</span></div>
      </section>
      <aside className={`${styles.propertiesPanel} ${propertiesOpen ? "" : styles.collapsedPanel}`}>
        <button type="button" className={styles.panelToggle} onClick={() => setPropertiesOpen((value) => !value)}>PROPIEDADES <span>{propertiesOpen ? "−" : "+"}</span></button>
        {propertiesOpen && <div className={styles.propertiesContent}>
          <label>Formato<select value="" onChange={(event) => requestFrame(event.target.value)}><option value="" disabled>{aspectLabel(drawing.frame.width, drawing.frame.height)}</option><option value="16:9">16:9</option><option value="1.85">1.85:1</option><option value="2.39">2.39:1</option><option value="4:3">4:3</option><option value="custom">Personalizado…</option></select></label>
          <section><h3>Referencia base</h3>{drawing.reference ? <><div className={styles.referenceThumb}><img src={`/api/writer/production-assets/${drawing.reference.assetId}`} alt="Referencia privada" /></div><div className={styles.referenceActions}><button type="button" onClick={() => setTool("reference")}>Reencuadrar</button><button type="button" onClick={() => commitDocument({ ...drawing, reference: null }, "Retirar referencia")}>Retirar</button></div><label>Opacidad<select value={drawing.reference.opacity} onChange={(event) => commitDocument({ ...drawing, reference: { ...drawing.reference!, opacity: Number(event.target.value) } }, "Cambiar opacidad")}><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="0.25">25%</option></select></label></> : <p>La referencia queda separada del dibujo y no se borra con el borrador.</p>}
            <label className={styles.uploadButton}>＋ Subir referencia<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) { const form = new FormData(); form.set("file", file); void addReference(form); } event.target.value = ""; }} /></label>
            {state.shot.assetId && (!drawing.reference || drawing.reference.assetId !== state.shot.assetId) && <button type="button" className={styles.reuseButton} onClick={() => { const form = new FormData(); form.set("reuseAssetId", state.shot.assetId!); void addReference(form); }}>Reutilizar referencia del plano</button>}
          </section>
          <label>Nota visual<textarea value={visualNote} maxLength={4000} placeholder="Nota propia de este panel; no modifica el plano." onChange={(event) => { const note = event.target.value; setVisualNote(note); scheduleSave(drawing, note.trim() || null); }} /></label>
          <section><h3>Panel</h3><button type="button" onClick={() => void duplicatePanel()}>Duplicar panel</button><button type="button" className={styles.dangerButton} onClick={() => void deletePanel()}>Eliminar panel</button></section>
        </div>}
      </aside>
    </div>
    <footer className={`${styles.panelStrip} ${panelsOpen ? "" : styles.panelStripCollapsed}`}>
      <button type="button" className={styles.panelToggle} onClick={() => setPanelsOpen((value) => !value)}>PANELES DEL PLANO <span>{panelsOpen ? "−" : "+"}</span></button>
      {panelsOpen && <div><button type="button" disabled={shotIndex <= 0} onClick={() => navigateShot(-1)}>‹ Plano anterior</button><div className={styles.panelThumbs}>{state.shot.panels.map((item, index) => <button type="button" className={item.id === panel.id ? styles.activePanelThumb : ""} key={item.id} onClick={() => void navigateSafely(`/shotlists/${state.board.shotlist.id}/storyboard/shots/${state.shot.id}?panel=${item.id}`)}>{item.previewAssetId ? <img src={`/api/writer/production-assets/${item.previewAssetId}`} alt="" /> : <span>{index + 1}</span>}<strong>{panelLabel(state.board, state.shot.id, item.id)}</strong></button>)}<button type="button" className={styles.addPanelThumb} onClick={() => void createPanel()}>＋<span>Nuevo momento</span></button></div><button type="button" disabled={shotIndex < 0 || shotIndex >= flatShots.length - 1} onClick={() => navigateShot(1)}>Plano siguiente ›</button></div>}
    </footer>
    {frameChoice && <div className={styles.reviewBackdrop} role="dialog" aria-modal="true" aria-label="Cambiar formato"><div className={styles.frameDialog}><h2>Cambiar a {frameChoice.label}</h2><p>El contenido no se deformará ni se recortará en silencio. “Mantener escala” puede dejar objetos fuera del frame.</p><div><button type="button" onClick={() => applyFrame("fit")}>Ajustar todo</button><button type="button" onClick={() => applyFrame("keep")}>Mantener escala</button><button type="button" onClick={() => setFrameChoice(null)}>Cancelar</button></div></div></div>}
    {conflict && <div className={styles.reviewBackdrop} role="dialog" aria-modal="true" aria-label="Conflicto de edición"><div className={styles.frameDialog}><h2>Este panel cambió en otra sesión</h2><p>{conflict.message} Tu borrador local no se reemplazó.</p><div><button type="button" onClick={() => downloadDraft(drawing, visualNote, label)}>Descargar borrador JSON</button><button type="button" onClick={() => window.location.reload()}>Abrir versión guardada</button><button type="button" onClick={() => setConflict(null)}>Permanecer aquí</button></div></div></div>}
  </main>;
}

function Brief({ label, value }: { label: string; value: string | null | undefined }) { return <div className={styles.briefField}><small>{label}</small><p>{value?.trim() || "Sin definir"}</p></div>; }
function toolIcon(tool: StoryboardTool) { return ({ select: "⌖", hand: "✋", brush: "✎", eraser: "⌫", line: "╱", arrow: "→", rectangle: "□", ellipse: "○", text: "T", reference: "▣" } as const)[tool]; }
function aspectLabel(width: number, height: number) { const ratio = width / height; if (Math.abs(ratio - 16 / 9) < .01) return "16:9"; if (Math.abs(ratio - 1.85) < .01) return "1.85:1"; if (Math.abs(ratio - 2.39) < .01) return "2.39:1"; if (Math.abs(ratio - 4 / 3) < .01) return "4:3"; return `${width}×${height}`; }
function panelLabel(board: StoryboardBoard, shotId: string, panelId: string) { const groupIndex = board.groups.findIndex((group) => group.shots.some((shot) => shot.id === shotId)); const shotIndex = board.groups[groupIndex]?.shots.findIndex((shot) => shot.id === shotId) ?? 0; const panelIndex = board.groups[groupIndex]?.shots[shotIndex]?.panels.findIndex((panel) => panel.id === panelId) ?? 0; return `${groupIndex + 1}.${shotIndex + 1}${panelSuffix(Math.max(0, panelIndex))}`; }
function panelSuffix(index: number) { let value = index; let suffix = ""; do { suffix = String.fromCharCode(97 + (value % 26)) + suffix; value = Math.floor(value / 26) - 1; } while (value >= 0); return suffix; }
function safeFilename(value: string) { return value.normalize("NFKD").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 80) || "storyboard"; }
function isEditingTarget(target: EventTarget | null) { return target instanceof HTMLElement && Boolean(target.closest("input,textarea,select,[contenteditable=true],dialog")); }
function downloadDraft(document: StoryboardDocument, visualNote: string, label: string) { const blob = new Blob([JSON.stringify({ document, visualNote }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = window.document.createElement("a"); link.href = url; link.download = `borrador-${label}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 5000); }
