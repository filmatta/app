"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { ConfirmDialog, NewSceneDialog, ShotlistHelpDialog, StoryboardCreateDialog, StoryboardPreviewDialog, StoryboardPreviewImage } from "./ShotlistDialogs";
import ShotlistExportDialog from "./ShotlistExportDialog";
import ShotlistFilters from "./ShotlistFilters";
import ShotlistImportDialog from "./ShotlistImportDialog";
import ShotlistMoreMenu from "./ShotlistMoreMenu";
import {
  parseWriterInternalHistory,
  recordWriterInternalRoute,
  stepWriterInternalHistory,
  writerInternalHistoryStorageKey,
  type WriterInternalHistory,
} from "@/lib/writer/internal-navigation";
import type { StoryboardBoard, StoryboardPanel } from "@/lib/storyboard/types";

type SourceChanges = { renamed: Array<{ groupId: string; sceneId: string; title: string }>; reordered: boolean; missing: string[]; added: Array<{ sceneId: string; title: string }> };
type Mode = "manual" | "assisted" | "suggested";
type ShotProposal = { id: string; group_id: string; payload: Partial<WriterShot>; status: "pending" | "accepted" | "dismissed" };
type DeleteTarget = { kind: "shot"; shotIds: string[] } | { kind: "group"; group: WriterShotlistGroup };

const SUPPORT_OPTIONS = ["Trípode", "Monopié", "Hombro", "Handheld", "Gimbal", "Steadicam", "Dolly", "Grúa", "Drone"];
const COLUMN_WIDTHS: Record<ShotlistColumnKey, number> = { number: 66, scene: 84, location: 150, interiorExterior: 78, shotType: 142, subject: 210, description: 240, lens: 108, composition: 130, angle: 120, movement: 132, support: 120, setup: 90, durationSeconds: 94, status: 112, notes: 240, storyboard: 86 };
const ACTION_COLUMN_WIDTH = 78;
const DEFAULT_COLUMNS = new Set(SHOTLIST_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key));

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
  const [deleteImpact, setDeleteImpact] = useState<{ panels: number; approvals: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("pdf");
  const [exportBusy, setExportBusy] = useState(false);
  const [revealedShotId, setRevealedShotId] = useState<string | null>(null);
  const [internalHistory, setInternalHistory] = useState<WriterInternalHistory>({ entries: [], index: -1 });
  const [visibleLimit, setVisibleLimit] = useState(240);
  const loadMore = useRef<HTMLDivElement>(null);

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
  const filteredRows = useMemo(() => revealedShotId && !naturalFilteredRows.some((row) => row.shot.id === revealedShotId) ? [...naturalFilteredRows, ...allRows.filter((row) => row.shot.id === revealedShotId)] : naturalFilteredRows, [allRows, naturalFilteredRows, revealedShotId]);
  const renderedRows = filteredRows.slice(0, visibleLimit);
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

  async function api(body: Record<string, unknown>) {
    const response = await fetch(`/api/shotlists/${shotlist.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) { const failure = new Error(data.error ?? "No pudimos guardar el cambio.") as Error & { code?: string; impact?: { panels: number; approvals: number } }; failure.code = data.code; failure.impact = data.impact; throw failure; }
    return data;
  }

  function replaceShot(next: WriterShot) { setShotlist((current) => ({ ...current, groups: current.groups.map((group) => group.id === next.groupId ? { ...group, shots: group.shots.map((shot) => shot.id === next.id ? next : shot) } : group) })); }

  async function saveShot(shot: WriterShot, changes: Partial<WriterShot>) {
    const previous = shot; const next = { ...shot, ...changes };
    replaceShot(next); setSaveState("saving"); setError(null);
    const payloadChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => !["id", "shotlistId", "groupId", "revision", "position", "origin", "assetId", "sourceRevision"].includes(key)));
    try { const response = await api({ action: "updateShot", shotId: shot.id, expectedRevision: shot.revision, changes: payloadChanges }); replaceShot({ ...next, revision: Number(response.revision ?? shot.revision + 1) }); setSaveState("saved"); }
    catch (cause) { replaceShot(previous); setSaveState("error"); setError(message(cause, "No pudimos guardar el plano.")); }
  }

  async function reload(preferredId?: string) {
    const response = await fetch(`/api/shotlists/${shotlist.id}`, { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No pudimos actualizar la shotlist.");
    setShotlist(data.shotlist); setSourceChanges(data.sourceChanges); if (preferredId) setSelectedShotId(preferredId); setSaveState("saved");
  }

  async function addShot(groupId = activeGroupId, targetIndex?: number) {
    if (!groupId) return;
    setSaveState("saving"); setError(null);
    try {
      const result = await api({ action: "addShot", groupId, origin: mode === "assisted" ? "assisted" : "manual", operationId: crypto.randomUUID(), ...(targetIndex == null ? {} : { targetIndex }) });
      await reload(result.id); setInspectorOpen(true); setExpanded((current) => new Set(current).add(groupId)); setRevealedShotId(result.id);
      if (search.trim() || filters.length) setNotice("El plano nuevo se muestra temporalmente aunque no coincida con los filtros activos.");
    } catch (cause) { setSaveState("error"); setError(message(cause, "No pudimos añadir el plano.")); }
  }

  function openNewScene(afterGroup?: WriterShotlistGroup) { setNewSceneAnchor(afterGroup ? { index: shotlist.groups.indexOf(afterGroup) + 1, label: afterGroup.title } : null); setNewSceneOpen(true); }

  async function addGroup(title: string) {
    if (dialogBusy) return;
    setDialogBusy(true); setError(null);
    try { const result = await api({ action: "addGroup", title, operationId: crypto.randomUUID(), ...(newSceneAnchor ? { targetIndex: newSceneAnchor.index } : {}) }); await reload(); setActiveGroupId(result.id); setExpanded((current) => new Set(current).add(result.id)); setNewSceneOpen(false); setNewSceneAnchor(null); }
    catch (cause) { setError(message(cause, "No pudimos crear la escena.")); }
    finally { setDialogBusy(false); }
  }

  async function duplicateShot(shot = selectedShot) { if (!shot) return; try { const result = await api({ action: "duplicateShot", shotId: shot.id, operationId: crypto.randomUUID() }); await reload(result.id); setExpanded((current) => new Set(current).add(shot.groupId)); } catch (cause) { setError(message(cause, "No pudimos duplicar el plano.")); } }
  async function duplicateGroup(group: WriterShotlistGroup) { try { const result = await api({ action: "duplicateGroup", groupId: group.id, operationId: crypto.randomUUID() }); await reload(); setActiveGroupId(result.id); setExpanded((current) => new Set(current).add(result.id)); } catch (cause) { setError(message(cause, "No pudimos duplicar el grupo.")); } }
  async function copyShot(row = selectedRow) { if (!row) return; await navigator.clipboard.writeText(shotClipboardText(row)); setNotice("Plano copiado como texto legible."); }
  async function copyGroup(group: WriterShotlistGroup) { await navigator.clipboard.writeText(groupClipboardText(group, shotlist.groups.indexOf(group) + 1, allRows)); setNotice("Grupo copiado como texto legible."); }
  async function copyPrivateLink() { await navigator.clipboard.writeText(location.href); setNotice("Enlace privado copiado. No concede acceso a otras personas."); }

  async function moveShot(direction: -1 | 1) {
    if (!selectedShot || !selectedGroup || search.trim() || filters.length) return;
    const currentIndex = selectedGroup.shots.findIndex((shot) => shot.id === selectedShot.id); const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= selectedGroup.shots.length) return;
    setSaveState("saving"); setError(null);
    try { await api({ action: "reorderShot", shotId: selectedShot.id, targetIndex }); await reload(selectedShot.id); }
    catch (cause) { setSaveState("error"); setError(message(cause, "No pudimos mover el plano.")); }
  }

  async function performDelete(deleteStoryboard = false) {
    if (!deleteTarget || dialogBusy) return;
    setDialogBusy(true); setError(null);
    try {
      if (deleteTarget.kind === "shot") await api({ action: "deleteShots", shotIds: deleteTarget.shotIds, ...(deleteStoryboard ? { deleteStoryboard: true } : {}) });
      else await api({ action: "deleteGroup", groupId: deleteTarget.group.id, ...(deleteStoryboard ? { deleteStoryboard: true } : {}) });
      setDeleteTarget(null); setDeleteImpact(null); setSelectedIds(new Set()); setSelectedShotId(null); await reload();
    } catch (cause) {
      const failure = cause as Error & { code?: string; impact?: { panels: number; approvals: number } };
      if (failure.code === "storyboard_dependencies" && failure.impact) setDeleteImpact(failure.impact);
      else { setDeleteTarget(null); setError(message(cause, "No pudimos eliminar la selección.")); }
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
    try { const response = await fetch(`/api/shotlists/${shotlist.id}/proposals`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, proposalIds }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No pudimos aplicar la decisión."); setProposals((current) => current.map((proposal) => proposalIds.includes(proposal.id) ? { ...proposal, status: action === "accept" ? "accepted" : "dismissed" } : proposal)); setProposalSelection(new Set()); if (action === "accept") await reload(); }
    catch (cause) { setError(message(cause, "No pudimos aplicar la decisión.")); }
    finally { setProposalBusy(false); }
  }

  async function syncSource() { setSaveState("saving"); setError(null); try { await api({ action: "syncSource", includeAdded: sourceChanges.added.length > 0 }); await reload(selectedShotId ?? undefined); } catch (cause) { setSaveState("error"); setError(message(cause, "No pudimos actualizar los vínculos.")); } }

  async function uploadShotImage(shot: WriterShot, file: File) { setSaveState("saving"); setError(null); try { const form = new FormData(); form.set("file", file); form.set("targetType", "shot"); form.set("targetId", shot.id); const response = await fetch("/api/writer/production-assets", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No pudimos subir la referencia."); await reload(shot.id); } catch (cause) { setSaveState("error"); setError(message(cause, "No pudimos subir la referencia.")); } }

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
  function menuDelete() { if (selectedTextActive()) return setNotice("Hay texto seleccionado. La fila no se eliminó."); const ids = selectedIds.size ? [...selectedIds] : selectedShot ? [selectedShot.id] : []; if (ids.length) setDeleteTarget({ kind: "shot", shotIds: ids }); }
  function openStoryboardPreview(shot: WriterShot) { selectShot(shot); setStoryboardPreviewShotId(shot.id); }
  function navigateInternalHistory(direction: -1 | 1) {
    if (saveState !== "saved") { setNotice("Espera a que termine el guardado antes de navegar."); return; }
    const step = stepWriterInternalHistory(internalHistory, direction);
    if (!step) return;
    window.sessionStorage.setItem(writerInternalHistoryStorageKey(userId), JSON.stringify(step.history));
    setInternalHistory(step.history);
    router.push(step.route);
  }

  return <div className={`shotlist-workspace${inspectorOpen ? " has-inspector" : ""}`}>
    <ShotlistApplicationMenu canBack={saveState === "saved" && internalHistory.index > 0} canForward={saveState === "saved" && internalHistory.index >= 0 && internalHistory.index < internalHistory.entries.length - 1} hasSelection={Boolean(selectedShot || selectedIds.size)} visibleColumns={visibleColumns} onBack={() => navigateInternalHistory(-1)} onForward={() => navigateInternalHistory(1)} onNew={() => void createNewShotlist()} onImport={() => setImportOpen(true)} onExport={openExport} onCopyLink={() => void copyPrivateLink()} onDuplicate={() => { if (!selectedTextActive()) void duplicateShot(); }} onCopy={() => { if (!selectedTextActive()) void copyShot(); }} onDelete={menuDelete} onInsertShot={() => void addShot(selectedShot?.groupId ?? activeGroupId, selectedGroup && selectedShot ? selectedGroup.shots.findIndex((shot) => shot.id === selectedShot.id) + 1 : undefined)} onInsertScene={() => openNewScene(selectedGroup ?? undefined)} onToggleColumn={toggleColumn} onShortcuts={() => setHelpOpen(true)} />
    <header className="shotlist-header">
      <div className="shotlist-brand"><Link href="/">FILMATTA</Link><span /><Link href="/shotlists">Shotlist Beta</Link><i>•</i><input aria-label="Nombre de la shotlist" defaultValue={shotlist.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== shotlist.title) void api({ action: "rename", title }).then(() => setShotlist((value) => ({ ...value, title }))).catch((cause) => setError(cause.message)); }} /></div>
      <div className="shotlist-header-actions"><span className={`shotlist-save is-${saveState}`}>● {saveState === "saved" ? "Guardado" : saveState === "saving" ? "Guardando…" : "Error"}</span>{storyboardState === "existing" ? <Link href={`/shotlists/${shotlist.id}/storyboard`}>▧ Abrir Storyboard</Link> : storyboardState === "empty" ? <button type="button" onClick={() => setStoryboardCreateOpen(true)}>▧ Crear Storyboard</button> : storyboardState === "loading" ? <button type="button" disabled>Comprobando Storyboard…</button> : <button type="button" onClick={() => location.reload()}>Reintentar Storyboard</button>}<span className="shotlist-avatar">{shotlist.title.slice(0, 2).toUpperCase()}</span></div>
    </header>
    <div className="shotlist-workbar"><div className="shotlist-modes" role="group" aria-label="Modo de trabajo">{(["manual", "assisted", "suggested"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "manual" ? "✎ Libre" : value === "assisted" ? "◉ Asistido" : "✦ Sugerido"}</button>)}</div><button className="shotlist-primary" type="button" onClick={() => void addShot()}>＋ Plano</button><button className="shotlist-tool" type="button" onClick={() => setImportOpen(true)}>⇩ Importar</button><button className="shotlist-tool" type="button" onClick={() => openExport("pdf")}>⇧ Exportar</button><div className="shotlist-summary"><b>{summary.totalShots}</b> planos <i>•</i> <b>{summary.plannedGroups}</b>/{summary.totalGroups} escenas <i>•</i> {duration}{summary.missingDurations ? ` · ${summary.missingDurations} sin estimar` : ""}</div></div>
    {(sourceChanges.missing.length > 0 || sourceChanges.renamed.length > 0 || sourceChanges.reordered || sourceChanges.added.length > 0) && <div className="shotlist-source-warning">El guion fuente cambió. Los planos se conservarán. <button type="button" onClick={() => void syncSource()}>Actualizar vínculos{sourceChanges.added.length ? ` y añadir ${sourceChanges.added.length} escena(s)` : ""}</button></div>}
    {notice && <div className="shotlist-notice" role="status">{notice}<button type="button" onClick={() => setNotice(null)}>Cerrar</button></div>}
    {error && <div className="shotlist-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>Cerrar</button></div>}
    <aside className="shotlist-scenes"><h2>Escenas</h2><label><span>⌕</span><input value={sceneSearch} onChange={(event) => setSceneSearch(event.target.value)} placeholder="Buscar escenas…" /></label><ol>{shotlist.groups.filter((group) => group.title.toLocaleLowerCase("es-MX").includes(sceneSearch.trim().toLocaleLowerCase("es-MX"))).map((group, index) => <li key={group.id} className={activeGroupId === group.id ? "is-active" : ""}><button type="button" onClick={() => { setActiveGroupId(group.id); setExpanded((current) => new Set(current).add(group.id)); document.getElementById(`shot-group-${group.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{group.title}</strong><small>{group.shots.length} {group.shots.length === 1 ? "plano" : "planos"}{group.sourceStatus === "manual" ? " · manual" : group.sourceStatus === "missing" ? " · fuente no disponible" : ""}</small></button></li>)}</ol><button className="shotlist-new-scene" type="button" aria-haspopup="dialog" aria-expanded={newSceneOpen} onClick={() => openNewScene()}>＋ Nueva escena</button></aside>
    <main className="shotlist-grid-panel">
      <div className="shotlist-grid-title"><h1>Lista de planos</h1><label><span>⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleLimit(240); setRevealedShotId(null); }} placeholder="Buscar descripción u observaciones…" /></label><ShotlistFilters filters={filters} filteredCount={naturalFilteredRows.length} totalCount={allRows.length} onAdd={(filter) => { setFilters((current) => [...current, filter]); setVisibleLimit(240); setRevealedShotId(null); }} onRemove={(id) => { setFilters((current) => current.filter((filter) => filter.id !== id)); setVisibleLimit(240); setRevealedShotId(null); }} onClear={() => { setFilters([]); setVisibleLimit(240); setRevealedShotId(null); }} /></div>
      {mode === "assisted" && <div className="shotlist-assisted-guide"><div><strong>Añadir lo detectado</strong><span>Writer no guarda aún instrucciones técnicas de cámara aceptadas para esta escena. Revisa el contexto y decide el plano; no se inventará cobertura.</span></div><button type="button" disabled={!activeGroupId} onClick={() => void addShot(activeGroupId)}>＋ Añadir plano para decidir</button><em>IA: 0 llamadas</em></div>}
      {mode === "suggested" && <div className="shotlist-mode-guidance"><strong>Propuesta sugerida</strong><span>Puede proponer cobertura nueva con IA. Nada se incorpora sin revisar y aceptar filas concretas.</span><button type="button" disabled={proposalBusy || !activeGroupId} onClick={() => void prepareProposal()}>{proposalBusy ? "Preparando…" : "✦ Sugerir planos"}</button></div>}
      {proposals.some((proposal) => proposal.status === "pending") && <div className="shotlist-proposals"><div><strong>Propuestas por revisar</strong><span>{proposals.filter((proposal) => proposal.status === "pending").length}</span></div>{proposals.filter((proposal) => proposal.status === "pending").map((proposal) => <label key={proposal.id}><input type="checkbox" checked={proposalSelection.has(proposal.id)} onChange={(event) => setProposalSelection((current) => { const next = new Set(current); if (event.target.checked) next.add(proposal.id); else next.delete(proposal.id); return next; })} /><span><b>{String(proposal.payload.shotType ?? "Plano")}</b><small>{String(proposal.payload.subject ?? "Sin sujeto")}</small></span></label>)}<footer><button type="button" disabled={proposalBusy || !proposalSelection.size} onClick={() => void decideProposals("dismiss")}>Descartar</button><button type="button" disabled={proposalBusy || !proposalSelection.size} onClick={() => void decideProposals("accept")}>Añadir seleccionados</button></footer></div>}
      <div className="shotlist-grid-scroll"><div className="shotlist-grid-head" aria-hidden="true" style={gridStyle}>{columns.map((column) => <span key={column}>{SHOTLIST_COLUMNS.find((candidate) => candidate.key === column)?.label}</span>)}<span aria-hidden="true" /></div>{shotlist.groups.map((group, groupIndex) => {
        const groupRows = rowsByGroup.get(group.id) ?? []; const hasMatches = filteredRows.some((row) => row.group.id === group.id);
        if (!hasMatches && (search.trim() || filters.length)) return null;
        const isLastGroup = groupIndex === shotlist.groups.length - 1;
        return <section key={group.id} id={`shot-group-${group.id}`} className="shotlist-group" style={groupStyle}><div className="shotlist-group-head"><button type="button" className="shotlist-group-toggle" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}><span>{expanded.has(group.id) ? "⌄" : "›"}</span><strong>{group.sourceStatus === "manual" ? "MANUAL" : `ESC. ${String(groupIndex + 1).padStart(2, "0")}`} · {group.title}</strong><small>· {group.shots.length} planos</small></button><ShotlistMoreMenu label={`Acciones de ${group.title}`} canOpenWriter={Boolean(shotlist.scriptId && group.sourceSceneId)} onInsertAfter={() => openNewScene(group)} onDuplicate={() => void duplicateGroup(group)} onCopy={() => void copyGroup(group)} onOpenWriter={() => openWriter(group)} onDelete={() => setDeleteTarget({ kind: "group", group })} /></div>{expanded.has(group.id) && group.shots.length === 0 && <div className="shotlist-empty-group"><p>Esta escena aún no tiene planos.</p><button type="button" onClick={() => void addShot(group.id, 0)}>＋ Añadir primer plano</button></div>}{expanded.has(group.id) && groupRows.map((row) => {
          const canonicalIndex = group.shots.findIndex((shot) => shot.id === row.shot.id);
          return <div key={row.shot.id} className="shotlist-row-wrap"><InsertionButton label="Añadir plano aquí" onInsert={() => void addShot(group.id, canonicalIndex)} /><ShotRow row={row} columns={columns} gridStyle={gridStyle} selected={selectedShotId === row.shot.id} checked={selectedIds.has(row.shot.id)} shotlist={shotlist} onSelect={() => selectShot(row.shot)} onPreview={() => openStoryboardPreview(row.shot)} onNavigate={(direction) => navigateRow(row.shot.id, direction)} onCheck={(checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(row.shot.id); else next.delete(row.shot.id); return next; })} onSave={(changes) => void saveShot(row.shot, changes)} onDuplicate={() => void duplicateShot(row.shot)} onCopy={() => void copyShot(row)} onOpenWriter={() => openWriter(group, row.shot)} onDelete={() => setDeleteTarget({ kind: "shot", shotIds: [row.shot.id] })} onInsertAfter={() => void addShot(group.id, canonicalIndex + 1)} /></div>;
        })}{expanded.has(group.id) && groupRows.length > 0 && <InsertionButton end label={isLastGroup ? "Añadir plano al final de la shotlist" : "Añadir plano al final de esta escena"} onInsert={() => void addShot(group.id, group.shots.length)} />}<InsertionButton scene label="Nueva escena aquí" onInsert={() => openNewScene(group)} /></section>;
      })}{!filteredRows.length && <p className="shotlist-no-results">No hay planos que coincidan. Los filtros no han modificado ni reordenado los datos.</p>}<div ref={loadMore} className="shotlist-load-more">{renderedRows.length < filteredRows.length ? `Cargando ${Math.min(240, filteredRows.length - renderedRows.length)} planos más…` : `${filteredRows.length} planos visibles`}</div></div>
      {selectedIds.size > 0 && <div className="shotlist-bulk"><strong>{selectedIds.size} seleccionados</strong><button type="button" onClick={() => void api({ action: "bulkStatus", shotIds: [...selectedIds], status: "ready" }).then(() => reload())}>Marcar Listos</button><button type="button" onClick={() => setDeleteTarget({ kind: "shot", shotIds: [...selectedIds] })}>Eliminar</button></div>}
    </main>
    {inspectorOpen && <Inspector shotlist={shotlist} selectedShot={selectedShot} selectedGroup={selectedGroup} selectedRow={selectedRow} storyboardState={storyboardState} storyboardPanel={selectedStoryboardPanel} storyboardPanelCount={selectedStoryboardPanels.length} searchActive={Boolean(search.trim() || filters.length)} onClose={() => setInspectorOpen(false)} onSelect={selectShot} onSave={(shot, changes) => void saveShot(shot, changes)} onMove={(direction) => void moveShot(direction)} onDuplicate={() => void duplicateShot()} onDelete={() => selectedShot && setDeleteTarget({ kind: "shot", shotIds: [selectedShot.id] })} onOpenWriter={() => selectedGroup && selectedShot && openWriter(selectedGroup, selectedShot)} onPreview={() => selectedShot && openStoryboardPreview(selectedShot)} onUpload={uploadShotImage} />}
    {!inspectorOpen && <button type="button" className="shotlist-open-inspector" onClick={() => setInspectorOpen(true)}>Abrir inspector</button>}
    <NewSceneDialog open={newSceneOpen} anchorLabel={newSceneAnchor?.label} busy={dialogBusy} onClose={() => { if (!dialogBusy) { setNewSceneOpen(false); setNewSceneAnchor(null); } }} onCreate={(title) => void addGroup(title)} />
    <ShotlistImportDialog open={importOpen} shotlistId={shotlist.id} linkedScriptId={shotlist.scriptId} onClose={() => setImportOpen(false)} onImported={() => reload()} />
    <ShotlistExportDialog key={`${exportOpen}:${exportFormat}`} open={exportOpen} initialFormat={exportFormat} visibleColumns={visibleColumns} totalCount={allRows.length} filteredCount={naturalFilteredRows.length} busy={exportBusy} onClose={() => setExportOpen(false)} onExport={(options) => void exportData(options)} />
    <ShotlistHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    <StoryboardCreateDialog open={storyboardCreateOpen} shotlistId={shotlist.id} onClose={() => setStoryboardCreateOpen(false)} />
    <StoryboardPreviewDialog open={Boolean(storyboardPreviewShotId)} shotlistId={shotlist.id} shotId={previewShot?.shot.id ?? null} shotNumber={previewShot?.number ?? null} shotSubject={previewShot?.shot.subject ?? null} panel={previewPanel} panelCount={previewPanels.length} onClose={() => setStoryboardPreviewShotId(null)} />
    <ConfirmDialog open={Boolean(deleteTarget)} title={deleteTarget?.kind === "group" ? "Eliminar grupo" : "Eliminar plano"} description={deleteImpact ? <p>También se eliminarán {deleteImpact.panels} panel(es) de Storyboard y {deleteImpact.approvals} aprobación(es). Esta acción es definitiva.</p> : <p>{deleteTarget?.kind === "group" ? "Se eliminará el grupo y sus planos. La escena literaria de Writer no se borrará." : `Se eliminarán ${deleteTarget?.shotIds.length ?? 0} plano(s).`}</p>} confirmLabel={deleteImpact ? "Eliminar planos y Storyboard" : "Eliminar"} danger busy={dialogBusy} onClose={() => { if (!dialogBusy) { setDeleteTarget(null); setDeleteImpact(null); } }} onConfirm={() => void performDelete(Boolean(deleteImpact))} />
  </div>;
}

function ShotRow({ row, columns, gridStyle, selected, checked, shotlist, onSelect, onPreview, onNavigate, onCheck, onSave, onDuplicate, onCopy, onOpenWriter, onDelete, onInsertAfter }: { row: ShotlistRowContext; columns: ShotlistColumnKey[]; gridStyle: CSSProperties; selected: boolean; checked: boolean; shotlist: WriterShotlist; onSelect: () => void; onPreview: () => void; onNavigate: (direction: -1 | 1) => void; onCheck: (checked: boolean) => void; onSave: (changes: Partial<WriterShot>) => void; onDuplicate: () => void; onCopy: () => void; onOpenWriter: () => void; onDelete: () => void; onInsertAfter: () => void }) {
  return <div data-shot-id={row.shot.id} className={`shotlist-row${selected ? " is-selected" : ""}`} style={gridStyle} role="row" tabIndex={0} aria-label={`Plano ${row.number}: ${row.shot.subject || row.shot.shotType}`} onClick={onSelect} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "Enter") { event.preventDefault(); onSelect(); } else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); onNavigate(event.key === "ArrowUp" ? -1 : 1); } }}>{columns.map((column) => <div key={column} role="cell" className={`shotlist-cell is-${column}`}>{renderCell(column, row, checked, onCheck, onSave, onPreview)}</div>)}<div className="shotlist-cell is-actions"><button type="button" className="shotlist-story-preview-button" onClick={(event) => { event.stopPropagation(); onPreview(); }} aria-label={`Vista previa del storyboard del plano ${row.number}`} title="Vista previa del storyboard">▧</button><ShotlistMoreMenu label={`Acciones del plano ${row.number}`} canOpenWriter={Boolean(shotlist.scriptId && row.group.sourceSceneId)} onInsertAfter={onInsertAfter} onDuplicate={onDuplicate} onCopy={onCopy} onOpenWriter={onOpenWriter} onDelete={onDelete} /></div></div>;
}

function renderCell(column: ShotlistColumnKey, row: ShotlistRowContext, checked: boolean, onCheck: (checked: boolean) => void, onSave: (changes: Partial<WriterShot>) => void, onPreview: () => void) {
  const shot = row.shot;
  if (column === "number") return <span className="shotlist-number"><input type="checkbox" aria-label={`Seleccionar plano ${row.number}`} checked={checked} onClick={(event) => event.stopPropagation()} onChange={(event) => onCheck(event.target.checked)} />{String(row.number).padStart(2, "0")}</span>;
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
function InsertionButton({ label, onInsert, scene = false, end = false }: { label: string; onInsert: () => void; scene?: boolean; end?: boolean }) { return <div className={`shotlist-insert-slot${scene ? " is-scene" : ""}${end ? " is-end" : ""}`}><button type="button" onClick={onInsert} aria-label={label} title={label}><span>＋</span><b>{label}</b></button></div>; }

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
function message(cause: unknown, fallback: string) { return cause instanceof Error && cause.message ? cause.message : fallback; }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
