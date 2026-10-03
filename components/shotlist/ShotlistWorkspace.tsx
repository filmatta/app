"use client";

/* eslint-disable @next/next/no-img-element -- authenticated image route is intentionally not sent through the public optimizer */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  WRITER_SHOT_ANGLES,
  WRITER_SHOT_MOVEMENTS,
  WRITER_SHOT_TYPES,
  writerShotlistSummary,
  type WriterShot,
  type WriterShotlist,
} from "@/lib/writer/production";

type SourceChanges = { renamed: Array<{ groupId: string; sceneId: string; title: string }>; reordered: boolean; missing: string[]; added: Array<{ sceneId: string; title: string }> };
type Mode = "manual" | "assisted" | "suggested";
type ShotProposal = { id: string; group_id: string; payload: Partial<WriterShot>; status: "pending" | "accepted" | "dismissed" };

export default function ShotlistWorkspace({
  initialState,
  initialMode = "manual",
  initialShotId,
}: {
  initialState: { shotlist: WriterShotlist; sourceChanges: SourceChanges };
  initialMode?: Mode;
  initialShotId?: string;
}) {
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
  const [groupFilter, setGroupFilter] = useState("all");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ShotProposal[]>([]);
  const [proposalSelection, setProposalSelection] = useState(() => new Set<string>());
  const [proposalBusy, setProposalBusy] = useState(false);
  const [showSecondaryColumns, setShowSecondaryColumns] = useState(true);
  const [coverage, setCoverage] = useState(() => new Set(["master", "individuals"]));

  useEffect(() => { void fetch(`/api/shotlists/${initialState.shotlist.id}/proposals`, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) return; const data = await response.json(); const rows = (data.proposals ?? []) as ShotProposal[];
    setProposals(rows); setProposalSelection(new Set(rows.filter((item) => item.status === "pending").map((item) => item.id)));
  }); }, [initialState.shotlist.id]);

  const allShots = useMemo(() => shotlist.groups.flatMap((group) => group.shots), [shotlist.groups]);
  const selectedShot = allShots.find((shot) => shot.id === selectedShotId) ?? null;
  const selectedGroup = selectedShot ? shotlist.groups.find((group) => group.id === selectedShot.groupId) ?? null : null;
  const summary = writerShotlistSummary(shotlist.groups);
  const visibleGroups = shotlist.groups.filter((group) => {
    if (groupFilter !== "all" && group.id !== groupFilter) return false;
    if (!search.trim()) return true;
    const query = search.toLocaleLowerCase("es-MX");
    return group.title.toLocaleLowerCase("es-MX").includes(query)
      || group.shots.some((shot) => [shot.subject, shot.shotType, shot.description].some((value) => value?.toLocaleLowerCase("es-MX").includes(query)));
  });

  function replaceShot(next: WriterShot) {
    setShotlist((current) => ({ ...current, groups: current.groups.map((group) => group.id === next.groupId
      ? { ...group, shots: group.shots.map((shot) => shot.id === next.id ? next : shot) }
      : group) }));
  }

  async function saveShot(shot: WriterShot, changes: Partial<WriterShot>) {
    const previous = shot;
    const next = { ...shot, ...changes };
    replaceShot(next); setSaveState("saving"); setError(null);
    const payloadChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => !["id", "shotlistId", "groupId", "revision", "position", "origin", "assetId", "sourceRevision"].includes(key)));
    try {
      const response = await api({ action: "updateShot", shotId: shot.id, expectedRevision: shot.revision, changes: payloadChanges });
      replaceShot({ ...next, revision: Number(response.revision ?? shot.revision + 1) });
      setSaveState("saved");
    } catch (cause) {
      replaceShot(previous); setSaveState("error"); setError(cause instanceof Error ? cause.message : "No pudimos guardar el plano.");
    }
  }

  async function reload(preferredId?: string) {
    const response = await fetch(`/api/shotlists/${shotlist.id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No pudimos actualizar la shotlist.");
    setShotlist(data.shotlist);
    setSourceChanges(data.sourceChanges);
    if (preferredId) setSelectedShotId(preferredId);
    setSaveState("saved");
  }

  async function api(body: Record<string, unknown>) {
    const response = await fetch(`/api/shotlists/${shotlist.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No pudimos guardar el cambio.");
    return data;
  }

  async function addShot(groupId = activeGroupId) {
    if (!groupId) return;
    setSaveState("saving");
    try { const result = await api({ action: "addShot", groupId, origin: mode, operationId: crypto.randomUUID() }); await reload(result.id); setInspectorOpen(true); setExpanded((current) => new Set(current).add(groupId)); }
    catch (cause) { setSaveState("error"); setError(cause instanceof Error ? cause.message : "No pudimos añadir el plano."); }
  }

  async function addGroup() {
    const title = window.prompt("Nombre del grupo o escena manual", "Escena manual");
    if (!title?.trim()) return;
    try { await api({ action: "addGroup", title, operationId: crypto.randomUUID() }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos crear el grupo."); }
  }

  async function addAssistedCoverage() {
    if (!activeGroupId || !coverage.size || proposalBusy) return;
    const templates = [
      { id: "master", shotType: "Plano general", subject: "Cobertura general de la escena" },
      { id: "individuals", shotType: "Plano medio", subject: "Cobertura individual de interpretación" },
      { id: "ots", shotType: "OTS", subject: "Cobertura sobre hombro" },
      { id: "inserts", shotType: "Inserto", subject: "Detalle narrativo de la escena" },
    ].filter((item) => coverage.has(item.id));
    if (!templates.length || !window.confirm(`Añadir ${templates.length} plano(s) de cobertura a la escena seleccionada? Podrás editar cada fila antes de marcarla como lista.`)) return;
    setProposalBusy(true); setSaveState("saving"); setError(null);
    try {
      for (const template of templates) {
        const created = await api({ action: "addShot", groupId: activeGroupId, origin: "assisted", operationId: crypto.randomUUID() });
        await api({ action: "updateShot", shotId: created.id, expectedRevision: 0, changes: { shotType: template.shotType, subject: template.subject } });
      }
      await reload();
      setExpanded((current) => new Set(current).add(activeGroupId));
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "No pudimos añadir la cobertura completa. Los planos confirmados se conservaron.");
      try { await reload(); } catch { /* keep the visible local error */ }
    } finally { setProposalBusy(false); }
  }

  async function duplicateShot() {
    if (!selectedShot) return;
    try { const result = await api({ action: "duplicateShot", shotId: selectedShot.id, operationId: crypto.randomUUID() }); await reload(result.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos duplicar el plano."); }
  }

  async function moveShot(direction: -1 | 1) {
    if (!selectedShot || !selectedGroup || search.trim() || groupFilter !== "all") return;
    const currentIndex = selectedGroup.shots.findIndex((shot) => shot.id === selectedShot.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= selectedGroup.shots.length) return;
    setSaveState("saving"); setError(null);
    try {
      await api({ action: "reorderShot", shotId: selectedShot.id, targetIndex });
      await reload(selectedShot.id);
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "No pudimos mover el plano.");
    }
  }

  async function uploadShotImage(shot: WriterShot, file: File) {
    setSaveState("saving"); setError(null);
    try {
      const form = new FormData(); form.set("file", file); form.set("targetType", "shot"); form.set("targetId", shot.id);
      const response = await fetch("/api/writer/production-assets", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos subir la referencia.");
      await reload(shot.id);
    } catch (cause) { setSaveState("error"); setError(cause instanceof Error ? cause.message : "No pudimos subir la referencia."); }
  }

  async function removeShotImage(shot: WriterShot) {
    if (!shot.assetId || !window.confirm("Quitar esta referencia visual del plano?")) return;
    setSaveState("saving"); setError(null);
    try {
      const response = await fetch(`/api/writer/production-assets/${shot.assetId}?targetType=shot&targetId=${shot.id}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "No pudimos quitar la referencia."); }
      await reload(shot.id);
    } catch (cause) { setSaveState("error"); setError(cause instanceof Error ? cause.message : "No pudimos quitar la referencia."); }
  }

  async function prepareProposal() {
    if (mode === "manual" || proposalBusy) return;
    const groupIds = groupFilter !== "all" ? [groupFilter] : activeGroupId ? [activeGroupId] : [];
    if (!groupIds.length) return setError("Selecciona una escena para preparar la propuesta.");
    if (!window.confirm(`Preparar una propuesta ${mode === "assisted" ? "asistida" : "sugerida"} para la escena seleccionada? Esta acción puede usar IA si está habilitada en Preview.`)) return;
    setProposalBusy(true); setError(null);
    try {
      const response = await fetch(`/api/shotlists/${shotlist.id}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationId: crypto.randomUUID(), mode, groupIds }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No pudimos preparar la propuesta.");
      setProposals(data.proposals ?? []); setProposalSelection(new Set((data.proposals ?? []).filter((item: ShotProposal) => item.status === "pending").map((item: ShotProposal) => item.id)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos preparar la propuesta."); }
    finally { setProposalBusy(false); }
  }

  async function decideProposals(action: "accept" | "dismiss") {
    const proposalIds = [...proposalSelection]; if (!proposalIds.length) return;
    setProposalBusy(true);
    try {
      const response = await fetch(`/api/shotlists/${shotlist.id}/proposals`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, proposalIds }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "No pudimos aplicar la decisión.");
      setProposals((current) => current.map((proposal) => proposalIds.includes(proposal.id) ? { ...proposal, status: action === "accept" ? "accepted" : "dismissed" } : proposal));
      setProposalSelection(new Set()); if (action === "accept") await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos aplicar la decisión."); }
    finally { setProposalBusy(false); }
  }

  async function syncSource() {
    setSaveState("saving"); setError(null);
    try {
      await api({ action: "syncSource", includeAdded: sourceChanges.added.length > 0 });
      await reload(selectedShotId ?? undefined);
    } catch (cause) { setSaveState("error"); setError(cause instanceof Error ? cause.message : "No pudimos actualizar los vínculos."); }
  }

  async function deleteSelected() {
    const ids = selectedIds.size ? [...selectedIds] : selectedShot ? [selectedShot.id] : [];
    if (!ids.length || !window.confirm(`Eliminar ${ids.length === 1 ? "este plano" : `${ids.length} planos`}?`)) return;
    try {
      let response = await fetch(`/api/shotlists/${shotlist.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteShots", shotIds: ids }) });
      let data = await response.json();
      if (response.status === 409 && data.code === "storyboard_dependencies") {
        const impact = data.impact as { panels: number; approvals: number };
        if (!window.confirm(`Estos planos tienen ${impact.panels} panel(es) de storyboard y ${impact.approvals} aprobación(es). ¿Eliminar planos y storyboard de forma definitiva?`)) return;
        response = await fetch(`/api/shotlists/${shotlist.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteShots", shotIds: ids, deleteStoryboard: true }) });
        data = await response.json();
      }
      if (!response.ok) throw new Error(data.error ?? "No pudimos eliminar la selección.");
      setSelectedIds(new Set()); setSelectedShotId(null); await reload();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos eliminar la selección."); }
  }

  function selectShot(shot: WriterShot) { setSelectedShotId(shot.id); setActiveGroupId(shot.groupId); setInspectorOpen(true); }
  function selectAdjacentShot(shot: WriterShot, direction: -1 | 1) {
    const index = allShots.findIndex((candidate) => candidate.id === shot.id);
    const next = allShots[index + direction];
    if (next) selectShot(next);
  }
  function visibleNumber(shotId: string) { return allShots.findIndex((shot) => shot.id === shotId) + 1; }
  const duration = `${Math.floor(summary.durationSeconds / 60)}:${String(Math.round(summary.durationSeconds % 60)).padStart(2, "0")}`;

  return (
    <div className={`shotlist-workspace${inspectorOpen ? " has-inspector" : ""}`}>
      <header className="shotlist-header">
        <div className="shotlist-brand"><Link href="/">FILMATTA</Link><span /><Link href="/shotlists">Shotlist V1</Link><i>•</i><input aria-label="Nombre de la shotlist" defaultValue={shotlist.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== shotlist.title) void api({ action: "rename", title }).then(() => setShotlist((value) => ({ ...value, title }))).catch((cause) => setError(cause.message)); }} /></div>
        <div className="shotlist-header-actions"><span className={`shotlist-save is-${saveState}`}>♧ {saveState === "saved" ? "Guardado en la nube" : saveState === "saving" ? "Guardando…" : "Error al guardar"}</span><Link href={`/shotlists/${shotlist.id}/storyboard`}>▧ Abrir Storyboard</Link><button type="button" onClick={() => void navigator.clipboard.writeText(location.href)}>⌘ Copiar enlace privado</button><a href={`/api/shotlists/${shotlist.id}/csv`}>⇧ Exportar CSV</a><span className="shotlist-avatar">{shotlist.title.slice(0, 2).toUpperCase()}</span></div>
      </header>
      <div className="shotlist-workbar">
        <div className="shotlist-modes" role="group" aria-label="Modo de trabajo">{(["manual", "assisted", "suggested"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{value === "manual" ? "✎ Libre" : value === "assisted" ? "◉ Asistido" : "✦ Sugerido"}</button>)}</div>
        <button className="shotlist-primary" type="button" onClick={() => void addShot()}>＋ Plano</button>
        <Link className="shotlist-tool" href="/writer?shotlistImport=1">⇩ Importar</Link>
        <button className="shotlist-tool" type="button" aria-pressed={!showSecondaryColumns} onClick={() => setShowSecondaryColumns((value) => !value)} title={showSecondaryColumns ? "Ocultar columnas secundarias" : "Mostrar todas las columnas"}>▦ {showSecondaryColumns ? "Vista Grid" : "Columnas básicas"}</button>
        <select aria-label="Filtrar escenas" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="all">Todas las escenas</option>{shotlist.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select>
        <div className="shotlist-summary"><b>{summary.totalShots}</b> planos <i>•</i> <b>{summary.plannedGroups}</b>/{summary.totalGroups} escenas planificadas <i>•</i> {duration} registrados{summary.missingDurations ? ` · ${summary.missingDurations} sin estimar` : ""}</div>
      </div>
      {(sourceChanges.missing.length > 0 || sourceChanges.renamed.length > 0 || sourceChanges.reordered || sourceChanges.added.length > 0) && <div className="shotlist-source-warning">El guion fuente cambió. Los planos se conservarán. <button type="button" onClick={() => void syncSource()}>Actualizar vínculos{sourceChanges.added.length ? ` y añadir ${sourceChanges.added.length} escena(s)` : ""}</button></div>}
      {error && <div className="shotlist-error" role="alert">{error}<button type="button" onClick={() => setError(null)}>Cerrar</button></div>}
      <aside className="shotlist-scenes">
        <h2>Escenas</h2><label><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar escenas…" /></label>
        <ol>{shotlist.groups.map((group, index) => <li key={group.id} className={activeGroupId === group.id ? "is-active" : ""}><button type="button" onClick={() => { setActiveGroupId(group.id); setExpanded((current) => new Set(current).add(group.id)); document.getElementById(`shot-group-${group.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{group.title}</strong><small>{group.shots.length} {group.shots.length === 1 ? "plano" : "planos"}{group.sourceStatus === "manual" ? " · manual" : group.sourceStatus === "missing" ? " · fuente no disponible" : ""}</small></button></li>)}</ol>
        <button className="shotlist-new-scene" type="button" onClick={() => void addGroup()}>＋ Nueva escena</button>
      </aside>
      <main className="shotlist-grid-panel">
        <div className="shotlist-grid-title"><h1>Lista de planos</h1><label><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en planos…" /></label><button type="button" aria-pressed={!showSecondaryColumns} onClick={() => setShowSecondaryColumns((value) => !value)} title={showSecondaryColumns ? "Ocultar columnas secundarias" : "Mostrar todas las columnas"}>☷</button></div>
        {mode === "assisted" && <div className="shotlist-assisted-guide"><div><strong>Cobertura asistida</strong><span>Elige qué cobertura añadir. No usa IA y cada plano queda editable.</span></div>{[{ id: "master", label: "Master" }, { id: "individuals", label: "Individuales" }, { id: "ots", label: "OTS" }, { id: "inserts", label: "Insertos" }].map((item) => <label key={item.id}><input type="checkbox" checked={coverage.has(item.id)} onChange={(event) => setCoverage((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} />{item.label}</label>)}<button type="button" disabled={proposalBusy || !coverage.size || !activeGroupId} onClick={() => void addAssistedCoverage()}>{proposalBusy ? "Añadiendo…" : `Añadir ${coverage.size} a la escena`}</button><button type="button" className="is-secondary" disabled={proposalBusy} onClick={() => void prepareProposal()}>Propuesta contextual con IA</button></div>}
        {mode === "suggested" && <div className="shotlist-mode-guidance"><strong>Propuesta sugerida</strong><span>La IA requiere una acción explícita y presenta propuestas antes de incorporar ninguna fila.</span><button type="button" disabled={proposalBusy} onClick={() => void prepareProposal()}>{proposalBusy ? "Preparando…" : "Preparar propuesta"}</button></div>}
        {proposals.some((proposal) => proposal.status === "pending") && <div className="shotlist-proposals"><div><strong>Propuestas por revisar</strong><span>{proposals.filter((proposal) => proposal.status === "pending").length}</span></div>{proposals.filter((proposal) => proposal.status === "pending").map((proposal) => <label key={proposal.id}><input type="checkbox" checked={proposalSelection.has(proposal.id)} onChange={(event) => setProposalSelection((current) => { const next = new Set(current); if (event.target.checked) next.add(proposal.id); else next.delete(proposal.id); return next; })} /><span><b>{String(proposal.payload.shotType ?? "Plano")}</b><small>{String(proposal.payload.subject ?? "Sin sujeto")}</small></span></label>)}<footer><button type="button" disabled={proposalBusy || !proposalSelection.size} onClick={() => void decideProposals("dismiss")}>Descartar</button><button type="button" disabled={proposalBusy || !proposalSelection.size} onClick={() => void decideProposals("accept")}>Añadir seleccionados</button></footer></div>}
        <div className="shotlist-grid-scroll">
          <div className="shotlist-grid-head" aria-hidden="true" style={{ gridTemplateColumns: showSecondaryColumns ? undefined : "55px 88px 130px minmax(220px,1fr) 96px 118px 112px", minWidth: showSecondaryColumns ? undefined : 720 }}><span>#</span><span>Escena</span><span>Plano</span><span>Sujeto / acción</span><span>Ángulo</span><span>Movimiento</span>{showSecondaryColumns && <><span>Lente</span><span>Setup</span><span>Duración</span></>}<span>Estado</span>{showSecondaryColumns && <span>Storyboard</span>}</div>
          {visibleGroups.map((group) => <section key={group.id} id={`shot-group-${group.id}`} className="shotlist-group">
            <button className="shotlist-group-head" type="button" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}><span>{expanded.has(group.id) ? "⌄" : "›"}</span><strong>{group.sourceStatus === "manual" ? "MANUAL" : `ESC. ${String(shotlist.groups.indexOf(group) + 1).padStart(2, "0")}`} · {group.title}</strong><small>· {group.shots.length} planos</small><i>•••</i></button>
            {expanded.has(group.id) && group.shots.length === 0 && <p className="shotlist-empty-group">Tus escenas están listas. Añade planos manualmente o utiliza Asistido/Sugerido cuando quieras.</p>}
            {expanded.has(group.id) && group.shots.map((shot) => <div key={shot.id} className={`shotlist-row${selectedShotId === shot.id ? " is-selected" : ""}`} style={{ gridTemplateColumns: showSecondaryColumns ? undefined : "55px 88px 130px minmax(220px,1fr) 96px 118px 112px", minWidth: showSecondaryColumns ? undefined : 720 }} role="button" tabIndex={0} aria-label={`Plano ${visibleNumber(shot.id)}: ${shot.subject || shot.shotType}`} onClick={() => selectShot(shot)} onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                selectAdjacentShot(shot, event.key === "ArrowUp" ? -1 : 1);
              } else if (event.key === "Enter") {
                event.preventDefault(); selectShot(shot);
              }
            }}>
              <span className="shotlist-number"><input type="checkbox" aria-label={`Seleccionar plano ${visibleNumber(shot.id)}`} checked={selectedIds.has(shot.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(shot.id); else next.delete(shot.id); return next; })} />{String(visibleNumber(shot.id)).padStart(2, "0")}</span>
              <span>ESC. {String(shotlist.groups.indexOf(group) + 1).padStart(2, "0")}</span>
              <select aria-label="Tipo de plano" value={shot.shotType} onClick={(event) => event.stopPropagation()} onChange={(event) => void saveShot(shot, { shotType: event.target.value })}>{WRITER_SHOT_TYPES.map((value) => <option key={value}>{value}</option>)}</select>
              <input key={`${shot.id}-subject-${shot.revision}`} aria-label="Sujeto o acción" defaultValue={shot.subject} onClick={(event) => event.stopPropagation()} onBlur={(event) => { if (event.target.value !== shot.subject) void saveShot(shot, { subject: event.target.value }); }} />
              <select aria-label="Ángulo" value={shot.angle} onClick={(event) => event.stopPropagation()} onChange={(event) => void saveShot(shot, { angle: event.target.value })}>{WRITER_SHOT_ANGLES.map((value) => <option key={value}>{value}</option>)}</select>
              <select aria-label="Movimiento" value={shot.movement} onClick={(event) => event.stopPropagation()} onChange={(event) => void saveShot(shot, { movement: event.target.value })}>{WRITER_SHOT_MOVEMENTS.map((value) => <option key={value}>{value}</option>)}</select>
              {showSecondaryColumns && <><input key={`${shot.id}-lens-${shot.revision}`} aria-label="Lente" defaultValue={shot.lens ?? ""} onClick={(event) => event.stopPropagation()} onBlur={(event) => { if (event.target.value !== (shot.lens ?? "")) void saveShot(shot, { lens: event.target.value || null }); }} placeholder="—" />
              <input key={`${shot.id}-setup-${shot.revision}`} aria-label="Setup" defaultValue={shot.setup ?? ""} onClick={(event) => event.stopPropagation()} onBlur={(event) => { if (event.target.value !== (shot.setup ?? "")) void saveShot(shot, { setup: event.target.value || null }); }} placeholder="—" />
              <input key={`${shot.id}-duration-${shot.revision}`} aria-label="Duración" type="number" min="0" defaultValue={shot.durationSeconds ?? ""} onClick={(event) => event.stopPropagation()} onBlur={(event) => { const value = event.target.value === "" ? null : Number(event.target.value); if (value !== shot.durationSeconds) void saveShot(shot, { durationSeconds: value }); }} placeholder="—" /></>}
              <select aria-label="Estado" value={shot.status} onClick={(event) => event.stopPropagation()} onChange={(event) => void saveShot(shot, { status: event.target.value as WriterShot["status"] })}><option value="pending">● Pendiente</option><option value="ready">● Listo</option></select>
              {showSecondaryColumns && <Link href={`/shotlists/${shotlist.id}/storyboard#story-shot-${shot.id}`} className="shotlist-story-cell" onClick={(event) => event.stopPropagation()} aria-label={`Abrir storyboard del plano ${visibleNumber(shot.id)}`}>▧</Link>}
            </div>)}
          </section>)}
          {!visibleGroups.length && <p className="shotlist-no-results">No hay escenas o planos que coincidan.</p>}
        </div>
        {selectedIds.size > 0 && <div className="shotlist-bulk"><strong>{selectedIds.size} seleccionados</strong><button type="button" onClick={() => void api({ action: "bulkStatus", shotIds: [...selectedIds], status: "ready" }).then(() => reload())}>Marcar Listos</button><button type="button" onClick={() => void deleteSelected()}>Eliminar</button></div>}
      </main>
      {inspectorOpen && <aside className="shotlist-inspector">{selectedShot && selectedGroup ? <>
        <div className="shotlist-inspector-head"><div><h2>PLANO {String(visibleNumber(selectedShot.id)).padStart(2, "0")}</h2><span>{selectedGroup.sourceStatus === "manual" ? "GRUPO MANUAL" : `ESC. ${String(shotlist.groups.indexOf(selectedGroup) + 1).padStart(2, "0")}`} · {selectedGroup.title}</span></div><button type="button" onClick={() => { const index = allShots.indexOf(selectedShot); if (index > 0) selectShot(allShots[index - 1]!); }} aria-label="Plano anterior">‹</button><button type="button" onClick={() => { const index = allShots.indexOf(selectedShot); if (index < allShots.length - 1) selectShot(allShots[index + 1]!); }} aria-label="Plano siguiente">›</button><button type="button" onClick={() => setInspectorOpen(false)} aria-label="Cerrar inspector">×</button></div>
        <ShotField label="Tipo de plano"><select value={selectedShot.shotType} onChange={(event) => void saveShot(selectedShot, { shotType: event.target.value })}>{WRITER_SHOT_TYPES.map((value) => <option key={value}>{value}</option>)}</select></ShotField>
        <ShotField label="Sujeto / acción"><input key={`${selectedShot.id}-inspector-subject-${selectedShot.revision}`} defaultValue={selectedShot.subject} onBlur={(event) => { if (event.target.value !== selectedShot.subject) void saveShot(selectedShot, { subject: event.target.value }); }} /></ShotField>
        <div className="shotlist-field-pair"><ShotField label="Lente"><input key={`${selectedShot.id}-inspector-lens-${selectedShot.revision}`} defaultValue={selectedShot.lens ?? ""} onBlur={(event) => { if (event.target.value !== (selectedShot.lens ?? "")) void saveShot(selectedShot, { lens: event.target.value || null }); }} /></ShotField><ShotField label="Movimiento"><select value={selectedShot.movement} onChange={(event) => void saveShot(selectedShot, { movement: event.target.value })}>{WRITER_SHOT_MOVEMENTS.map((value) => <option key={value}>{value}</option>)}</select></ShotField></div>
        <div className="shotlist-field-pair"><ShotField label="Ángulo"><select value={selectedShot.angle} onChange={(event) => void saveShot(selectedShot, { angle: event.target.value })}>{WRITER_SHOT_ANGLES.map((value) => <option key={value}>{value}</option>)}</select></ShotField><ShotField label="Setup"><input key={`${selectedShot.id}-inspector-setup-${selectedShot.revision}`} defaultValue={selectedShot.setup ?? ""} onBlur={(event) => { if (event.target.value !== (selectedShot.setup ?? "")) void saveShot(selectedShot, { setup: event.target.value || null }); }} /></ShotField></div>
        <div className="shotlist-field-pair"><ShotField label="Duración"><input key={`${selectedShot.id}-inspector-duration-${selectedShot.revision}`} type="number" min="0" defaultValue={selectedShot.durationSeconds ?? ""} onBlur={(event) => { const value = event.target.value === "" ? null : Number(event.target.value); if (value !== selectedShot.durationSeconds) void saveShot(selectedShot, { durationSeconds: value }); }} /></ShotField><ShotField label="Estado"><select value={selectedShot.status} onChange={(event) => void saveShot(selectedShot, { status: event.target.value as WriterShot["status"] })}><option value="pending">● Pendiente</option><option value="ready">● Listo</option></select></ShotField></div>
        <ShotField label="Descripción"><textarea key={`${selectedShot.id}-inspector-description-${selectedShot.revision}`} defaultValue={selectedShot.description ?? ""} onBlur={(event) => { if (event.target.value !== (selectedShot.description ?? "")) void saveShot(selectedShot, { description: event.target.value || null }); }} /></ShotField>
        <ShotField label="Intención narrativa"><textarea key={`${selectedShot.id}-inspector-intention-${selectedShot.revision}`} defaultValue={selectedShot.intention ?? ""} onBlur={(event) => { if (event.target.value !== (selectedShot.intention ?? "")) void saveShot(selectedShot, { intention: event.target.value || null }); }} /></ShotField>
        <ShotField label="Notas"><textarea key={`${selectedShot.id}-inspector-notes-${selectedShot.revision}`} defaultValue={selectedShot.notes ?? ""} onBlur={(event) => { if (event.target.value !== (selectedShot.notes ?? "")) void saveShot(selectedShot, { notes: event.target.value || null }); }} /></ShotField>
        {shotlist.scriptId && <Link className="shotlist-edit-writer" href={`/writer/${shotlist.scriptId}?scene=${selectedGroup.sourceSceneId ?? ""}&return=/shotlists/${shotlist.id}&shot=${selectedShot.id}`}>Editar guion ↗</Link>}
        <div className="shotlist-storyboard"><h3>Storyboard / referencia</h3><div>{selectedShot.assetId ? <a href={`/api/writer/production-assets/${selectedShot.assetId}`} target="_blank" rel="noreferrer" title="Abrir referencia"><img src={`/api/writer/production-assets/${selectedShot.assetId}`} alt="Referencia visual privada del plano" /></a> : <span>▧</span>}<strong>{selectedShot.assetId ? "Referencia privada del plano" : "Sin referencia de plano"}</strong><p>La Shotlist decide qué filmar; Storyboard ayuda a visualizar este plano.</p><Link href={`/shotlists/${shotlist.id}/storyboard#story-shot-${selectedShot.id}`}>Abrir Storyboard</Link><label>⇧ {selectedShot.assetId ? "Cambiar referencia" : "Subir referencia de plano"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadShotImage(selectedShot, file); event.target.value = ""; }} /></label>{selectedShot.assetId && <button type="button" className="shotlist-remove-image" onClick={() => void removeShotImage(selectedShot)}>Quitar referencia</button>}</div></div>
        <div className="shotlist-inspector-actions"><button type="button" disabled={Boolean(search.trim()) || groupFilter !== "all" || selectedGroup.shots[0]?.id === selectedShot.id} title={search.trim() || groupFilter !== "all" ? "Quita los filtros para reordenar" : "Mover plano arriba"} onClick={() => void moveShot(-1)}>↑ Subir</button><button type="button" disabled={Boolean(search.trim()) || groupFilter !== "all" || selectedGroup.shots.at(-1)?.id === selectedShot.id} title={search.trim() || groupFilter !== "all" ? "Quita los filtros para reordenar" : "Mover plano abajo"} onClick={() => void moveShot(1)}>↓ Bajar</button><button type="button" onClick={() => void duplicateShot()}>Duplicar</button><button type="button" onClick={() => void deleteSelected()}>Eliminar</button></div>
      </> : <div className="shotlist-inspector-empty"><button type="button" onClick={() => setInspectorOpen(false)}>×</button><p>Selecciona un plano para editarlo.</p></div>}</aside>}
      {!inspectorOpen && <button type="button" className="shotlist-open-inspector" onClick={() => setInspectorOpen(true)}>Abrir inspector</button>}
    </div>
  );
}

function ShotField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="shotlist-field"><span>{label}</span>{children}</label>;
}
