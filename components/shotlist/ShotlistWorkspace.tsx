"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  WRITER_SHOT_ANGLES,
  WRITER_SHOT_MOVEMENTS,
  WRITER_SHOT_TYPES,
  writerShotlistSummary,
  type WriterShot,
  type WriterShotlist,
  type WriterShotlistGroup,
} from "@/lib/writer/production";
import {
  SHOTLIST_COLUMNS,
  SHOTLIST_LENSES,
  filterShotlistRows,
  filteredShotlist,
  groupClipboardText,
  shotClipboardText,
  shotlistCsv,
  shotlistRows,
  type ShotlistColumnKey,
  type ShotlistFilter,
  type ShotlistRowContext,
} from "@/lib/shotlist/ux";
import ShotlistApplicationMenu from "./ShotlistApplicationMenu";
import ShotlistBadgeSelect from "./ShotlistBadgeSelect";
import { ConfirmDialog, NewSceneDialog, PasteFallbackDialog, ShotlistHelpDialog, StoryboardCreateDialog, StoryboardPreviewDialog, StoryboardPreviewImage } from "./ShotlistDialogs";
import ShotlistExportDialog from "./ShotlistExportDialog";
import ShotlistFilters from "./ShotlistFilters";
import ShotlistImportDialog from "./ShotlistImportDialog";
import ShotlistMoreMenu from "./ShotlistMoreMenu";
import ShotlistContextMenu from "./ShotlistContextMenu";
import ShotlistResizeHandle, { SHOTLIST_PANEL_DEFAULTS, SHOTLIST_PANEL_LIMITS, type ShotlistPanelSide } from "./ShotlistResizeHandle";
import {
  parseWriterInternalHistory,
  recordWriterInternalRoute,
  stepWriterInternalHistory,
  writerInternalHistoryStorageKey,
  type WriterInternalHistory,
} from "@/lib/writer/internal-navigation";
import type { StoryboardBoard, StoryboardPanel } from "@/lib/storyboard/types";

type SourceChanges = { renamed: Array<{ groupId: string; sceneId: string; title: string }>; reordered: boolean; missing: string[]; added: Array<{ sceneId: string; title: string }>; sourceRevision?: number };
type Mode = "manual" | "assisted" | "suggested";
type ShotProposal = { id: string; group_id: string; payload: Partial<WriterShot>; status: "pending" | "accepted" | "dismissed" };
type DeleteTarget = { kind: "shot"; shotIds: string[]; expectedShots: Array<{ id: string; revision: number }> } | { kind: "group"; group: WriterShotlistGroup };
type ShotCopy = Pick<WriterShot, "shotType" | "composition" | "subject" | "angle" | "movement" | "support" | "lens" | "setup" | "durationSeconds" | "description" | "intention" | "notes">;
type ShotClipboard = { version: 1; userId: string; shotlistId: string; text: string; shots: ShotCopy[] };
type ShotHistoryEntry =
  | { kind: "edit"; shotId: string; before: Partial<WriterShot>; after: Partial<WriterShot> }
  | { kind: "reorder"; shotId: string; groupId: string; beforeIndex: number; afterIndex: number }
  | { kind: "create"; created: Array<{ id: string; groupId: string; targetIndex: number; fields: ShotCopy }> };
type ShotHistory = { entries: ShotHistoryEntry[]; index: number; expectedRevision: number | null };

const SUPPORT_OPTIONS = ["Trípode", "Monopié", "Hombro", "Handheld", "Gimbal", "Steadicam", "Dolly", "Grúa", "Drone"];
const COLUMN_WIDTHS: Record<ShotlistColumnKey, number> = { number: 66, scene: 84, location: 150, interiorExterior: 78, shotType: 142, subject: 210, description: 240, lens: 108, composition: 130, angle: 120, movement: 132, support: 120, setup: 90, durationSeconds: 94, status: 112, notes: 240, storyboard: 86 };
const ACTION_COLUMN_WIDTH = 78;
const DEFAULT_COLUMNS = new Set(SHOTLIST_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key));
const COPY_FIELDS = ["shotType", "composition", "subject", "angle", "movement", "support", "lens", "setup", "durationSeconds", "description", "intention", "notes"] as const;

export default function ShotlistWorkspace({ initialState, userId, initialMode = "manual", initialShotId }: { initialState: { shotlist: WriterShotlist; sourceChanges: SourceChanges }; userId: string; initialMode?: Mode; initialShotId?: string }) {
  const router = useRouter();
  const [shotlist, setShotlist] = useState(initialState.shotlist);
  const [sourceChanges, setSourceChanges] = useState(initialState.sourceChanges);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [expanded, setExpanded] = useState(() => new Set(initialState.shotlist.groups.slice(0, 2).map((group) => group.id)));
  const initialShot = initialState.shotlist.groups.flatMap((group) => group.shots).find((shot) => shot.id === initialShotId) ?? initialState.shotlist.groups.flatMap((group) => group.shots)[0];
  const [activeGroupId, setActiveGroupId] = useState<string | null>(initialShot?.groupId ?? initialState.shotlist.groups[0]?.id ?? null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(initialShot?.id ?? null);
  const [selectedIds, setSelectedIds] = useState(() => new Set<string>());
  const selectionAnchor = useRef<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [sceneSearch, setSceneSearch] = useState("");
  const [filters, setFilters] = useState<ShotlistFilter[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<ShotlistColumnKey>>(() => new Set(DEFAULT_COLUMNS));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ShotProposal[]>([]);
  const [proposalSelection, setProposalSelection] = useState(() => new Set<string>());
  const [proposalBusy, setProposalBusy] = useState(false);
  const [newSceneOpen, setNewSceneOpen] = useState(false);
  const [newSceneAnchor, setNewSceneAnchor] = useState<{ index: number; label: string } | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [storyboardCreateOpen, setStoryboardCreateOpen] = useState(false);
  const [storyboardState, setStoryboardState] = useState<"loading" | "empty" | "existing" | "error">("loading");
  const [storyboardBoard, setStoryboardBoard] = useState<StoryboardBoard | null>(null);
  const [storyboardPreviewShotId, setStoryboardPreviewShotId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<{ panels: number; approvals: number; productionItems: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("pdf");
  const [exportBusy, setExportBusy] = useState(false);
  const [revealedShotId, setRevealedShotId] = useState<string | null>(null);
  const pendingShotFocusId = useRef<string | null>(null);
  const [internalHistory, setInternalHistory] = useState<WriterInternalHistory>({ entries: [], index: -1 });
  const [visibleLimit, setVisibleLimit] = useState(240);
  const [panelWidths, setPanelWidths] = useState<{ left: number; right: number }>({ ...SHOTLIST_PANEL_DEFAULTS });
  const [syncBusy, setSyncBusy] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [shotHistory, setShotHistory] = useState<ShotHistory>({ entries: [], index: -1, expectedRevision: null });
  const operationLock = useRef(false);
  const clipboard = useRef<ShotClipboard | null>(null);
  const [clipboardReady, setClipboardReady] = useState(false);
  const [pasteFallbackOpen, setPasteFallbackOpen] = useState(false);
  const [pasteFallbackText, setPasteFallbackText] = useState("");
  const pasteAnchor = useRef<string | null>(null);
  const [contextShotId, setContextShotId] = useState<string | null>(null);
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number } | null>(null);
  const contextTrigger = useRef<HTMLElement | null>(null);
  const editEpoch = useRef(0);
  const loadMore = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  function recordHistory(entry: ShotHistoryEntry, latest: WriterShotlist) {
    setShotHistory((current) => {
      const entries = [...current.entries.slice(0, current.index + 1), entry].slice(-50);
      return { entries, index: entries.length - 1, expectedRevision: latest.revision };
    });
  }

  function clearHistory() { setShotHistory({ entries: [], index: -1, expectedRevision: null }); }
  const closeContext = useCallback((restoreFocus = false) => {
    setContextPosition(null);
    setContextShotId(null);
    if (restoreFocus) window.requestAnimationFrame(() => contextTrigger.current?.focus());
  }, []);

  function openContext(shotId: string, x: number, y: number, trigger: HTMLElement) {
    if (selectedTextActive()) return;
    contextTrigger.current = trigger;
    if (!selectedIds.has(shotId)) setSelectedIds(new Set([shotId]));
    setContextShotId(shotId);
    setContextPosition({ x, y });
  }

  function handleWorkspaceShortcut(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.repeat || event.altKey || event.getModifierState("AltGraph")) return;
    const target = event.target as HTMLElement;
    if (!target.closest(".shotlist-grid-panel") || target.closest("input,textarea,select,[contenteditable='true'],[role='dialog']")) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLocaleLowerCase("en-US");
    if (mod && key === "f") { event.preventDefault(); searchInputRef.current?.focus(); return; }
    if (mod && key === "z" && event.shiftKey && shotHistory.index < shotHistory.entries.length - 1) { event.preventDefault(); void applyHistory("redo"); return; }
    if (mod && key === "z" && shotHistory.index >= 0) { event.preventDefault(); void applyHistory("undo"); return; }
    if (event.ctrlKey && !event.metaKey && key === "y" && shotHistory.index < shotHistory.entries.length - 1) { event.preventDefault(); void applyHistory("redo"); return; }
    if (mod && key === "c" && selectedIds.size) { event.preventDefault(); void copyShot(); return; }
    if (mod && key === "v" && clipboardReady) { event.preventDefault(); void pasteShot(); return; }
    if (!mod && event.key === "Delete" && selectedIds.size) { event.preventDefault(); void prepareDelete([...selectedIds]); return; }
    if (event.key === "Escape" && selectedIds.size) { event.preventDefault(); setSelectedIds(new Set()); }
  }

  useEffect(() => { clipboard.current = null; const timer = window.setTimeout(() => { setClipboardReady(false); setShotHistory({ entries: [], index: -1, expectedRevision: null }); }, 0); return () => window.clearTimeout(timer); }, [userId, initialState.shotlist.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`filmatta:shotlist:panel-widths:${userId}`);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<{ left: number; right: number }>;
      const next: { left: number; right: number } = { ...SHOTLIST_PANEL_DEFAULTS };
      for (const side of ["left", "right"] as const) {
        const value = stored[side];
        if (typeof value === "number" && Number.isFinite(value) && value >= SHOTLIST_PANEL_LIMITS[side].min && value <= SHOTLIST_PANEL_LIMITS[side].max) next[side] = value;
      }
      const timer = window.setTimeout(() => setPanelWidths(next), 0);
      return () => window.clearTimeout(timer);
    } catch { /* keep safe defaults */ }
  }, [userId]);

  function commitPanelWidth(side: ShotlistPanelSide, width: number) {
    const next = { ...panelWidths, [side]: width };
    setPanelWidths(next);
    try { localStorage.setItem(`filmatta:shotlist:panel-widths:${userId}`, JSON.stringify(next)); }
    catch { setNotice("El ancho cambió, pero no pudimos conservarlo para la próxima visita."); }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const key = writerInternalHistoryStorageKey(userId);
      const restored = parseWriterInternalHistory(window.sessionStorage.getItem(key));
      const next = recordWriterInternalRoute(restored, `/shotlists/${initialState.shotlist.id}`);
      window.sessionStorage.setItem(key, JSON.stringify(next));
      setInternalHistory(next);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialState.shotlist.id, userId]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`filmatta:shotlist:${initialState.shotlist.id}:columns`);
      if (stored) {
        const keys = JSON.parse(stored) as string[];
        const allowed = new Set(SHOTLIST_COLUMNS.map((column) => column.key));
        const timer = window.setTimeout(() => setVisibleColumns(new Set(keys.filter((key): key is ShotlistColumnKey => allowed.has(key as ShotlistColumnKey)))), 0);
        return () => window.clearTimeout(timer);
      }
    } catch { /* keep safe defaults */ }
  }, [initialState.shotlist.id]);

  useEffect(() => {
    void fetch(`/api/shotlists/${initialState.shotlist.id}/proposals`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      const rows = (data.proposals ?? []) as ShotProposal[];
      setProposals(rows); setProposalSelection(new Set(rows.filter((item) => item.status === "pending").map((item) => item.id)));
    });
  }, [initialState.shotlist.id]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/shotlists/${initialState.shotlist.id}/storyboard`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const board = await response.json() as StoryboardBoard;
      const panelCount = (board.groups ?? []).reduce((total: number, group: { shots?: Array<{ panels?: unknown[] }> }) => total + (group.shots ?? []).reduce((shotTotal, shot) => shotTotal + (shot.panels?.length ?? 0), 0), 0);
      if (active) { setStoryboardBoard(board); setStoryboardState(panelCount > 0 ? "existing" : "empty"); }
    }).catch(() => { if (active) { setStoryboardBoard(null); setStoryboardState("error"); } });
    return () => { active = false; };
  }, [initialState.shotlist.id]);

  useEffect(() => {
    const node = loadMore.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setVisibleLimit((current) => current + 240); }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  });

  const allRows = useMemo(() => shotlistRows(shotlist), [shotlist]);
  const naturalFilteredRows = useMemo(() => filterShotlistRows(allRows, search, filters), [allRows, filters, search]);
  const filteredIds = useMemo(() => new Set(naturalFilteredRows.map((row) => row.shot.id)), [naturalFilteredRows]);
  const filteredRows = useMemo(() => revealedShotId && !naturalFilteredRows.some((row) => row.shot.id === revealedShotId) ? [...naturalFilteredRows, ...allRows.filter((row) => row.shot.id === revealedShotId)] : naturalFilteredRows, [allRows, naturalFilteredRows, revealedShotId]);
  const renderedRows = filteredRows.slice(0, visibleLimit);

  useEffect(() => {
    if (!pendingShotFocusId.current) return;
    const input = document.querySelector<HTMLInputElement>(`[data-shot-id="${pendingShotFocusId.current}"] input[aria-label="Acción"]`);
    if (!input) return;
    input.focus();
    pendingShotFocusId.current = null;
  }, [shotlist, visibleLimit, revealedShotId, expanded]);
  const rowsByGroup = useMemo(() => new Map(shotlist.groups.map((group) => [group.id, renderedRows.filter((row) => row.group.id === group.id)])), [renderedRows, shotlist.groups]);
  const allShots = useMemo(() => shotlist.groups.flatMap((group) => group.shots), [shotlist.groups]);
  const selectedShot = allShots.find((shot) => shot.id === selectedShotId) ?? null;
  const selectedGroup = selectedShot ? shotlist.groups.find((group) => group.id === selectedShot.groupId) ?? null : null;
  const selectedRow = selectedShot ? allRows.find((row) => row.shot.id === selectedShot.id) ?? null : null;
  const storyboardShots = useMemo(() => new Map((storyboardBoard?.groups ?? []).flatMap((group) => group.shots).map((shot) => [shot.id, shot])), [storyboardBoard]);
  const selectedStoryboardPanels = selectedShot ? storyboardShots.get(selectedShot.id)?.panels ?? [] : [];
  const selectedStoryboardPanel = representativeStoryboardPanel(selectedStoryboardPanels);
  const previewShot = storyboardPreviewShotId ? allRows.find((row) => row.shot.id === storyboardPreviewShotId) ?? null : null;
  const previewPanels = storyboardPreviewShotId ? storyboardShots.get(storyboardPreviewShotId)?.panels ?? [] : [];
  const previewPanel = representativeStoryboardPanel(previewPanels);
  const summary = writerShotlistSummary(shotlist.groups);
  const duration = `${Math.floor(summary.durationSeconds / 60)}:${String(Math.round(summary.durationSeconds % 60)).padStart(2, "0")}`;
  const columns = SHOTLIST_COLUMNS.map((column) => column.key).filter((column) => visibleColumns.has(column));
  const gridTemplate = `${columns.map((column) => `${COLUMN_WIDTHS[column]}px`).join(" ")} ${ACTION_COLUMN_WIDTH}px`;
  const gridWidth = columns.reduce((sum, column) => sum + COLUMN_WIDTHS[column], ACTION_COLUMN_WIDTH);
  const gridStyle = { gridTemplateColumns: gridTemplate, minWidth: gridWidth, "--shot-grid": gridTemplate } as CSSProperties;
  const groupStyle = { minWidth: gridWidth } as CSSProperties;

  useEffect(() => {
    const hidden = [...selectedIds].filter((id) => !filteredIds.has(id));
    if (!hidden.length) return;
    const timer = window.setTimeout(() => {
      setSelectedIds((current) => new Set([...current].filter((id) => filteredIds.has(id))));
      setNotice(`${hidden.length} plano(s) salieron de la selección al cambiar los resultados.`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filteredIds, selectedIds]);

  function toggleShotSelection(shotId: string, checked: boolean, range: boolean) {
    const currentIndex = naturalFilteredRows.findIndex((row) => row.shot.id === shotId);
    const anchorIndex = selectionAnchor.current ? naturalFilteredRows.findIndex((row) => row.shot.id === selectionAnchor.current) : -1;
    setSelectedIds((current) => {
      const next = new Set(current);
      const ids = range && anchorIndex >= 0 && currentIndex >= 0
        ? naturalFilteredRows.slice(Math.min(anchorIndex, currentIndex), Math.max(anchorIndex, currentIndex) + 1).map((row) => row.shot.id)
        : [shotId];
      for (const id of ids) if (checked) next.add(id); else next.delete(id);
      return next;
    });
    if (!range || anchorIndex < 0) selectionAnchor.current = shotId;
  }

  function toggleGroupSelection(groupId: string, checked: boolean) {
    const ids = naturalFilteredRows.filter((row) => row.group.id === groupId).map((row) => row.shot.id);
    setSelectedIds((current) => { const next = new Set(current); for (const id of ids) if (checked) next.add(id); else next.delete(id); return next; });
    selectionAnchor.current = ids.at(-1) ?? null;
  }

  async function api(body: Record<string, unknown>) {
    const response = await fetch(`/api/shotlists/${shotlist.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) { const failure = new Error(data.error ?? "No pudimos guardar el cambio.") as Error & { code?: string; impact?: { panels: number; approvals: number } }; failure.code = data.code; failure.impact = data.impact; throw failure; }
    return data;
  }

  function replaceShot(next: WriterShot) { setShotlist((current) => ({ ...current, groups: current.groups.map((group) => group.id === next.groupId ? { ...group, shots: group.shots.map((shot) => shot.id === next.id ? next : shot) } : group) })); }

  async function saveShot(shot: WriterShot, changes: Partial<WriterShot>) {
    if (operationLock.current) { setError("Espera a que termine la operación anterior antes de guardar otro campo."); return; }
    operationLock.current = true;
    editEpoch.current += 1;
    const previous = shot; const next = { ...shot, ...changes };
    replaceShot(next); setSaveState("saving"); setError(null);
    const payloadChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => !["id", "shotlistId", "groupId", "revision", "position", "origin", "assetId", "sourceRevision"].includes(key)));
    let saved = false;
    try {
      const response = await api({ action: "updateShot", shotId: shot.id, expectedRevision: shot.revision, changes: payloadChanges });
      saved = true;
      replaceShot({ ...next, revision: Number(response.revision ?? shot.revision + 1) });
      const latest = await reload(shot.id);
      if (latest) recordHistory({ kind: "edit", shotId: shot.id, before: Object.fromEntries(Object.keys(payloadChanges).map((key) => [key, shot[key as keyof WriterShot]])), after: payloadChanges }, latest);
    } catch (cause) {
      if (!saved) replaceShot(previous);
      setSaveState("error");
      setError(saved ? "El campo se guardó, pero no pudimos confirmar la versión actual. Recarga antes de seguir editando." : message(cause, "No pudimos guardar el plano."));
    } finally { operationLock.current = false; }
  }

  async function readShotlist() {
    const response = await fetch(`/api/shotlists/${shotlist.id}`, { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No pudimos actualizar la shotlist.");
    return data as { shotlist: WriterShotlist; sourceChanges: SourceChanges };
  }

  async function reload(preferredId?: string, expectedEpoch?: number) {
    const data = await readShotlist();
    if (expectedEpoch != null && expectedEpoch !== editEpoch.current) return false;
    setShotlist(data.shotlist); setSourceChanges(data.sourceChanges);
    const validIds = new Set(data.shotlist.groups.flatMap((group) => group.shots.map((shot) => shot.id)));
    setSelectedShotId((current) => preferredId && validIds.has(preferredId) ? preferredId : current && validIds.has(current) ? current : data.shotlist.groups.flatMap((group) => group.shots)[0]?.id ?? null);
    setSaveState("saved");
    return data.shotlist as WriterShotlist;
  }

  async function addShot(groupId = activeGroupId, targetIndex?: number) {
    if (!groupId || operationLock.current) return;
    operationLock.current = true;
    const originalLength = shotlist.groups.find((group) => group.id === groupId)?.shots.length ?? 0;
    setSaveState("saving"); setError(null);
    try {
      const result = await api({ action: "addShot", groupId, origin: mode === "assisted" ? "assisted" : "manual", operationId: crypto.randomUUID(), ...(targetIndex == null ? {} : { targetIndex }) });
       pendingShotFocusId.current = result.id;
       const latest = await reload(result.id); setInspectorOpen(true); setExpanded((current) => new Set(current).add(groupId)); setRevealedShotId(result.id);
       const created = latest && latest.groups.flatMap((group) => group.shots).find((shot) => shot.id === result.id);
       if (created && latest) recordHistory({ kind: "create", created: [{ id: created.id, groupId, targetIndex: targetIndex ?? originalLength, fields: shotCopy(created) }] }, latest);
      if (search.trim() || filters.length) setNotice("El plano nuevo se muestra temporalmente aunque no coincida con los filtros activos.");
    } catch (cause) { setSaveState("error"); setError(message(cause, "No pudimos añadir el plano.")); }
    finally { operationLock.current = false; }
  }

  function openNewScene(afterGroup?: WriterShotlistGroup) { setNewSceneAnchor(afterGroup ? { index: shotlist.groups.indexOf(afterGroup) + 1, label: afterGroup.title } : null); setNewSceneOpen(true); }

  async function addGroup(title: string) {
    if (dialogBusy) return;
    setDialogBusy(true); setError(null);
    try { const result = await api({ action: "addGroup", title, operationId: crypto.randomUUID(), ...(newSceneAnchor ? { targetIndex: newSceneAnchor.index } : {}) }); clearHistory(); await reload(); setActiveGroupId(result.id); setExpanded((current) => new Set(current).add(result.id)); setNewSceneOpen(false); setNewSceneAnchor(null); }
    catch (cause) { setError(message(cause, "No pudimos crear la escena.")); }
    finally { setDialogBusy(false); }
  }

  function commandRows(targetShotId?: string) {
    const target = targetShotId ? allRows.find((row) => row.shot.id === targetShotId) : null;
    if (target && !selectedIds.has(targetShotId!)) return [target];
    const rows = allRows.filter((row) => selectedIds.has(row.shot.id));
    return rows.length ? rows : target ? [target] : selectedRow ? [selectedRow] : [];
  }

  async function createCopy(groupId: string, fields: ShotCopy, targetIndex: number) {
    const created = await api({ action: "addShot", groupId, origin: "manual", operationId: crypto.randomUUID() });
    const id = String(created.id);
    await api({ action: "updateShot", shotId: id, expectedRevision: 1, changes: { ...fields, sourceBlockId: null, status: "pending" } });
    await api({ action: "reorderShot", shotId: id, targetIndex });
    return id;
  }

  async function duplicateShot(targetShotId?: string) {
    const rows = commandRows(targetShotId);
    if (!rows.length || operationLock.current) return;
    if (rows.length > 50) { setError("Duplica hasta 50 planos por operación para poder revisar cada resultado."); return; }
    operationLock.current = true; setOperationBusy(true); setSaveState("saving"); setError(null);
    let completed = 0;
    let lastId: string | undefined;
    const created: Extract<ShotHistoryEntry, { kind: "create" }>["created"] = [];
    try {
      for (const row of [...rows].reverse()) {
        const index = row.group.shots.findIndex((shot) => shot.id === row.shot.id);
        const fields = shotCopy(row.shot);
        lastId = await createCopy(row.group.id, fields, index + 1);
        created.push({ id: lastId, groupId: row.group.id, targetIndex: index + 1, fields });
        completed += 1;
      }
      const latest = await reload(lastId);
      if (latest) recordHistory({ kind: "create", created }, latest);
      setExpanded((current) => new Set([...current, ...rows.map((row) => row.group.id)]));
      setNotice(`${completed} plano(s) duplicado(s). Las copias no incluyen storyboard, referencias de imagen, programación ni estado de ejecución.`);
    } catch (cause) {
      try { await reload(); } catch { /* preserve the primary error */ }
      setSaveState("error");
      setError(`${completed} de ${rows.length} plano(s) duplicado(s). ${message(cause, "No pudimos completar la operación.")} Revisa si quedó un plano incompleto antes de reintentar.`);
    } finally { operationLock.current = false; setOperationBusy(false); }
  }
  async function duplicateGroup(group: WriterShotlistGroup) { try { const result = await api({ action: "duplicateGroup", groupId: group.id, operationId: crypto.randomUUID() }); clearHistory(); await reload(); setActiveGroupId(result.id); setExpanded((current) => new Set(current).add(result.id)); } catch (cause) { setError(message(cause, "No pudimos duplicar el grupo.")); } }
  async function copyShot(targetShotId?: string) {
    const rows = commandRows(targetShotId);
    if (!rows.length) return;
    const text = rows.map(shotClipboardText).join("\n\n—\n\n");
    try {
      await navigator.clipboard.writeText(text);
      clipboard.current = { version: 1, userId, shotlistId: shotlist.id, text, shots: rows.map((row) => shotCopy(row.shot)) };
      setClipboardReady(true);
      setNotice(`${rows.length} plano(s) copiado(s) como texto. Puedes pegarlos en esta Shotlist durante la sesión.`);
    } catch { clipboard.current = null; setClipboardReady(false); setError("No pudimos escribir en el portapapeles. Revisa el permiso del navegador."); }
  }

  async function pasteShot(targetShotId?: string) {
    const snapshot = clipboard.current;
    if (!snapshot || snapshot.userId !== userId || snapshot.shotlistId !== shotlist.id) {
      setError("No hay planos compatibles copiados en esta sesión de Shotlist."); return;
    }
    pasteAnchor.current = targetShotId ?? null;
    try {
      const currentText = await navigator.clipboard.readText();
      if (normalizeClipboardText(currentText) !== normalizeClipboardText(snapshot.text)) { setError("El portapapeles cambió desde que copiaste estos planos. Vuelve a copiarlos."); return; }
      await pasteVerified(snapshot, pasteAnchor.current);
    } catch {
      setPasteFallbackText(""); setPasteFallbackOpen(true);
    }
  }

  async function pasteVerified(snapshot: ShotClipboard, anchorId: string | null) {
    if (operationLock.current) return;
    if (snapshot.shots.length > 50) { setError("Pega hasta 50 planos por operación para poder revisar cada resultado."); return; }
    const anchor = anchorId ? allRows.find((row) => row.shot.id === anchorId) : null;
    const group = anchor?.group ?? shotlist.groups.find((item) => item.id === activeGroupId);
    if (!group) { setError("Elige una escena activa antes de pegar planos."); return; }
    const startIndex = anchor ? group.shots.findIndex((shot) => shot.id === anchor.shot.id) + 1 : group.shots.length;
    operationLock.current = true; setOperationBusy(true); setSaveState("saving"); setError(null); setPasteFallbackOpen(false);
    let completed = 0;
    let lastId: string | undefined;
    const created: Extract<ShotHistoryEntry, { kind: "create" }>["created"] = [];
    try {
      for (const fields of snapshot.shots) {
        lastId = await createCopy(group.id, fields, startIndex + completed);
        created.push({ id: lastId, groupId: group.id, targetIndex: startIndex + completed, fields });
        completed += 1;
      }
      const latest = await reload(lastId);
      if (latest) recordHistory({ kind: "create", created }, latest);
      setExpanded((current) => new Set(current).add(group.id));
      setRevealedShotId(lastId ?? null);
      setNotice(`${completed} plano(s) pegado(s) en ${group.title}. Las copias quedan sin vínculo de Writer y sin Storyboard ni programación.`);
    } catch (cause) {
      try { await reload(); } catch { /* preserve primary error */ }
      setSaveState("error");
      setError(`${completed} de ${snapshot.shots.length} plano(s) pegado(s). ${message(cause, "No pudimos completar la operación.")} Revisa si quedó un plano incompleto antes de reintentar.`);
    } finally { operationLock.current = false; setOperationBusy(false); }
  }
  async function copyGroup(group: WriterShotlistGroup) { await navigator.clipboard.writeText(groupClipboardText(group, shotlist.groups.indexOf(group) + 1, allRows)); setNotice("Grupo copiado como texto legible."); }
  async function copyPrivateLink() { await navigator.clipboard.writeText(location.href); setNotice("Enlace privado copiado. No concede acceso a otras personas."); }

  async function moveShot(direction: -1 | 1) {
    if (!selectedShot || !selectedGroup || search.trim() || filters.length || operationLock.current) return;
    const currentIndex = selectedGroup.shots.findIndex((shot) => shot.id === selectedShot.id); const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= selectedGroup.shots.length) return;
    operationLock.current = true;
    setSaveState("saving"); setError(null);
    try { await api({ action: "reorderShot", shotId: selectedShot.id, targetIndex, expectedRevision: shotlist.revision }); const latest = await reload(selectedShot.id); if (latest) recordHistory({ kind: "reorder", shotId: selectedShot.id, groupId: selectedGroup.id, beforeIndex: currentIndex, afterIndex: targetIndex }, latest); }
    catch (cause) { setSaveState("error"); setError(message(cause, "No pudimos mover el plano.")); }
    finally { operationLock.current = false; }
  }

  async function applyHistory(direction: "undo" | "redo") {
    if (operationLock.current) return;
    const entryIndex = direction === "undo" ? shotHistory.index : shotHistory.index + 1;
    const entry = shotHistory.entries[entryIndex];
    if (!entry) return;
    operationLock.current = true; setOperationBusy(true); setSaveState("saving"); setError(null);
    try {
      const live = (await readShotlist()).shotlist;
      if (live.revision !== shotHistory.expectedRevision) throw new Error("La Shotlist cambió en otra pestaña. No se aplicó el historial; recarga para revisar los cambios.");
      const shots = live.groups.flatMap((group) => group.shots);
      let updatedEntry = entry;
      if (entry.kind === "edit") {
        const shot = shots.find((item) => item.id === entry.shotId);
        if (!shot || !matchesShotFields(shot, direction === "undo" ? entry.after : entry.before)) throw new Error("El plano cambió; no podemos aplicar el historial sin sobrescribirlo.");
        await api({ action: "updateShot", shotId: shot.id, expectedRevision: shot.revision, changes: direction === "undo" ? entry.before : entry.after });
      } else if (entry.kind === "reorder") {
        const group = live.groups.find((item) => item.id === entry.groupId);
        const actual = group?.shots.findIndex((shot) => shot.id === entry.shotId) ?? -1;
        if (actual !== (direction === "undo" ? entry.afterIndex : entry.beforeIndex)) throw new Error("El orden de la escena cambió; no se movió ningún plano.");
        await api({ action: "reorderShot", shotId: entry.shotId, targetIndex: direction === "undo" ? entry.beforeIndex : entry.afterIndex, expectedRevision: live.revision });
      } else if (direction === "undo") {
        const ids = entry.created.map((item) => item.id);
        if (entry.created.some((item) => {
          const shot = shots.find((candidate) => candidate.id === item.id);
          return !shot || shot.groupId !== item.groupId || !matchesShotFields(shot, item.fields)
            || shot.assetId !== null || shot.sourceBlockId !== null || shot.status !== "pending";
        })) throw new Error("Una fila creada cambió desde esta operación. Undo no la eliminará ni perderá esos cambios.");
        const preview = await api({ action: "previewDelete", shotIds: ids });
        if (preview.impact.panels || preview.impact.approvals || preview.impact.productionItems) throw new Error("Las filas creadas ya tienen Storyboard o programación; Undo no puede retirarlas.");
        const result = await api({ action: "deleteShots", shotIds: ids, expectedShots: preview.shots, expectedImpact: { panels: 0, approvals: 0 } });
        if (Number(result.id) !== ids.length) throw new Error("No se retiraron todas las filas creadas. Recarga para revisar el estado.");
      } else {
        const recreated: typeof entry.created = [];
        for (const item of entry.created) {
          const group = live.groups.find((candidate) => candidate.id === item.groupId);
          if (!group) throw new Error("La escena de destino ya no existe.");
          const id = await createCopy(item.groupId, item.fields, item.targetIndex);
          recreated.push({ ...item, id });
        }
        updatedEntry = { ...entry, created: recreated };
      }
      const latest = await reload();
      if (!latest) throw new Error("No pudimos comprobar la versión guardada.");
      setShotHistory((current) => ({ entries: current.entries.map((item, index) => index === entryIndex ? updatedEntry : item), index: direction === "undo" ? entryIndex - 1 : entryIndex, expectedRevision: latest.revision }));
      setNotice(direction === "undo" ? "Cambio deshecho y guardado." : "Cambio rehecho y guardado.");
    } catch (cause) {
      setSaveState("error");
      setError(message(cause, "No pudimos aplicar el historial."));
    } finally { operationLock.current = false; setOperationBusy(false); }
  }

  async function prepareDelete(shotIds: string[]) {
    if (!shotIds.length || shotIds.length > 500) { setError("Selecciona entre 1 y 500 planos para eliminar de forma segura."); return; }
    try {
      const result = await api({ action: "previewDelete", shotIds });
      setDeleteImpact(result.impact);
      setDeleteTarget({ kind: "shot", shotIds, expectedShots: result.shots });
    } catch (cause) { setError(message(cause, "No pudimos comprobar la selección.")); }
  }

  async function prepareDeleteGroup(group: WriterShotlistGroup) {
    if (group.shots.length > 500) { setError("Esta escena supera 500 planos. No es seguro borrarla en una sola operación."); return; }
    if (!group.shots.length) { setDeleteImpact({ panels: 0, approvals: 0, productionItems: 0 }); setDeleteTarget({ kind: "group", group }); return; }
    try {
      const result = await api({ action: "previewDelete", shotIds: group.shots.map((shot) => shot.id) });
      setDeleteImpact(result.impact);
      setDeleteTarget({ kind: "group", group });
    } catch (cause) { setError(message(cause, "No pudimos comprobar la escena.")); }
  }

  async function performDelete(deleteStoryboard = false) {
    if (!deleteTarget || dialogBusy) return;
    setDialogBusy(true); setError(null);
    try {
      if (deleteTarget.kind === "shot") await api({ action: "deleteShots", shotIds: deleteTarget.shotIds, expectedShots: deleteTarget.expectedShots, expectedImpact: { panels: deleteImpact?.panels ?? 0, approvals: deleteImpact?.approvals ?? 0 }, ...(deleteStoryboard ? { deleteStoryboard: true } : {}) });
      else await api({ action: "deleteGroup", groupId: deleteTarget.group.id, expectedRevision: deleteTarget.group.revision, expectedShotIds: deleteTarget.group.shots.map((shot) => shot.id), expectedImpact: { panels: deleteImpact?.panels ?? 0, approvals: deleteImpact?.approvals ?? 0 }, ...(deleteStoryboard ? { deleteStoryboard: true } : {}) });
      setDeleteTarget(null); setDeleteImpact(null); setSelectedIds(new Set()); setSelectedShotId(null); clearHistory(); await reload();
    } catch (cause) {
      const failure = cause as Error & { code?: string; impact?: { panels: number; approvals: number } };
      if (["conflict", "storyboard_dependencies", "production_dependencies"].includes(failure.code ?? "")) {
        try {
          if (deleteTarget.kind === "shot") {
            const latest = await api({ action: "previewDelete", shotIds: deleteTarget.shotIds });
            setDeleteTarget({ ...deleteTarget, expectedShots: latest.shots });
            setDeleteImpact(latest.impact);
          } else {
            const current = (await readShotlist()).shotlist.groups.find((group) => group.id === deleteTarget.group.id);
            if (!current) throw new Error("La escena ya no existe.");
            const latest = current.shots.length ? await api({ action: "previewDelete", shotIds: current.shots.map((shot) => shot.id) }) : { impact: { panels: 0, approvals: 0, productionItems: 0 } };
            setDeleteTarget({ kind: "group", group: current });
            setDeleteImpact(latest.impact);
          }
          setError("La selección o sus dependencias cambiaron. Revisa esta confirmación actualizada antes de intentar de nuevo.");
        } catch {
          setDeleteTarget(null); setDeleteImpact(null);
          setError("La selección cambió y no pudimos volver a comprobarla. Actualiza la Shotlist antes de eliminar.");
        }
      } else { setDeleteTarget(null); setDeleteImpact(null); setError(message(cause, "No pudimos eliminar la selección.")); }
    } finally { setDialogBusy(false); }
  }

  async function prepareProposal() {
    if (mode !== "suggested" || proposalBusy || !activeGroupId) return;
    if (!window.confirm("Sugerir planos puede usar IA si está habilitada. La propuesta se revisará antes de incorporar filas. ¿Continuar?")) return;
    setProposalBusy(true); setError(null);
    try { const response = await fetch(`/api/shotlists/${shotlist.id}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationId: crypto.randomUUID(), mode: "suggested", groupIds: [activeGroupId] }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No pudimos preparar la propuesta."); setProposals(data.proposals ?? []); setProposalSelection(new Set((data.proposals ?? []).filter((item: ShotProposal) => item.status === "pending").map((item: ShotProposal) => item.id))); }
    catch (cause) { setError(message(cause, "No pudimos preparar la propuesta.")); }
    finally { setProposalBusy(false); }
  }

  async function decideProposals(action: "accept" | "dismiss") {
    const proposalIds = [...proposalSelection]; if (!proposalIds.length) return;
    setProposalBusy(true);
    try { const response = await fetch(`/api/shotlists/${shotlist.id}/proposals`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, proposalIds }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No pudimos aplicar la decisión."); setProposals((current) => current.map((proposal) => proposalIds.includes(proposal.id) ? { ...proposal, status: action === "accept" ? "accepted" : "dismissed" } : proposal)); setProposalSelection(new Set()); if (action === "accept") { clearHistory(); await reload(); } }
    catch (cause) { setError(message(cause, "No pudimos aplicar la decisión.")); }
    finally { setProposalBusy(false); }
  }

  async function syncSource() {
    if (syncBusy || saveState === "saving") return;
    const requestedId = shotlist.id;
    const expectedEpoch = editEpoch.current;
    setSyncBusy(true); setSaveState("saving"); setError(null); setNotice(null);
    try {
      const result = await api({ action: "syncSource", expectedRevision: shotlist.revision });
      clearHistory();
      if (requestedId !== shotlist.id) return;
      const refreshed = await reload(selectedShotId ?? undefined, expectedEpoch);
      setNotice(refreshed ? result.updatedGroups || result.missingGroups || result.addedScenes ? `${result.updatedGroups} vínculo(s) actualizado(s).${result.missingGroups ? ` ${result.missingGroups} referencia(s) no disponible(s).` : ""}${result.addedScenes ? ` ${result.addedScenes} escena(s) nueva(s) disponible(s) para importar.` : ""}` : "Vínculos al día." : "Vínculos actualizados. Hay ediciones recientes; vuelve a abrir la shotlist para consultar ambas versiones guardadas.");
    } catch (cause) { setSaveState("error"); setError(cause instanceof TypeError ? "No pudimos conectar para actualizar los vínculos. Reintenta." : message(cause, "No pudimos actualizar los vínculos. Reintenta.")); }
    finally { setSyncBusy(false); }
  }

  async function uploadShotImage(shot: WriterShot, file: File) { setSaveState("saving"); setError(null); try { const form = new FormData(); form.set("file", file); form.set("targetType", "shot"); form.set("targetId", shot.id); const response = await fetch("/api/writer/production-assets", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No pudimos subir la referencia."); clearHistory(); await reload(shot.id); } catch (cause) { setSaveState("error"); setError(message(cause, "No pudimos subir la referencia.")); } }

  async function exportData(options: { format: "csv" | "pdf"; scope: "all" | "filtered"; columns: ShotlistColumnKey[]; paper: "A4" | "A3" }) {
    setExportBusy(true); setError(null); const rows = options.scope === "all" ? allRows : naturalFilteredRows;
    try {
      if (options.format === "csv") download(new Blob([shotlistCsv(filteredShotlist(shotlist, rows), options.columns)], { type: "text/csv;charset=utf-8" }), `shotlist-${shotlist.id.slice(0, 8)}.csv`);
      else { const response = await fetch(`/api/shotlists/${shotlist.id}/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columns: options.columns, paper: options.paper, ...(options.scope === "filtered" ? { shotIds: rows.map((row) => row.shot.id) } : {}) }) }); if (!response.ok) throw new Error(await response.text()); download(await response.blob(), `shotlist-${shotlist.id.slice(0, 8)}.pdf`); }
      setExportOpen(false);
    } catch (cause) { setError(message(cause, "No pudimos exportar la Shotlist.")); }
    finally { setExportBusy(false); }
  }

  async function createNewShotlist() { try { const response = await fetch("/api/shotlists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Shotlist sin título", operationId: crypto.randomUUID() }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); router.push(`/shotlists/${data.id}`); } catch (cause) { setError(message(cause, "No pudimos crear una Shotlist.")); } }

  function selectShot(shot: WriterShot) { setSelectedShotId(shot.id); setActiveGroupId(shot.groupId); setInspectorOpen(true); }
  function navigateRow(shotId: string, direction: -1 | 1) {
    const currentIndex = filteredRows.findIndex((row) => row.shot.id === shotId);
    const next = filteredRows[currentIndex + direction];
    if (!next) return;
    setExpanded((current) => new Set(current).add(next.group.id));
    selectShot(next.shot);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-shot-id="${next.shot.id}"]`)?.focus());
  }
  function openWriter(group: WriterShotlistGroup, shot?: WriterShot) { if (!shotlist.scriptId || !group.sourceSceneId) return; router.push(`/writer/${shotlist.scriptId}?scene=${group.sourceSceneId}&return=/shotlists/${shotlist.id}${shot ? `&shot=${shot.id}` : ""}`); }
  function toggleColumn(column: ShotlistColumnKey) { setVisibleColumns((current) => { const next = new Set(current); if (next.has(column)) next.delete(column); else next.add(column); if (!next.size) next.add("number"); localStorage.setItem(`filmatta:shotlist:${shotlist.id}:columns`, JSON.stringify([...next])); return next; }); }
  function openExport(format: "csv" | "pdf") { setExportFormat(format); setExportOpen(true); }
  function selectedTextActive() { const selection = window.getSelection(); return Boolean(selection && !selection.isCollapsed && selection.toString()); }
  function menuDelete() { if (selectedTextActive()) return setNotice("Hay texto seleccionado. La fila no se eliminó."); const ids = selectedIds.size ? [...selectedIds] : selectedShot ? [selectedShot.id] : []; if (ids.length) void prepareDelete(ids); }
  function openStoryboardPreview(shot: WriterShot) { selectShot(shot); setStoryboardPreviewShotId(shot.id); }
  function navigateInternalHistory(direction: -1 | 1) {
    if (saveState !== "saved") { setNotice("Espera a que termine el guardado antes de navegar."); return; }
    const step = stepWriterInternalHistory(internalHistory, direction);
    if (!step) return;
    window.sessionStorage.setItem(writerInternalHistoryStorageKey(userId), JSON.stringify(step.history));
    setInternalHistory(step.history);
    router.push(step.route);
  }

  return <div ref={workspaceRef} className={`shotlist-workspace${inspectorOpen ? " has-inspector" : ""}`} onKeyDownCapture={handleWorkspaceShortcut} style={{ "--shotlist-left-width": `${panelWidths.left}px`, "--shotlist-right-width": `${panelWidths.right}px` } as CSSProperties}>
    <ShotlistApplicationMenu canBack={saveState === "saved" && internalHistory.index > 0} canForward={saveState === "saved" && internalHistory.index >= 0 && internalHistory.index < internalHistory.entries.length - 1} selectionCount={commandRows().length} canPaste={clipboardReady && Boolean(activeGroupId)} canUndo={!operationBusy && shotHistory.index >= 0} canRedo={!operationBusy && shotHistory.index < shotHistory.entries.length - 1} visibleColumns={visibleColumns} onBack={() => navigateInternalHistory(-1)} onForward={() => navigateInternalHistory(1)} onNew={() => void createNewShotlist()} onImport={() => setImportOpen(true)} onExport={openExport} onCopyLink={() => void copyPrivateLink()} onDuplicate={() => { if (!selectedTextActive()) void duplicateShot(); }} onCopy={() => { if (!selectedTextActive()) void copyShot(); }} onPaste={() => void pasteShot(selectedShotId ?? undefined)} onDelete={menuDelete} onUndo={() => void applyHistory("undo")} onRedo={() => void applyHistory("redo")} onInsertShot={() => void addShot(selectedShot?.groupId ?? activeGroupId, selectedGroup && selectedShot ? selectedGroup.shots.findIndex((shot) => shot.id === selectedShot.id) + 1 : undefined)} onInsertScene={() => openNewScene(selectedGroup ?? undefined)} onToggleColumn={toggleColumn} onShortcuts={() => setHelpOpen(true)} />
    <header className="shotlist-header">
      <div className="shotlist-brand"><Link href="/">FILMATTA</Link><span /><Link href="/shotlists">Shotlist Beta</Link><i>•</i><input aria-label="Nombre de la shotlist" defaultValue={shotlist.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== shotlist.title) void api({ action: "rename", title }).then(() => setShotlist((value) => ({ ...value, title }))).catch((cause) => setError(cause.message)); }} /></div>
      <div className="shotlist-header-actions"><span className={`shotlist-save is-${saveState}`}>● {saveState === "saved" ? "Guardado" : saveState === "saving" ? "Guardando…" : "Error"}</span>{storyboardState === "existing" ? <Link href={`/shotlists/${shotlist.id}/storyboard`}>▧ Abrir Storyboard</Link> : storyboardState === "empty" ? <button type="button" onClick={() => setStoryboardCreateOpen(true)}>▧ Crear Storyboard</button> : storyboardState === "loading" ? <button type="button" disabled>Comprobando Storyboard…</button> : <button type="button" onClick={() => location.reload()}>Reintentar Storyboard</button>}<span className="shotlist-avatar">{shotlist.title.slice(0, 2).toUpperCase()}</span></div>
    </header>
    <div className="shotlist-workbar"><div className="shotlist-modes" role="group" aria-label="Modo de trabajo">{(["manual", "assisted", "suggested"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "manual" ? "✎ Libre" : value === "assisted" ? "◉ Asistido" : "✦ Sugerido"}</button>)}</div><button className="shotlist-primary" type="button" onClick={() => void addShot()}>＋ Plano</button><button className="shotlist-tool" type="button" onClick={() => setImportOpen(true)}>⇩ Importar</button><button className="shotlist-tool" type="button" onClick={() => openExport("pdf")}>⇧ Exportar</button><div className="shotlist-summary"><b>{summary.totalShots}</b> planos <i>•</i> <b>{summary.plannedGroups}</b>/{summary.totalGroups} escenas <i>•</i> {duration}{summary.missingDurations ? ` · ${summary.missingDurations} sin estimar` : ""}</div></div>
    {notice && <div className="shotlist-notice" role="status">{notice}<button type="button" onClick={() => setNotice(null)}>Cerrar</button></div>}
    {error && <div className="shotlist-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>Cerrar</button></div>}
    <aside className="shotlist-scenes"><h2>Escenas</h2><label><span>⌕</span><input value={sceneSearch} onChange={(event) => setSceneSearch(event.target.value)} placeholder="Buscar escenas…" /></label><ol>{shotlist.groups.filter((group) => group.title.toLocaleLowerCase("es-MX").includes(sceneSearch.trim().toLocaleLowerCase("es-MX"))).map((group, index) => <li key={group.id} className={activeGroupId === group.id ? "is-active" : ""}><button type="button" onClick={() => { setActiveGroupId(group.id); setExpanded((current) => new Set(current).add(group.id)); document.getElementById(`shot-group-${group.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{group.title}</strong><small>{group.shots.length} {group.shots.length === 1 ? "plano" : "planos"}{group.sourceStatus === "manual" ? " · manual" : group.sourceStatus === "missing" ? " · fuente no disponible" : ""}</small></button></li>)}</ol><button className="shotlist-new-scene" type="button" aria-haspopup="dialog" aria-expanded={newSceneOpen} onClick={() => openNewScene()}>＋ Nueva escena</button></aside>
    <ShotlistResizeHandle side="left" value={panelWidths.left} otherValue={inspectorOpen ? panelWidths.right : 0} workspaceRef={workspaceRef} onCommit={(width) => commitPanelWidth("left", width)} />
    <main className="shotlist-grid-panel">
       <div className="shotlist-grid-title"><h1>Lista de planos</h1><label><span>⌕</span><input ref={searchInputRef} value={search} onChange={(event) => { setSearch(event.target.value); setVisibleLimit(240); setRevealedShotId(null); }} placeholder="Buscar descripción u observaciones…" /></label><ShotlistFilters rows={allRows} filters={filters} filteredCount={naturalFilteredRows.length} totalCount={allRows.length} onApply={(column, filter) => { setFilters((current) => [...current.filter((item) => item.column !== column), ...(filter ? [filter] : [])]); setVisibleLimit(240); setRevealedShotId(null); }} onRemove={(id) => { setFilters((current) => current.filter((filter) => filter.id !== id)); setVisibleLimit(240); setRevealedShotId(null); }} onClear={() => { setFilters([]); setVisibleLimit(240); setRevealedShotId(null); }} />
         <div className="shotlist-selection-toolbar" role="toolbar" aria-label="Acciones de selección">
           <button type="button" aria-label="Deshacer edición" title="Deshacer · Ctrl/Cmd+Z" disabled={operationBusy || shotHistory.index < 0} onClick={() => void applyHistory("undo")}>↶</button><button type="button" aria-label="Rehacer edición" title="Rehacer · Ctrl/Cmd+Mayús+Z" disabled={operationBusy || shotHistory.index >= shotHistory.entries.length - 1} onClick={() => void applyHistory("redo")}>↷</button>
           <GroupSelectionCheckbox label="Seleccionar todos los planos filtrados" ids={naturalFilteredRows.map((row) => row.shot.id)} selectedIds={selectedIds} onChange={(checked) => setSelectedIds(checked ? new Set(naturalFilteredRows.map((row) => row.shot.id)) : new Set())} />
           {selectedIds.size ? <><strong>{selectedIds.size} {selectedIds.size === 1 ? "plano seleccionado" : "planos seleccionados"}</strong><button type="button" disabled={operationBusy} onClick={() => void copyShot()}>Copiar</button><button type="button" disabled={operationBusy || !clipboardReady || !activeGroupId} title={!activeGroupId ? "Elige una escena de destino" : !clipboardReady ? "Copia planos de esta Shotlist antes de pegar" : undefined} onClick={() => void pasteShot()}>Pegar</button><button type="button" disabled={operationBusy || selectedIds.size > 50} title={selectedIds.size > 50 ? "Duplica hasta 50 planos por operación" : undefined} onClick={() => void duplicateShot()}>Duplicar ({selectedIds.size})</button><button type="button" disabled={operationBusy || selectedIds.size > 500} title={selectedIds.size > 500 ? "Elimina hasta 500 planos por operación" : undefined} onClick={() => void prepareDelete([...selectedIds])}>Eliminar ({selectedIds.size})</button><button type="button" onClick={() => setSelectedIds(new Set())}>Quitar selección</button></> : <span>Todos</span>}
         </div>
       </div>
      {shotlist.scriptId && (sourceChanges.missing.length > 0 || sourceChanges.renamed.length > 0 || sourceChanges.added.length > 0 || (sourceChanges.sourceRevision != null && sourceChanges.sourceRevision !== shotlist.sourceRevision)) && <div className="shotlist-source-warning" role="status"><span>El guion fuente cambió. Los planos se conservan.{sourceChanges.missing.length ? ` ${sourceChanges.missing.length} referencia(s) no disponible(s).` : ""}{sourceChanges.added.length ? ` ${sourceChanges.added.length} escena(s) nueva(s) disponibles para importar.` : ""}</span><button type="button" disabled={syncBusy || saveState === "saving"} onClick={() => void syncSource()}>{syncBusy ? "Actualizando…" : saveState === "error" ? "Reintentar vínculos" : "Actualizar vínculos"}</button></div>}
      {mode === "assisted" && <div className="shotlist-assisted-guide"><div><strong>Añadir lo detectado</strong><span>Writer no guarda aún instrucciones técnicas de cámara aceptadas para esta escena. Revisa el contexto y decide el plano; no se inventará cobertura.</span></div><button type="button" disabled={!activeGroupId} onClick={() => void addShot(activeGroupId)}>＋ Añadir plano para decidir</button><em>IA: 0 llamadas</em></div>}
      {mode === "suggested" && <div className="shotlist-mode-guidance"><strong>Propuesta sugerida</strong><span>Puede proponer cobertura nueva con IA. Nada se incorpora sin revisar y aceptar filas concretas.</span><button type="button" disabled={proposalBusy || !activeGroupId} onClick={() => void prepareProposal()}>{proposalBusy ? "Preparando…" : "✦ Sugerir planos"}</button></div>}
      {proposals.some((proposal) => proposal.status === "pending") && <div className="shotlist-proposals"><div><strong>Propuestas por revisar</strong><span>{proposals.filter((proposal) => proposal.status === "pending").length}</span></div>{proposals.filter((proposal) => proposal.status === "pending").map((proposal) => <label key={proposal.id}><input type="checkbox" checked={proposalSelection.has(proposal.id)} onChange={(event) => setProposalSelection((current) => { const next = new Set(current); if (event.target.checked) next.add(proposal.id); else next.delete(proposal.id); return next; })} /><span><b>{String(proposal.payload.shotType ?? "Plano")}</b><small>{String(proposal.payload.subject ?? "Sin sujeto")}</small></span></label>)}<footer><button type="button" disabled={proposalBusy || !proposalSelection.size} onClick={() => void decideProposals("dismiss")}>Descartar</button><button type="button" disabled={proposalBusy || !proposalSelection.size} onClick={() => void decideProposals("accept")}>Añadir seleccionados</button></footer></div>}
      <div className="shotlist-grid-scroll" onContextMenu={(event) => { if (event.target === event.currentTarget) setSelectedIds(new Set()); }}><div className="shotlist-grid-head" aria-hidden="true" style={gridStyle}>{columns.map((column) => <span key={column}>{SHOTLIST_COLUMNS.find((candidate) => candidate.key === column)?.label}</span>)}<span aria-hidden="true" /></div>{shotlist.groups.map((group, groupIndex) => {
        const groupRows = rowsByGroup.get(group.id) ?? []; const hasMatches = filteredRows.some((row) => row.group.id === group.id);
        if (!hasMatches && (search.trim() || filters.length)) return null;
        const groupFilteredIds = naturalFilteredRows.filter((row) => row.group.id === group.id).map((row) => row.shot.id);
        return <section key={group.id} id={`shot-group-${group.id}`} className="shotlist-group" style={groupStyle}><div className="shotlist-group-head"><GroupSelectionCheckbox label={`Seleccionar planos visibles de ${group.title}`} ids={groupFilteredIds} selectedIds={selectedIds} onChange={(checked) => toggleGroupSelection(group.id, checked)} /><button type="button" className="shotlist-group-toggle" title={group.title} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}><span>{expanded.has(group.id) ? "⌄" : "›"}</span><strong>{group.sourceStatus === "manual" ? "MANUAL" : `ESC. ${String(groupIndex + 1).padStart(2, "0")}`} · {group.title}</strong><small>· {group.shots.length} planos{group.sourceStatus === "missing" ? " · Referencia no disponible" : ""}</small></button><button type="button" className="shotlist-group-add" aria-label={`Añadir plano a ${group.title}`} title={`Añadir plano a ${group.title}`} onClick={() => void addShot(group.id, group.shots.length)}>＋</button><ShotlistMoreMenu label={`Acciones de ${group.title}`} canOpenWriter={Boolean(shotlist.scriptId && group.sourceSceneId)} onInsertAfter={() => openNewScene(group)} onDuplicate={() => void duplicateGroup(group)} onCopy={() => void copyGroup(group)} onOpenWriter={() => openWriter(group)} onDelete={() => void prepareDeleteGroup(group)} /></div>{expanded.has(group.id) && group.shots.length === 0 && <div className="shotlist-empty-group"><p>Esta escena aún no tiene planos.</p></div>}{expanded.has(group.id) && groupRows.map((row) => {
          const canonicalIndex = group.shots.findIndex((shot) => shot.id === row.shot.id);
          return <div key={row.shot.id} className="shotlist-row-wrap"><InsertionButton label="Añadir plano aquí" onInsert={() => void addShot(group.id, canonicalIndex)} /><ShotRow row={row} columns={columns} gridStyle={gridStyle} selected={selectedShotId === row.shot.id} checked={selectedIds.has(row.shot.id)} shotlist={shotlist} canPaste={clipboardReady} onSelect={() => selectShot(row.shot)} onContext={(x, y, trigger) => openContext(row.shot.id, x, y, trigger)} onPreview={() => openStoryboardPreview(row.shot)} onNavigate={(direction) => navigateRow(row.shot.id, direction)} onCheck={(checked, range) => toggleShotSelection(row.shot.id, checked, range)} onSave={(changes) => void saveShot(row.shot, changes)} onDuplicate={() => void duplicateShot(row.shot.id)} onCopy={() => void copyShot(row.shot.id)} onPaste={() => void pasteShot(row.shot.id)} onOpenWriter={() => openWriter(group, row.shot)} onDelete={() => void prepareDelete([row.shot.id])} onInsertAfter={() => void addShot(group.id, canonicalIndex + 1)} /></div>;
         })}{expanded.has(group.id) && <InsertionButton end label={`Añadir plano después del último de ${group.title}`} onInsert={() => void addShot(group.id, group.shots.length)} />}<InsertionButton scene label="Nueva escena aquí" onInsert={() => openNewScene(group)} /></section>;
      })}{!filteredRows.length && <p className="shotlist-no-results">No hay planos que coincidan. Los filtros no han modificado ni reordenado los datos.</p>}<div ref={loadMore} className="shotlist-load-more">{renderedRows.length < filteredRows.length ? `Cargando ${Math.min(240, filteredRows.length - renderedRows.length)} planos más…` : `${filteredRows.length} planos visibles`}</div></div>
    </main>
    {inspectorOpen && <ShotlistResizeHandle side="right" value={panelWidths.right} otherValue={panelWidths.left} workspaceRef={workspaceRef} onCommit={(width) => commitPanelWidth("right", width)} />}
    {inspectorOpen && <Inspector shotlist={shotlist} selectedShot={selectedShot} selectedGroup={selectedGroup} selectedRow={selectedRow} storyboardState={storyboardState} storyboardPanel={selectedStoryboardPanel} storyboardPanelCount={selectedStoryboardPanels.length} searchActive={Boolean(search.trim() || filters.length)} onClose={() => setInspectorOpen(false)} onSelect={selectShot} onSave={(shot, changes) => void saveShot(shot, changes)} onMove={(direction) => void moveShot(direction)} onDuplicate={() => void duplicateShot()} onDelete={() => selectedShot && void prepareDelete([selectedShot.id])} onOpenWriter={() => selectedGroup && selectedShot && openWriter(selectedGroup, selectedShot)} onPreview={() => selectedShot && openStoryboardPreview(selectedShot)} onUpload={uploadShotImage} />}
    {!inspectorOpen && <button type="button" className="shotlist-open-inspector" onClick={() => setInspectorOpen(true)}>Abrir inspector</button>}
    <NewSceneDialog open={newSceneOpen} anchorLabel={newSceneAnchor?.label} busy={dialogBusy} onClose={() => { if (!dialogBusy) { setNewSceneOpen(false); setNewSceneAnchor(null); } }} onCreate={(title) => void addGroup(title)} />
    <ShotlistImportDialog open={importOpen} shotlistId={shotlist.id} linkedScriptId={shotlist.scriptId} onClose={() => setImportOpen(false)} onImported={() => { clearHistory(); void reload(); }} />
    <ShotlistExportDialog key={`${exportOpen}:${exportFormat}`} open={exportOpen} initialFormat={exportFormat} visibleColumns={visibleColumns} totalCount={allRows.length} filteredCount={naturalFilteredRows.length} busy={exportBusy} onClose={() => setExportOpen(false)} onExport={(options) => void exportData(options)} />
    <ShotlistHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    <StoryboardCreateDialog open={storyboardCreateOpen} shotlistId={shotlist.id} onClose={() => setStoryboardCreateOpen(false)} />
    <StoryboardPreviewDialog open={Boolean(storyboardPreviewShotId)} shotlistId={shotlist.id} shotId={previewShot?.shot.id ?? null} shotNumber={previewShot?.number ?? null} shotSubject={previewShot?.shot.subject ?? null} panel={previewPanel} panelCount={previewPanels.length} onClose={() => setStoryboardPreviewShotId(null)} />
    <PasteFallbackDialog open={pasteFallbackOpen} value={pasteFallbackText} onChange={setPasteFallbackText} onClose={() => setPasteFallbackOpen(false)} onVerify={() => {
      const snapshot = clipboard.current;
      if (!snapshot || normalizeClipboardText(pasteFallbackText) !== normalizeClipboardText(snapshot.text)) { setError("El texto pegado no coincide con los planos copiados. Vuelve a copiarlos."); return; }
      void pasteVerified(snapshot, pasteAnchor.current);
    }} />
    <ShotlistContextMenu position={contextPosition} count={contextShotId ? commandRows(contextShotId).length : 0} canPaste={clipboardReady} onClose={closeContext} onCopy={() => void copyShot(contextShotId ?? undefined)} onPaste={() => void pasteShot(contextShotId ?? undefined)} onDuplicate={() => void duplicateShot(contextShotId ?? undefined)} onDelete={() => void prepareDelete(commandRows(contextShotId ?? undefined).map((row) => row.shot.id))} />
    <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget?.kind === "group" ? `Eliminar escena y ${deleteTarget.group.shots.length} plano(s)` : `Eliminar ${deleteTarget?.shotIds.length ?? 0} plano(s)`} description={<><p>{deleteTarget?.kind === "group" ? "Se eliminará este grupo y sus planos. La escena literaria de Writer no se borrará." : `La selección contiene ${deleteTarget?.shotIds.length ?? 0} plano(s).`}</p>{Boolean(deleteImpact?.panels) && <p>También se eliminarán {deleteImpact?.panels} panel(es) de Storyboard y {deleteImpact?.approvals} aprobación(es).</p>}{Boolean(deleteImpact?.productionItems) && <p>{deleteImpact?.productionItems} uso(s) en Production impiden eliminar estos planos.</p>}<p>Esta acción es definitiva y no se puede deshacer.</p></>} confirmLabel={deleteImpact?.panels ? "Eliminar planos y Storyboard" : "Eliminar definitivamente"} danger busy={dialogBusy} disabled={Boolean(deleteImpact?.productionItems)} onClose={() => { if (!dialogBusy) { setDeleteTarget(null); setDeleteImpact(null); } }} onConfirm={() => void performDelete(Boolean(deleteImpact?.panels))} />
  </div>;
}

function ShotRow({ row, columns, gridStyle, selected, checked, shotlist, canPaste, onSelect, onContext, onPreview, onNavigate, onCheck, onSave, onDuplicate, onCopy, onPaste, onOpenWriter, onDelete, onInsertAfter }: { row: ShotlistRowContext; columns: ShotlistColumnKey[]; gridStyle: CSSProperties; selected: boolean; checked: boolean; shotlist: WriterShotlist; canPaste: boolean; onSelect: () => void; onContext: (x: number, y: number, trigger: HTMLElement) => void; onPreview: () => void; onNavigate: (direction: -1 | 1) => void; onCheck: (checked: boolean, range: boolean) => void; onSave: (changes: Partial<WriterShot>) => void; onDuplicate: () => void; onCopy: () => void; onPaste: () => void; onOpenWriter: () => void; onDelete: () => void; onInsertAfter: () => void }) {
  return <div data-shot-id={row.shot.id} className={`shotlist-row${selected ? " is-selected" : ""}`} style={gridStyle} role="row" tabIndex={0} aria-label={`Plano ${row.number}: ${row.shot.subject || row.shot.shotType}`} onClick={onSelect} onContextMenu={(event) => { const target = event.target as HTMLElement; if (target.closest("input,textarea,select,button,a,[contenteditable='true']") || window.getSelection()?.toString()) return; event.preventDefault(); onContext(event.clientX, event.clientY, event.currentTarget); }} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter") { event.preventDefault(); onSelect(); } else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); onNavigate(event.key === "ArrowUp" ? -1 : 1); } }}>{columns.map((column) => <div key={column} role="cell" className={`shotlist-cell is-${column}`}>{renderCell(column, row, checked, onCheck, onSave, onPreview)}</div>)}<div className="shotlist-cell is-actions"><button type="button" className="shotlist-story-preview-button" onClick={(event) => { event.stopPropagation(); onPreview(); }} aria-label={`Vista previa del storyboard del plano ${row.number}`} title="Vista previa del storyboard">▧</button><ShotlistMoreMenu label={`Acciones del plano ${row.number}`} canOpenWriter={Boolean(shotlist.scriptId && row.group.sourceSceneId)} onInsertAfter={onInsertAfter} onDuplicate={onDuplicate} onCopy={onCopy} onPaste={onPaste} pasteDisabled={!canPaste} onOpenWriter={onOpenWriter} onDelete={onDelete} /></div></div>;
}

function renderCell(column: ShotlistColumnKey, row: ShotlistRowContext, checked: boolean, onCheck: (checked: boolean, range: boolean) => void, onSave: (changes: Partial<WriterShot>) => void, onPreview: () => void) {
  const shot = row.shot;
  if (column === "number") return <span className="shotlist-number"><input type="checkbox" aria-label={`Seleccionar plano ${row.number}`} checked={checked} onClick={(event) => event.stopPropagation()} onChange={(event) => onCheck(event.target.checked, Boolean((event.nativeEvent as MouseEvent).shiftKey))} />{String(row.number).padStart(2, "0")}</span>;
  if (column === "scene") return <span>ESC. {String(row.sceneNumber).padStart(2, "0")}</span>;
  if (column === "location") return <span title={row.location}>{row.location || "—"}</span>;
  if (column === "interiorExterior") return <span>{row.interiorExterior || "—"}</span>;
  if (column === "shotType") return <ShotlistBadgeSelect compact label="Tipología" value={shot.shotType} options={WRITER_SHOT_TYPES} onChange={(value) => value && onSave({ shotType: value })} />;
  if (column === "subject") return <CellInput label="Acción" value={shot.subject} revision={shot.revision} onSave={(value) => onSave({ subject: value })} />;
  if (column === "description") return <CellInput label="Descripción" value={shot.description ?? ""} revision={shot.revision} onSave={(value) => onSave({ description: value || null })} />;
  if (column === "lens") return <ShotlistBadgeSelect compact label="Óptica" value={shot.lens} options={SHOTLIST_LENSES} nullable onChange={(value) => onSave({ lens: value })} />;
  if (column === "composition") return <CellInput label="Composición" value={shot.composition ?? ""} revision={shot.revision} onSave={(value) => onSave({ composition: value || null })} />;
  if (column === "angle") return <ShotlistBadgeSelect compact label="Ángulo" value={shot.angle} options={WRITER_SHOT_ANGLES} onChange={(value) => value && onSave({ angle: value })} />;
  if (column === "movement") return <ShotlistBadgeSelect compact label="Movimiento" value={shot.movement} options={WRITER_SHOT_MOVEMENTS} onChange={(value) => value && onSave({ movement: value })} />;
  if (column === "support") return <ShotlistBadgeSelect compact label="Soporte" value={shot.support} options={SUPPORT_OPTIONS} nullable onChange={(value) => onSave({ support: value })} />;
  if (column === "setup") return <CellInput label="Setup" value={shot.setup ?? ""} revision={shot.revision} onSave={(value) => onSave({ setup: value || null })} />;
  if (column === "durationSeconds") return <input aria-label="Duración en segundos" type="number" min="0" key={`${shot.id}-duration-${shot.revision}`} defaultValue={shot.durationSeconds ?? ""} onClick={(event) => event.stopPropagation()} onBlur={(event) => { const value = event.target.value === "" ? null : Number(event.target.value); if (value !== shot.durationSeconds) onSave({ durationSeconds: value }); }} />;
  if (column === "status") return <ShotlistBadgeSelect compact label="Estado" value={shot.status === "ready" ? "Listo" : "Pendiente"} options={["Pendiente", "Listo"]} allowCustom={false} onChange={(value) => onSave({ status: value === "Listo" ? "ready" : "pending" })} />;
  if (column === "notes") return <CellInput label="Observaciones" value={shot.notes ?? ""} revision={shot.revision} onSave={(value) => onSave({ notes: value || null })} />;
  if (column === "storyboard") return <button type="button" className="shotlist-story-cell" onClick={(event) => { event.stopPropagation(); onPreview(); }} aria-label={`Vista previa del storyboard del plano ${row.number}`}>▧</button>;
  return null;
}

function CellInput({ label, value, revision, onSave }: { label: string; value: string; revision: number; onSave: (value: string) => void }) { return <input aria-label={label} key={`${label}-${revision}`} defaultValue={value} onClick={(event) => event.stopPropagation()} onBlur={(event) => { if (event.target.value !== value) onSave(event.target.value); }} />; }
function InsertionButton({ label, onInsert, scene = false, end = false }: { label: string; onInsert: () => void; scene?: boolean; end?: boolean }) { return <div className={`shotlist-insert-slot${scene ? " is-scene" : ""}${end ? " is-end" : ""}`}><button type="button" onClick={onInsert} aria-label={label} title={label}><span aria-hidden="true">+</span></button></div>; }

function GroupSelectionCheckbox({ label, ids, selectedIds, onChange }: { label: string; ids: string[]; selectedIds: ReadonlySet<string>; onChange: (checked: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const checked = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const mixed = ids.some((id) => selectedIds.has(id)) && !checked;
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <label className="shotlist-group-select" title={label}><input ref={input} type="checkbox" aria-label={label} checked={checked} disabled={!ids.length} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function Inspector({ shotlist, selectedShot, selectedGroup, selectedRow, storyboardState, storyboardPanel, storyboardPanelCount, searchActive, onClose, onSelect, onSave, onMove, onDuplicate, onDelete, onOpenWriter, onPreview, onUpload }: { shotlist: WriterShotlist; selectedShot: WriterShot | null; selectedGroup: WriterShotlistGroup | null; selectedRow: ShotlistRowContext | null; storyboardState: "loading" | "empty" | "existing" | "error"; storyboardPanel: StoryboardPanel | null; storyboardPanelCount: number; searchActive: boolean; onClose: () => void; onSelect: (shot: WriterShot) => void; onSave: (shot: WriterShot, changes: Partial<WriterShot>) => void; onMove: (direction: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void; onOpenWriter: () => void; onPreview: () => void; onUpload: (shot: WriterShot, file: File) => void }) {
  if (!selectedShot || !selectedGroup || !selectedRow) return <aside className="shotlist-inspector"><div className="shotlist-inspector-empty"><button type="button" onClick={onClose}>×</button><p>Selecciona un plano para editarlo.</p></div></aside>;
  const allShots = shotlist.groups.flatMap((group) => group.shots); const index = allShots.indexOf(selectedShot);
  return <aside className="shotlist-inspector"><div className="shotlist-inspector-head"><div><h2>PLANO {String(selectedRow.number).padStart(2, "0")}</h2><span>{selectedGroup.sourceStatus === "manual" ? "GRUPO MANUAL" : `ESC. ${String(selectedRow.sceneNumber).padStart(2, "0")}`} · {selectedGroup.title}</span></div><button type="button" disabled={index <= 0} onClick={() => onSelect(allShots[index - 1]!)} aria-label="Plano anterior">‹</button><button type="button" disabled={index >= allShots.length - 1} onClick={() => onSelect(allShots[index + 1]!)} aria-label="Plano siguiente">›</button><button type="button" onClick={onClose} aria-label="Cerrar inspector">×</button></div>
    <ShotField label="Tipología"><ShotlistBadgeSelect label="Tipología" value={selectedShot.shotType} options={WRITER_SHOT_TYPES} onChange={(value) => value && onSave(selectedShot, { shotType: value })} /></ShotField><ShotField label="Acción"><CellInput label="Acción" value={selectedShot.subject} revision={selectedShot.revision} onSave={(value) => onSave(selectedShot, { subject: value })} /></ShotField>
    <div className="shotlist-field-pair"><ShotField label="Óptica"><ShotlistBadgeSelect label="Óptica" value={selectedShot.lens} options={SHOTLIST_LENSES} nullable onChange={(value) => onSave(selectedShot, { lens: value })} /></ShotField><ShotField label="Movimiento"><ShotlistBadgeSelect label="Movimiento" value={selectedShot.movement} options={WRITER_SHOT_MOVEMENTS} onChange={(value) => value && onSave(selectedShot, { movement: value })} /></ShotField></div>
    <div className="shotlist-field-pair"><ShotField label="Ángulo"><ShotlistBadgeSelect label="Ángulo" value={selectedShot.angle} options={WRITER_SHOT_ANGLES} onChange={(value) => value && onSave(selectedShot, { angle: value })} /></ShotField><ShotField label="Soporte"><ShotlistBadgeSelect label="Soporte" value={selectedShot.support} options={SUPPORT_OPTIONS} nullable onChange={(value) => onSave(selectedShot, { support: value })} /></ShotField></div>
    <div className="shotlist-field-pair"><ShotField label="Setup"><CellInput label="Setup" value={selectedShot.setup ?? ""} revision={selectedShot.revision} onSave={(value) => onSave(selectedShot, { setup: value || null })} /></ShotField><ShotField label="Duración (s)"><input type="number" min="0" key={`${selectedShot.id}-inspector-duration-${selectedShot.revision}`} defaultValue={selectedShot.durationSeconds ?? ""} onBlur={(event) => { const value = event.target.value === "" ? null : Number(event.target.value); if (value !== selectedShot.durationSeconds) onSave(selectedShot, { durationSeconds: value }); }} /></ShotField></div>
    <ShotField label="Descripción"><textarea key={`${selectedShot.id}-description-${selectedShot.revision}`} defaultValue={selectedShot.description ?? ""} onBlur={(event) => { if (event.target.value !== (selectedShot.description ?? "")) onSave(selectedShot, { description: event.target.value || null }); }} /></ShotField><ShotField label="Intención"><textarea key={`${selectedShot.id}-intention-${selectedShot.revision}`} defaultValue={selectedShot.intention ?? ""} onBlur={(event) => { if (event.target.value !== (selectedShot.intention ?? "")) onSave(selectedShot, { intention: event.target.value || null }); }} /></ShotField><ShotField label="Observaciones"><textarea key={`${selectedShot.id}-notes-${selectedShot.revision}`} defaultValue={selectedShot.notes ?? ""} onBlur={(event) => { if (event.target.value !== (selectedShot.notes ?? "")) onSave(selectedShot, { notes: event.target.value || null }); }} /></ShotField>
    {shotlist.scriptId && selectedGroup.sourceSceneId && <button type="button" className="shotlist-edit-writer" onClick={onOpenWriter}>Ver en guion ↗</button>}
    <div className="shotlist-storyboard"><h3>Storyboard</h3><div><button type="button" className="shotlist-inspector-preview" onClick={onPreview} disabled={storyboardState === "loading" || storyboardState === "error"}>{storyboardState === "loading" ? <span>Cargando storyboard…</span> : storyboardState === "error" ? <span>No pudimos cargar el storyboard.</span> : <StoryboardPreviewImage panel={storyboardPanel} alt={`Storyboard del plano ${selectedRow.number}`} />}</button><strong>{storyboardPanel ? "Vista previa del storyboard" : "Sin storyboard"}</strong>{storyboardPanelCount > 1 && <p>{storyboardPanelCount} paneles · se muestra el primero con contenido</p>}<Link href={storyboardPanel ? `/shotlists/${shotlist.id}/storyboard/shots/${selectedShot.id}?panel=${storyboardPanel.id}` : `/shotlists/${shotlist.id}/storyboard#story-shot-${selectedShot.id}`}>Abrir en Storyboard</Link><label>⇧ {selectedShot.assetId ? "Cambiar referencia del plano" : "Subir referencia del plano"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(selectedShot, file); event.target.value = ""; }} /></label></div></div>
    <div className="shotlist-inspector-actions"><button type="button" disabled={searchActive || selectedGroup.shots[0]?.id === selectedShot.id} title={searchActive ? "Quita los filtros para reordenar" : "Mover arriba"} onClick={() => onMove(-1)}>↑ Subir</button><button type="button" disabled={searchActive || selectedGroup.shots.at(-1)?.id === selectedShot.id} title={searchActive ? "Quita los filtros para reordenar" : "Mover abajo"} onClick={() => onMove(1)}>↓ Bajar</button><button type="button" onClick={onDuplicate}>Duplicar</button><button type="button" onClick={onDelete}>Eliminar</button></div>
  </aside>;
}

function ShotField({ label, children }: { label: string; children: ReactNode }) { return <label className="shotlist-field"><span>{label}</span>{children}</label>; }
function representativeStoryboardPanel(panels: StoryboardPanel[]) { return panels.find((panel) => panel.previewAssetId && panel.currentRevision.contentKind !== "empty") ?? panels.find((panel) => panel.currentRevision.contentKind !== "empty") ?? panels[0] ?? null; }
function shotCopy(shot: WriterShot): ShotCopy { return Object.fromEntries(COPY_FIELDS.map((field) => [field, shot[field]])) as ShotCopy; }
function normalizeClipboardText(value: string) { return value.replace(/\r\n?/gu, "\n"); }
function matchesShotFields(shot: WriterShot, fields: Partial<WriterShot>) { return Object.entries(fields).every(([key, value]) => shot[key as keyof WriterShot] === value); }
function message(cause: unknown, fallback: string) { return cause instanceof Error && cause.message ? cause.message : fallback; }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
