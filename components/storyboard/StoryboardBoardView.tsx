"use client";

/* eslint-disable @next/next/no-img-element -- private authenticated asset route is intentionally used */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StoryboardBoard, StoryboardPanel, StoryboardShot } from "@/lib/storyboard/types";
import styles from "./storyboard.module.css";

type Filter = "all" | "empty" | "drawing" | "reference" | "approved" | "stale";
type Density = "compact" | "comfortable" | "large";

export default function StoryboardBoardView({ initialBoard, userId }: { initialBoard: StoryboardBoard; userId: string }) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [filter, setFilter] = useState<Filter>("all");
  const [density, setDensity] = useState<Density>("comfortable");
  const [activeGroupId, setActiveGroupId] = useState(initialBoard.groups[0]?.id ?? "");
  const [selected, setSelected] = useState(() => new Set<string>());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(120);
  const [busyShotId, setBusyShotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const preferenceKey = `filmatta-storyboard-board::${userId}::${board.shotlist.id}`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(preferenceKey) ?? "null") as { filter?: Filter; density?: Density; groupId?: string; scrollY?: number } | null;
        if (stored?.filter) setFilter(stored.filter);
        if (stored?.density) setDensity(stored.density);
        if (stored?.groupId) setActiveGroupId(stored.groupId);
        if (typeof stored?.scrollY === "number") window.scrollTo({ top: stored.scrollY, behavior: "instant" });
      } catch { /* preferences are optional */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [preferenceKey]);

  useEffect(() => {
    const persist = () => localStorage.setItem(preferenceKey, JSON.stringify({ filter, density, groupId: activeGroupId, scrollY: window.scrollY }));
    const timer = window.setTimeout(persist, 100);
    window.addEventListener("pagehide", persist);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", persist); };
  }, [activeGroupId, density, filter, preferenceKey]);

  const entries = useMemo(() => board.groups.flatMap((group, groupIndex) => group.shots.map((shot, shotIndex) => ({ group, groupIndex, shot, shotIndex }))), [board.groups]);
  const filtered = entries.filter(({ shot }) => {
    if (filter === "all") return true;
    if (filter === "empty") return shot.panels.length === 0;
    if (filter === "drawing") return shot.panels.some((panel) => ["drawing", "mixed"].includes(panel.currentRevision.contentKind));
    if (filter === "reference") return shot.panels.some((panel) => ["reference", "mixed"].includes(panel.currentRevision.contentKind));
    if (filter === "approved") return shot.panels.some((panel) => panel.approvedRevisionId === panel.currentRevisionId);
    return shot.panels.some((panel) => isPanelStale(panel, shot));
  });
  const visible = filtered.slice(0, visibleCount);
  const selectedPanels = entries.flatMap(({ group, groupIndex, shot, shotIndex }) => shot.panels.map((panel, panelIndex) => ({ group, groupIndex, shot, shotIndex, panel, panelIndex })))
    .filter(({ panel }) => selected.has(panel.id));

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const match = window.location.hash.match(/^#story-shot-(.+)$/u);
      if (!match?.[1]) return;
      const shotId = decodeURIComponent(match[1]);
      const index = entries.findIndex(({ shot }) => shot.id === shotId);
      if (index < 0) return;
      if (filter !== "all") { setFilter("all"); return; }
      setVisibleCount((count) => Math.max(count, index + 1));
      requestAnimationFrame(() => document.getElementById(`story-shot-${shotId}`)?.scrollIntoView({ block: "center" }));
    });
    return () => cancelAnimationFrame(frame);
  }, [entries, filter]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver((items) => {
      if (items.some((item) => item.isIntersecting)) setVisibleCount((value) => Math.min(value + 120, filtered.length));
    }, { rootMargin: "800px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length]);

  async function reload() {
    const response = await fetch(`/api/shotlists/${board.shotlist.id}/storyboard`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No pudimos actualizar el tablero.");
    setBoard(data);
  }

  async function createPanel(shotId: string) {
    if (busyShotId) return;
    setBusyShotId(shotId); setError(null);
    const operationId = crypto.randomUUID();
    try {
      const response = await fetch(`/api/shotlists/${board.shotlist.id}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId, operationId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos crear el panel.");
      rememberAnchor(shotId);
      router.push(`/shotlists/${board.shotlist.id}/storyboard/shots/${shotId}?panel=${data.panelId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos crear el panel.");
      setBusyShotId(null);
    }
  }

  async function duplicatePanel(panel: StoryboardPanel) {
    setError(null);
    try {
      const response = await fetch(`/api/shotlists/${board.shotlist.id}/storyboard/panels/${panel.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos duplicar el panel.");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos duplicar el panel."); }
  }

  async function deletePanel(panel: StoryboardPanel) {
    if (!window.confirm("Eliminar este panel y sus revisiones? Esta acción no elimina el plano.")) return;
    setError(null);
    try {
      const response = await fetch(`/api/shotlists/${board.shotlist.id}/storyboard/panels/${panel.id}`, { method: "DELETE" });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "No pudimos eliminar el panel."); }
      setSelected((current) => { const next = new Set(current); next.delete(panel.id); return next; });
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos eliminar el panel."); }
  }

  async function movePanel(shot: StoryboardShot, panel: StoryboardPanel, direction: -1 | 1) {
    const panels = [...shot.panels];
    const from = panels.findIndex((candidate) => candidate.id === panel.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= panels.length) return;
    [panels[from], panels[to]] = [panels[to]!, panels[from]!];
    const response = await fetch(`/api/shotlists/${board.shotlist.id}/storyboard`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", shotId: shot.id, panelIds: panels.map((item) => item.id) }),
    });
    if (!response.ok) { const data = await response.json(); return setError(data.error ?? "No pudimos reordenar los paneles."); }
    await reload();
  }

  function rememberAnchor(shotId: string) {
    localStorage.setItem(preferenceKey, JSON.stringify({ filter, density, groupId: activeGroupId, scrollY: window.scrollY, shotId }));
  }

  function revealShot(shotId: string) {
    const index = entries.findIndex(({ shot }) => shot.id === shotId);
    if (index < 0) return;
    window.history.replaceState(null, "", `#story-shot-${encodeURIComponent(shotId)}`);
    if (filter !== "all") setFilter("all");
    setVisibleCount((count) => Math.max(count, index + 1));
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`story-shot-${shotId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })));
  }

  return <main className={styles.boardShell}>
    <header className={styles.boardHeader}>
      <div>
        <nav aria-label="Ruta"><Link href={`/shotlists/${board.shotlist.id}`}>Shotlist</Link><span>/</span><strong>Storyboard</strong></nav>
        <h1>{board.shotlist.title}</h1>
      </div>
      <div className={styles.headerActions}>
        <span className={styles.optionalBadge}>Capa visual opcional</span>
        <Link className={styles.secondaryButton} href={`/shotlists/${board.shotlist.id}`}>← Volver a Shotlist</Link>
      </div>
    </header>
    {error && <div className={styles.errorBanner} role="alert">{error}<button type="button" onClick={() => setError(null)}>Cerrar</button></div>}
    <div className={styles.boardLayout}>
      <aside className={styles.sceneSidebar} aria-label="Escenas y planos">
        <div className={styles.sidebarTitle}><strong>ESCENAS</strong><span>{board.groups.length}</span></div>
        {board.groups.map((group, groupIndex) => <section key={group.id}>
          <button className={activeGroupId === group.id ? styles.activeScene : ""} type="button" onClick={() => { setActiveGroupId(group.id); document.getElementById(`story-group-${group.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            <small>{group.sourceStatus === "manual" ? "GRUPO" : `ESC. ${String(groupIndex + 1).padStart(2, "0")}`}</small>
            <span>{group.title}</span>
          </button>
          <ol>{group.shots.map((shot, shotIndex) => <li key={shot.id}><button type="button" onClick={() => revealShot(shot.id)}><span>{groupIndex + 1}.{shotIndex + 1}</span><em>{shot.subject || shot.shotType}</em><b>{shot.panels.length}</b></button></li>)}</ol>
        </section>)}
      </aside>
      <section className={styles.boardMain}>
        <div className={styles.boardControls}>
          <div role="group" aria-label="Filtros">
            {(["all", "empty", "drawing", "reference", "approved", "stale"] as Filter[]).map((value) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setVisibleCount(120); }}>{filterLabel(value)}</button>)}
          </div>
          <label>Tamaño <select value={density} onChange={(event) => setDensity(event.target.value as Density)}><option value="compact">Compacto</option><option value="comfortable">Medio</option><option value="large">Grande</option></select></label>
          <button type="button" disabled={!selected.size} onClick={() => setReviewOpen(true)}>Revisar selección ({selected.size})</button>
        </div>
        <div className={`${styles.shotGrid} ${styles[density]}`}>
          {visible.map(({ group, groupIndex, shot, shotIndex }, index) => <article key={shot.id} id={`story-shot-${shot.id}`} className={styles.shotCluster} data-group-start={index === 0 || visible[index - 1]?.group.id !== group.id ? "true" : "false"}>
            {(index === 0 || visible[index - 1]?.group.id !== group.id) && <div id={`story-group-${group.id}`} className={styles.groupDivider}><span>{group.sourceStatus === "manual" ? "GRUPO MANUAL" : `ESCENA ${String(groupIndex + 1).padStart(2, "0")}`}</span><strong>{group.title}</strong></div>}
            <div className={styles.shotHeading}>
              <div><strong>PLANO {groupIndex + 1}.{shotIndex + 1}</strong><span>{shot.shotType}{shot.lens ? ` · ${shot.lens}` : ""}{shot.movement ? ` · ${shot.movement}` : ""}</span></div>
              <p>{shot.subject || shot.description || "Sin acción definida"}</p>
              <Link href={`/shotlists/${board.shotlist.id}?shot=${shot.id}`}>Editar plano ↗</Link>
            </div>
            <div className={styles.panelRow}>
              {shot.panels.map((panel, panelIndex) => <PanelCard key={panel.id} board={board} shot={shot} panel={panel} label={`${groupIndex + 1}.${shotIndex + 1}${panelSuffix(panelIndex)}`} selected={selected.has(panel.id)} onSelect={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(panel.id); else next.delete(panel.id); return next; })} onOpen={() => { rememberAnchor(shot.id); router.push(`/shotlists/${board.shotlist.id}/storyboard/shots/${shot.id}?panel=${panel.id}`); }} onDuplicate={() => void duplicatePanel(panel)} onDelete={() => void deletePanel(panel)} onMove={(direction) => void movePanel(shot, panel, direction)} />)}
              <button type="button" className={styles.emptyPanel} onClick={() => void createPanel(shot.id)} disabled={busyShotId === shot.id}>
                <span>＋</span><strong>{shot.panels.length ? "Añadir momento" : "Panel sin contenido"}</strong><small>{busyShotId === shot.id ? "Creando…" : "Dibujar o añadir referencia"}</small>
              </button>
            </div>
          </article>)}
        </div>
        {visible.length === 0 && <div className={styles.emptyState}>No hay planos que coincidan con el filtro.</div>}
        <div ref={sentinel} className={styles.loadSentinel}>{visibleCount < filtered.length ? `Cargando ${Math.min(120, filtered.length - visibleCount)} planos más…` : `${filtered.length} planos visibles`}</div>
      </section>
    </div>
    {reviewOpen && <div className={styles.reviewBackdrop} role="dialog" aria-modal="true" aria-label="Revisión narrativa">
      <div className={styles.reviewDialog}><header><div><small>REVISIÓN EN ORDEN NARRATIVO</small><h2>{selectedPanels.length} paneles</h2></div><button type="button" onClick={() => setReviewOpen(false)} aria-label="Cerrar">×</button></header>
        <div className={styles.reviewStrip}>{selectedPanels.map(({ groupIndex, shotIndex, panel, panelIndex }) => <button type="button" key={panel.id} onClick={() => router.push(`/shotlists/${board.shotlist.id}/storyboard/shots/${panel.shotId}?panel=${panel.id}`)}>{panel.previewAssetId ? <img src={`/api/writer/production-assets/${panel.previewAssetId}`} alt="" /> : <span>Sin miniatura</span>}<strong>{groupIndex + 1}.{shotIndex + 1}{panelSuffix(panelIndex)}</strong><small>{panel.currentRevision.contentKind === "empty" ? "Vacío" : "Abrir panel"}</small></button>)}</div>
      </div>
    </div>}
  </main>;
}

function PanelCard({ board, shot, panel, label, selected, onSelect, onOpen, onDuplicate, onDelete, onMove }: { board: StoryboardBoard; shot: StoryboardShot; panel: StoryboardPanel; label: string; selected: boolean; onSelect: (checked: boolean) => void; onOpen: () => void; onDuplicate: () => void; onDelete: () => void; onMove: (direction: -1 | 1) => void }) {
  const stale = isPanelStale(panel, shot);
  const approved = panel.approvedRevisionId === panel.currentRevisionId;
  return <div className={`${styles.panelCard} ${selected ? styles.panelSelected : ""}`}>
    <button type="button" className={styles.panelPreview} onClick={onOpen}>
      {panel.previewAssetId ? <img loading="lazy" src={`/api/writer/production-assets/${panel.previewAssetId}`} alt={`Storyboard ${label}`} /> : <span>{panel.renderStatus === "pending" ? "Miniatura pendiente" : panel.currentRevision.contentKind === "empty" ? "Sin contenido visual" : "Vista previa pendiente"}</span>}
    </button>
    <div className={styles.panelMeta}><label><input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} /><strong>{label}</strong></label><div>{approved && <span>Aprobado</span>}{stale && <span>Revisar plano</span>}</div></div>
    <p>{panel.currentRevision.visualNote || shot.subject || "Sin nota visual"}</p>
    <div className={styles.panelActions}><button type="button" onClick={() => onMove(-1)} aria-label={`Mover ${label} antes`}>←</button><button type="button" onClick={() => onMove(1)} aria-label={`Mover ${label} después`}>→</button><button type="button" onClick={onDuplicate}>Duplicar</button><button type="button" onClick={onDelete}>Eliminar</button><Link href={`/shotlists/${board.shotlist.id}/storyboard/shots/${shot.id}?panel=${panel.id}`}>Abrir</Link></div>
  </div>;
}

function isPanelStale(panel: StoryboardPanel, shot: StoryboardShot) {
  return panel.currentRevision.sourceContextHash !== shot.contextHash && panel.acknowledgedContextHash !== shot.contextHash;
}

function panelSuffix(index: number) {
  let value = index;
  let suffix = "";
  do { suffix = String.fromCharCode(97 + (value % 26)) + suffix; value = Math.floor(value / 26) - 1; } while (value >= 0);
  return suffix;
}

function filterLabel(filter: Filter) {
  return ({ all: "Todos", empty: "Sin panel", drawing: "Dibujo", reference: "Referencia", approved: "Aprobados", stale: "Por revisar" } as const)[filter];
}
