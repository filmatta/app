"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { writerDocumentHref } from "@/lib/writer/routes";
import { TimelineRefreshCoordinator } from "@/lib/writer/timeline-refresh";
import {
  deriveWriterTimeline,
  refreshedSceneKey,
  timelineExtensionWidth,
  type TimelineCharacter,
  type TimelineEnvironment,
  type TimelineLocation,
  type TimelineMomentCategory,
  type TimelineScene,
  type WriterTimeline,
} from "@/lib/writer/timeline";
import { setWriterDragPreview } from "@/lib/writer/drag-preview";
import type { WriterSceneMovePosition } from "@/lib/writer/editor-actions";

const ZOOM_LEVELS = [76, 112, 156] as const;
const INITIAL_CHARACTER_TRACKS = 8;
const INITIAL_LOCATION_TRACKS = 6;

type RemoteScript = {
  id: string;
  title: string;
  document: unknown;
  schema_version: number;
  revision: number | string;
  updated_at: string;
};

type WriterTimelineViewProps = {
  initialTimeline: WriterTimeline;
  variant?: "page" | "embedded";
  localDirty?: boolean;
  confirmedRevision?: number;
  active?: boolean;
  requestedSceneId?: string | null;
  refreshToken?: number;
  onClose?: () => void;
  onGoToWriter?: (sceneId: string) => void;
  activeSceneId?: string | null;
  sceneNicknames?: Readonly<Record<string, string>>;
  onMoveScene?: (sceneId: string, targetSceneId: string, position: WriterSceneMovePosition) => void;
};

export default function WriterTimelineView({
  initialTimeline,
  variant = "page",
  localDirty = false,
  confirmedRevision,
  active = true,
  requestedSceneId = null,
  refreshToken = 0,
  onClose,
  onGoToWriter,
  activeSceneId = null,
  sceneNicknames = {},
  onMoveScene,
}: WriterTimelineViewProps) {
  const [timeline, setTimeline] = useState<WriterTimeline | null>(initialTimeline);
  const [selectedSceneKey, setSelectedSceneKey] = useState<string | null>(null);
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(() => new Set());
  const [environment, setEnvironment] = useState<"all" | TimelineEnvironment>("all");
  const [moment, setMoment] = useState<"all" | TimelineMomentCategory>("all");
  const [zoomIndex, setZoomIndex] = useState(1);
  const [visibleCharacters, setVisibleCharacters] = useState<Set<string>>(
    () => new Set(initialTimeline.characters.slice(0, INITIAL_CHARACTER_TRACKS).map((item) => item.key)),
  );
  const [visibleLocations, setVisibleLocations] = useState<Set<string>>(
    () => new Set(initialTimeline.locations.slice(0, INITIAL_LOCATION_TRACKS).map((item) => item.key)),
  );
  const [showAllCharacterControls, setShowAllCharacterControls] = useState(false);
  const [showAllLocationControls, setShowAllLocationControls] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ sceneId: string; position: WriterSceneMovePosition } | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestSequenceRef = useRef(0);
  const activeRef = useRef(active);
  const abortRef = useRef<AbortController | null>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const timelineRef = useRef<WriterTimeline | null>(initialTimeline);
  const selectedSceneKeyRef = useRef<string | null>(null);
  const [refreshCoordinator] = useState(() => new TimelineRefreshCoordinator(async () => undefined, setRefreshing));
  const Root = variant === "embedded" ? "div" : "main";
  const setRootRef = useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
  }, []);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  useEffect(() => {
    selectedSceneKeyRef.current = selectedSceneKey;
  }, [selectedSceneKey]);

  useEffect(() => {
    activeRef.current = active;
    refreshCoordinator.setActive(active);
    if (!active) {
      abortRef.current?.abort();
    }
  }, [active, refreshCoordinator]);

  useEffect(() => () => {
    activeRef.current = false;
    refreshCoordinator.setActive(false);
    requestSequenceRef.current += 1;
    abortRef.current?.abort();
  }, [refreshCoordinator]);

  const matchingSceneKeys = useMemo(() => {
    if (!timeline) return new Set<string>();
    const keys = new Set<string>();
    for (const scene of timeline.scenes) {
      const characterMatch = selectedCharacters.size === 0
        || scene.characterKeys.some((key) => selectedCharacters.has(key));
      const environmentMatch = environment === "all" || scene.headingData.environment === environment;
      const momentMatch = moment === "all" || scene.headingData.momentCategory === moment;
      if (characterMatch && environmentMatch && momentMatch) keys.add(scene.key);
    }
    return keys;
  }, [environment, moment, selectedCharacters, timeline]);

  const performRefresh = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;
    const currentTimeline = timelineRef.current;
    const previousSelected = currentTimeline?.scenes.find((scene) => scene.key === selectedSceneKeyRef.current) ?? null;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/writer/scripts/${initialTimeline.scriptId}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!activeRef.current || requestSequence !== requestSequenceRef.current) return;
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        setTimeline(null);
        setAccessLost(true);
        refreshCoordinator.setActive(false);
        return;
      }
      const payload = await response.json().catch(() => null) as { script?: RemoteScript; error?: string } | null;
      if (!response.ok || !payload?.script) throw new Error(payload?.error ?? "No se pudo volver a leer el guion.");
      const script = payload.script;
      const next = deriveWriterTimeline({
        scriptId: script.id,
        title: script.title,
        document: script.document,
        schemaVersion: Number(script.schema_version),
        revision: Number(script.revision),
        updatedAt: script.updated_at,
      });
      if (!next.ok) throw new Error(next.message);
      if (!activeRef.current || requestSequence !== requestSequenceRef.current) return;

      pendingScrollLeftRef.current = scrollRef.current?.scrollLeft ?? null;
      const nextSelectedKey = refreshedSceneKey(previousSelected, next.timeline.scenes);
      if (previousSelected && !nextSelectedKey) {
        setNotice("La escena seleccionada ya no existe en esta revisión; se limpió la selección.");
      } else {
        setNotice(next.timeline.revision === currentTimeline?.revision
          ? "Ya estabas viendo la revisión guardada más reciente."
          : `Timeline actualizado a la revisión ${next.timeline.revision}.`);
      }
      setSelectedSceneKey(nextSelectedKey);
      setSelectedCharacters((current) => intersectKeys(current, next.timeline.characters));
      setVisibleCharacters((current) => preserveTrackSelection(current, next.timeline.characters, INITIAL_CHARACTER_TRACKS));
      setVisibleLocations((current) => preserveTrackSelection(current, next.timeline.locations, INITIAL_LOCATION_TRACKS));
      setTimeline(next.timeline);
    } catch (error) {
      if (controller.signal.aborted || !activeRef.current || requestSequence !== requestSequenceRef.current) return;
      setNotice(error instanceof Error
        ? `${error.message} La vista anterior se conservó.`
        : "No se pudo actualizar. La vista anterior se conservó.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [initialTimeline.scriptId, refreshCoordinator]);

  useEffect(() => {
    refreshCoordinator.updateTask(performRefresh);
  }, [performRefresh, refreshCoordinator]);

  const refreshTimeline = useCallback(() => {
    if (!activeRef.current) return;
    setNotice(null);
    refreshCoordinator.request();
  }, [refreshCoordinator]);

  useEffect(() => {
    if (refreshToken <= 0) return;
    const frame = requestAnimationFrame(() => void refreshTimeline());
    return () => cancelAnimationFrame(frame);
  }, [refreshTimeline, refreshToken]);

  useEffect(() => {
    if (pendingScrollLeftRef.current === null) return;
    const left = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = left;
    });
    return () => cancelAnimationFrame(frame);
  }, [timeline?.revision]);

  useEffect(() => {
    if (!timeline || !requestedSceneId) return;
    const frame = requestAnimationFrame(() => {
      const scene = timeline.scenes.find((candidate) => candidate.sourceId === requestedSceneId);
      if (!scene) {
        setNotice("Esta escena todavía no está en la revisión representada. Guarda los cambios y actualiza Timeline.");
        return;
      }
      setSelectedSceneKey(scene.key);
      rootRef.current?.querySelector<HTMLElement>(`[data-timeline-scene-id="${CSS.escape(requestedSceneId)}"]`)?.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedSceneId, timeline]);

  useEffect(() => {
    if (!timeline || !activeSceneId) return;
    const scene = timeline.scenes.find((candidate) => candidate.sourceId === activeSceneId);
    if (scene && scene.key !== selectedSceneKeyRef.current) setSelectedSceneKey(scene.key);
  }, [activeSceneId, timeline]);

  if (!timeline) {
    return (
      <Root className={`timeline-private-state${variant === "embedded" ? " timeline-private-state--embedded" : ""}`}>
        <p className="timeline-eyebrow">Writer · Timeline</p>
        <h1>Esta vista ya no está disponible</h1>
        <p>{accessLost ? "La sesión cambió o ya no tienes acceso a este guion." : "No se pudo cargar el Timeline."}</p>
        <Link href="/writer">Volver a Writer</Link>
      </Root>
    );
  }

  const selectedScene = timeline.scenes.find((scene) => scene.key === selectedSceneKey) ?? null;
  const characterControls = showAllCharacterControls
    ? timeline.characters
    : timeline.characters.slice(0, INITIAL_CHARACTER_TRACKS);
  const locationControls = showAllLocationControls
    ? timeline.locations
    : timeline.locations.slice(0, INITIAL_LOCATION_TRACKS);
  const visibleCharacterTracks = timeline.characters.filter((item) => visibleCharacters.has(item.key));
  const visibleLocationTracks = timeline.locations.filter((item) => visibleLocations.has(item.key));
  const columnWidth = ZOOM_LEVELS[zoomIndex];
  const maxExtensionWords = Math.max(0, ...timeline.scenes.map((scene) => scene.extensionWordCount));
  const reorderFiltered = selectedCharacters.size > 0 || environment !== "all" || moment !== "all";
  const gridStyle = {
    "--timeline-scene-width": `${columnWidth}px`,
    "--timeline-scene-count": Math.max(timeline.scenes.length, 1),
  } as CSSProperties;

  function toggleFilterCharacter(key: string) {
    setSelectedCharacters((current) => toggledSet(current, key));
  }

  function toggleVisibleCharacter(key: string) {
    setVisibleCharacters((current) => toggledSet(current, key));
  }

  function toggleVisibleLocation(key: string) {
    setVisibleLocations((current) => toggledSet(current, key));
  }

  function activateScene(scene: TimelineScene) {
    setSelectedSceneKey(scene.key);
    if (onGoToWriter && scene.sourceId && scene.canDeepLink) onGoToWriter(scene.sourceId);
  }

  return (
    <Root ref={setRootRef} className={`timeline-page${variant === "embedded" ? " timeline-page--embedded" : ""}`}>
      <header className="timeline-header">
        <div className="timeline-brand">
          <Link href="/" aria-label="FILMATTA — Inicio">FILMATTA</Link>
          <span aria-hidden="true" />
          <Link href="/writer">Writer</Link>
          <b>Timeline</b>
        </div>
        <div className="timeline-title">
          <p>{timeline.title}</p>
          <span>Versión guardada · revisión {timeline.revision} · {formatDate(timeline.updatedAt)}</span>
        </div>
        <div className="timeline-header-actions">
          <button className="timeline-refresh" type="button" onClick={() => void refreshTimeline()} disabled={refreshing}>
            {refreshing ? "Actualizando…" : "Actualizar Timeline"}
          </button>
          {onClose && <button className="timeline-close" type="button" onClick={onClose}>Cerrar</button>}
        </div>
      </header>

      <section className="timeline-intro" aria-labelledby="timeline-heading">
        <div>
          <p className="timeline-eyebrow">Orden de escenas</p>
          <h1 id="timeline-heading">Vista estructural del guion</h1>
          <p>Representación derivada y de sólo lectura. El eje muestra orden, no minutos, páginas ni plan de rodaje.</p>
        </div>
        <p className={`timeline-sync-help${localDirty || (confirmedRevision ?? timeline.revision) > timeline.revision ? " is-stale" : ""}`}>
          {localDirty
            ? "Hay cambios locales pendientes que todavía no aparecen en esta revisión."
            : (confirmedRevision ?? timeline.revision) > timeline.revision
              ? `Existe una revisión guardada posterior (${confirmedRevision}). Actualiza Timeline cuando quieras consultarla.`
              : "Timeline representa la última revisión remota cargada."}
        </p>
      </section>

      <section className="timeline-summary" aria-label="Resumen del guion">
        <Summary value={timeline.scenes.length} label="Escenas" />
        <Summary value={timeline.characters.length} label="Personajes detectados" />
        <Summary value={timeline.locations.length} label="Espacios identificados" />
        <Summary value={timeline.totalBodyWords} label="Palabras de acción y diálogo" />
      </section>

      {timeline.preamble && (
        <aside className="timeline-preamble">
          <strong>Texto antes de la primera escena</strong>
          <span>{timeline.preamble.wordCount} palabras de acción y diálogo</span>
          {timeline.preamble.excerpt && <p>{timeline.preamble.excerpt}</p>}
        </aside>
      )}

      <section className="timeline-controls" aria-label="Controles de vista y filtros">
        <div className="timeline-control-group">
          <span>Zoom visual</span>
          <div className="timeline-button-group">
            <button type="button" onClick={() => setZoomIndex((value) => Math.max(0, value - 1))} disabled={zoomIndex === 0}>Alejar</button>
            <button type="button" onClick={() => setZoomIndex((value) => Math.min(ZOOM_LEVELS.length - 1, value + 1))} disabled={zoomIndex === ZOOM_LEVELS.length - 1}>Acercar</button>
            <button type="button" onClick={() => setZoomIndex(1)} disabled={zoomIndex === 1}>Restablecer</button>
          </div>
        </div>
        <label>
          Entorno
          <select value={environment} onChange={(event) => setEnvironment(event.target.value as typeof environment)}>
            <option value="all">Todos</option>
            <option value="interior">Interior</option>
            <option value="exterior">Exterior</option>
            <option value="mixed">Mixto</option>
            <option value="unknown">No identificado</option>
          </select>
        </label>
        <label>
          Momento
          <select value={moment} onChange={(event) => setMoment(event.target.value as typeof moment)}>
            <option value="all">Todos</option>
            <option value="day">Día</option>
            <option value="night">Noche</option>
            <option value="other">Otro explícito</option>
            <option value="unspecified">Sin especificar</option>
          </select>
        </label>
        <div className="timeline-match-count" aria-live="polite">
          {matchingSceneKeys.size} de {timeline.scenes.length} escenas coinciden
        </div>
      </section>

      {timeline.characters.length > 0 && (
        <section className="timeline-filter-characters" aria-labelledby="character-filter-title">
          <div>
            <strong id="character-filter-title">Filtrar por personaje</strong>
            <p>Coincide si la escena contiene al menos uno de los seleccionados.</p>
          </div>
          <div className="timeline-chip-list">
            {characterControls.map((character) => (
              <button
                key={character.key}
                type="button"
                aria-pressed={selectedCharacters.has(character.key)}
                onClick={() => toggleFilterCharacter(character.key)}
              >
                {character.name}
              </button>
            ))}
            {timeline.characters.length > INITIAL_CHARACTER_TRACKS && (
              <button type="button" onClick={() => setShowAllCharacterControls((value) => !value)}>
                {showAllCharacterControls ? "Ver menos" : `Ver ${timeline.characters.length - INITIAL_CHARACTER_TRACKS} más`}
              </button>
            )}
            {selectedCharacters.size > 0 && <button type="button" onClick={() => setSelectedCharacters(new Set())}>Limpiar</button>}
          </div>
        </section>
      )}

      {notice && <p className="timeline-notice" role="status">{notice}</p>}
      {reorderFiltered && onMoveScene && (
        <p className="timeline-reorder-notice" role="status">Quita los filtros para reordenar escenas.</p>
      )}

      {timeline.scenes.length === 0 ? (
        <section className="timeline-no-scenes">
          <p className="timeline-eyebrow">Sin escenas derivadas</p>
          <h2>Timeline utiliza bloques “Encabezado de escena”</h2>
          <p>Este guion todavía no contiene encabezados. El texto de acción no se convierte automáticamente en escenas.</p>
        </section>
      ) : (
        <>
          <section className="timeline-track-controls" aria-label="Pistas visibles">
            <TrackControlGroup
              title="Personajes indicados"
              help="Personajes indicados en bloques de personaje. No incluye apariciones descritas sólo en la acción."
              items={characterControls}
              visible={visibleCharacters}
              toggle={toggleVisibleCharacter}
              expanded={showAllCharacterControls}
              canExpand={timeline.characters.length > INITIAL_CHARACTER_TRACKS}
              onExpand={() => setShowAllCharacterControls((value) => !value)}
            />
            <TrackControlGroup
              title="Espacios del guion"
              help="Agrupados sólo cuando el nombre normalizado coincide exactamente."
              items={locationControls}
              visible={visibleLocations}
              toggle={toggleVisibleLocation}
              expanded={showAllLocationControls}
              canExpand={timeline.locations.length > INITIAL_LOCATION_TRACKS}
              onExpand={() => setShowAllLocationControls((value) => !value)}
            />
          </section>

          <section className="timeline-canvas-region" aria-label="Timeline visual">
            <div ref={scrollRef} className="timeline-scroll" tabIndex={0} aria-label="Timeline con desplazamiento horizontal">
              <div className="timeline-grid" style={gridStyle}>
                <div className="timeline-row timeline-scene-row">
                  <div className="timeline-lane-label timeline-lane-label--header">
                    <span>Escenas</span>
                    <small>ORDEN</small>
                  </div>
                  {timeline.scenes.map((scene, index) => (
                    <div
                      key={scene.key}
                      data-timeline-scene-id={scene.sourceId ?? undefined}
                      className={`${sceneClasses(scene, selectedSceneKey, matchingSceneKeys)}${draggedSceneId === scene.sourceId ? " is-dragging" : ""}${dropTarget?.sceneId === scene.sourceId ? ` is-drop-${dropTarget.position}` : ""}`}
                      aria-pressed={selectedSceneKey === scene.key}
                      title={`Extensión: ${scene.extensionWordCount} palabras`}
                      onDragOver={(event) => {
                        if (reorderFiltered || !onMoveScene || !draggedSceneId || !scene.sourceId || draggedSceneId === scene.sourceId) return;
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setDropTarget({ sceneId: scene.sourceId, position: event.clientX < bounds.left + bounds.width / 2 ? "before" : "after" });
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedSceneId && dropTarget && onMoveScene && !reorderFiltered) {
                          onMoveScene(draggedSceneId, dropTarget.sceneId, dropTarget.position);
                        }
                        setDraggedSceneId(null);
                        setDropTarget(null);
                      }}
                    >
                      <button
                        type="button"
                        className="timeline-scene-activate"
                        onClick={() => activateScene(scene)}
                        aria-pressed={selectedSceneKey === scene.key}
                        aria-label={`Escena ${scene.order}: ${sceneNicknames[scene.sourceId ?? ""] || scene.heading}, ${scene.wordCount} palabras`}
                        title={`Extensión: ${scene.extensionWordCount} palabras`}
                      >
                        <strong>{scene.order}</strong>
                        <span>{sceneNicknames[scene.sourceId ?? ""] || scene.heading}</span>
                        {sceneNicknames[scene.sourceId ?? ""] && <small>{scene.heading}</small>}
                        <i className="timeline-extension" aria-hidden="true">
                          <i style={{ width: `${timelineExtensionWidth(scene.extensionWordCount, maxExtensionWords)}%` }} />
                        </i>
                      </button>
                      {onMoveScene && scene.sourceId && (
                        <div className="timeline-scene-structural-actions">
                          <button
                            type="button"
                            className="timeline-scene-drag-handle"
                            draggable={!reorderFiltered}
                            disabled={reorderFiltered}
                            aria-label={`Mover escena ${scene.order}`}
                            title={reorderFiltered ? "Quita los filtros para reordenar escenas." : "Arrastrar para reordenar"}
                            onDragStart={(event) => {
                              if (reorderFiltered) return event.preventDefault();
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", scene.sourceId!);
                              setWriterDragPreview(event.nativeEvent, event.currentTarget.closest(".timeline-scene-cell") as HTMLElement);
                              setDraggedSceneId(scene.sourceId!);
                            }}
                            onDragEnd={() => { setDraggedSceneId(null); setDropTarget(null); }}
                          >⋮⋮</button>
                          <button type="button" disabled={reorderFiltered || index === 0} aria-label={`Mover escena ${scene.order} arriba`} onClick={() => {
                            const previous = timeline.scenes[index - 1];
                            if (previous?.sourceId) onMoveScene(scene.sourceId!, previous.sourceId, "before");
                          }}>←</button>
                          <button type="button" disabled={reorderFiltered || index === timeline.scenes.length - 1} aria-label={`Mover escena ${scene.order} abajo`} onClick={() => {
                            const next = timeline.scenes[index + 1];
                            if (next?.sourceId) onMoveScene(scene.sourceId!, next.sourceId, "after");
                          }}>→</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <TrackGroupTitle title="Personajes indicados" />
                {visibleCharacterTracks.length === 0
                  ? <EmptyTrackRow message="No hay pistas de personajes visibles." />
                  : visibleCharacterTracks.map((track) => (
                    <TrackRow key={track.key} track={track} scenes={timeline.scenes} selectedSceneKey={selectedSceneKey} matchingSceneKeys={matchingSceneKeys} onActivateScene={activateScene} />
                  ))}

                <TrackGroupTitle title="Espacios del guion" />
                {visibleLocationTracks.length === 0
                  ? <EmptyTrackRow message="No hay pistas de espacios visibles." />
                  : visibleLocationTracks.map((track) => (
                    <TrackRow key={track.key} track={track} scenes={timeline.scenes} selectedSceneKey={selectedSceneKey} matchingSceneKeys={matchingSceneKeys} onActivateScene={activateScene} />
                  ))}
              </div>
            </div>
          </section>
        </>
      )}

      {selectedScene && (
        <SceneDetail
          scene={selectedScene}
          characters={timeline.characters}
          scriptId={timeline.scriptId}
          onGoToWriter={onGoToWriter}
          onActivateScene={activateScene}
        />
      )}

      {timeline.scenes.length > 0 && (
        <details className="timeline-accessible-list">
          <summary>Lista textual de escenas</summary>
          <ol>
            {timeline.scenes.map((scene) => (
              <li key={scene.key} className={matchingSceneKeys.has(scene.key) ? "" : "is-muted"}>
                <button type="button" onClick={() => activateScene(scene)}>
                  <strong>Escena {scene.order}: {scene.heading}</strong>
                  <span>{scene.wordCount} palabras · {environmentLabel(scene.headingData.environment)} · {scene.headingData.moment ?? "Momento sin especificar"}</span>
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Root>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return <div><strong>{value.toLocaleString("es-MX")}</strong><span>{label}</span></div>;
}

function TrackControlGroup<T extends { key: string; name: string }>({
  title, help, items, visible, toggle, expanded, canExpand, onExpand,
}: {
  title: string;
  help: string;
  items: T[];
  visible: Set<string>;
  toggle: (key: string) => void;
  expanded: boolean;
  canExpand: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="timeline-track-control-group">
      <strong>{title}</strong>
      <p>{help}</p>
      <div>
        {items.map((item) => (
          <button key={item.key} type="button" aria-pressed={visible.has(item.key)} onClick={() => toggle(item.key)}>
            {visible.has(item.key) ? "Ocultar" : "Mostrar"} {item.name}
          </button>
        ))}
        {canExpand && <button type="button" onClick={onExpand}>{expanded ? "Ver menos" : "Ver más pistas"}</button>}
      </div>
    </div>
  );
}

function TrackGroupTitle({ title }: { title: string }) {
  return <div className="timeline-group-title"><strong>{title}</strong></div>;
}

function EmptyTrackRow({ message }: { message: string }) {
  return <div className="timeline-empty-track"><div className="timeline-lane-label"><span>{message}</span></div></div>;
}

function TrackRow({
  track, scenes, selectedSceneKey, matchingSceneKeys, onActivateScene,
}: {
  track: TimelineCharacter | TimelineLocation;
  scenes: TimelineScene[];
  selectedSceneKey: string | null;
  matchingSceneKeys: Set<string>;
  onActivateScene: (scene: TimelineScene) => void;
}) {
  const sceneKeys = new Set(track.sceneKeys);
  const color = stableColor(track.key);
  return (
    <div className="timeline-row timeline-track-row" style={{ "--track-color": color } as CSSProperties}>
      <div className="timeline-lane-label"><span className="timeline-track-dot" aria-hidden="true" />{track.name}</div>
      {scenes.map((scene) => {
        const hasMark = sceneKeys.has(scene.key);
        const className = `timeline-track-cell${hasMark ? " has-mark" : ""}${selectedSceneKey === scene.key ? " is-selected" : ""}${matchingSceneKeys.has(scene.key) ? "" : " is-filtered"}`;
        return hasMark ? (
          <button
            key={scene.key}
            type="button"
            className={className}
            aria-label={`${track.name}, escena ${scene.order}`}
            onClick={() => onActivateScene(scene)}
          ><span aria-hidden="true" /></button>
        ) : <div key={scene.key} className={className} aria-hidden="true" />;
      })}
    </div>
  );
}

function SceneDetail({
  scene,
  characters,
  scriptId,
  onGoToWriter,
  onActivateScene,
}: {
  scene: TimelineScene;
  characters: TimelineCharacter[];
  scriptId: string;
  onGoToWriter?: (sceneId: string) => void;
  onActivateScene: (scene: TimelineScene) => void;
}) {
  const names = scene.characterKeys
    .map((key) => characters.find((character) => character.key === key)?.name)
    .filter((name): name is string => Boolean(name));
  return (
    <aside className="timeline-detail" aria-labelledby="scene-detail-title">
      <div className="timeline-detail-heading">
        <div>
          <p className="timeline-eyebrow">Escena {scene.order}</p>
          <h2 id="scene-detail-title">{scene.heading}</h2>
        </div>
        <span>{scene.wordCount} palabras de acción y diálogo</span>
      </div>
      <dl>
        <div><dt>Extensión</dt><dd>{scene.extensionWordCount.toLocaleString("es-MX")} palabras</dd></div>
        <div><dt>Personajes indicados</dt><dd>{names.length ? names.join(", ") : "Ninguno indicado"}</dd></div>
        <div><dt>Espacio</dt><dd>{scene.headingData.location ?? "Sin identificar"}</dd></div>
        <div><dt>Entorno</dt><dd>{environmentLabel(scene.headingData.environment)}</dd></div>
        <div><dt>Momento</dt><dd>{scene.headingData.moment ?? "Sin especificar"}</dd></div>
      </dl>
      <div className="timeline-excerpt">
        <strong>Fragmento de acción y diálogo</strong>
        <p>{scene.excerpt ?? "Esta escena no contiene texto de acción o diálogo."}</p>
      </div>
      {scene.issues.map((issue) => <p className="timeline-scene-issue" key={issue}>{issue}</p>)}
      <div className="timeline-detail-actions">
        {scene.sourceId && scene.canDeepLink
          ? onGoToWriter
            ? <button type="button" onClick={() => onActivateScene(scene)}>Ir al guion</button>
            : <Link href={writerDocumentHref(scriptId, scene.sourceId)}>Ir al guion</Link>
          : <button type="button" disabled title="Esta escena no tiene un identificador persistente.">Ir al guion</button>}
      </div>
    </aside>
  );
}

function sceneClasses(scene: TimelineScene, selected: string | null, matches: Set<string>) {
  return `timeline-scene-cell${selected === scene.key ? " is-selected" : ""}${matches.has(scene.key) ? "" : " is-filtered"}`;
}

function toggledSet(current: Set<string>, key: string) {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function intersectKeys<T extends { key: string }>(current: Set<string>, items: T[]) {
  const available = new Set(items.map((item) => item.key));
  return new Set([...current].filter((key) => available.has(key)));
}

function preserveTrackSelection<T extends { key: string }>(current: Set<string>, items: T[], fallbackCount: number) {
  const retained = intersectKeys(current, items);
  if (retained.size > 0 || items.length === 0) return retained;
  return new Set(items.slice(0, fallbackCount).map((item) => item.key));
}

function stableColor(value: string) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)!) | 0;
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue} 62% 62%)`;
}

function environmentLabel(value: TimelineEnvironment) {
  if (value === "interior") return "Interior";
  if (value === "exterior") return "Exterior";
  if (value === "mixed") return "Mixto";
  return "Sin identificar";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
