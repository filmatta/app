"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import ProductionCalendar from "@/components/production/ProductionCalendar";
import ProductionDocuments from "@/components/production/ProductionDocuments";
import { ContactCatalog, LocationCatalog } from "@/components/production/ProductionCatalogs";
import {
  createDayAction,
  createRequirementAction,
  createResourceAction,
  createScheduleBlockAction,
  createTaskAction,
  deleteDayAction,
  deleteScheduleItemAction,
  deleteTaskAction,
  importRequirementsAction,
  linkProductionSourcesAction,
  moveScheduleItemAction,
  reorderScheduleItemAction,
  scheduleSourceAction,
  updateDayAction,
  updateProductionSettingsAction,
  updateRequirementAction,
  updateResourceAction,
  updateScheduleItemAction,
  updateTaskAction,
  updateTaskStatusAction,
  upsertCoverageAction,
} from "@/app/production/actions";
import type {
  ActionResult,
  CoverageStatus,
  LogisticsType,
  ProductionDay,
  ProductionRequirement,
  ProductionScheduleItem,
  ProductionWorkspaceData,
  RequirementCategory,
  ResourceType,
  SourceGroup,
} from "@/lib/production/types";

type WorkspaceView = "overview" | "calendar" | "days" | "locations" | "contacts" | "documents" | "tasks" | "requirements" | "resources";
type SaveState = "idle" | "saving" | "saved" | "error";

const nav: Array<{ id: WorkspaceView; icon: string; label: string }> = [
  { id: "overview", icon: "▦", label: "Resumen" },
  { id: "calendar", icon: "▦", label: "Calendario" },
  { id: "days", icon: "□", label: "Plan de rodaje" },
  { id: "locations", icon: "⌖", label: "Locaciones" },
  { id: "contacts", icon: "♧", label: "Contactos" },
  { id: "resources", icon: "◎", label: "Recursos" },
  { id: "requirements", icon: "◇", label: "Necesidades" },
  { id: "tasks", icon: "✓", label: "Tareas" },
  { id: "documents", icon: "▤", label: "Documentos" },
];

const requirementLabels: Record<RequirementCategory, string> = {
  talent: "Talento", crew: "Crew", location: "Locación", prop: "Utilería", wardrobe: "Vestuario",
  vehicle: "Vehículo", animal: "Animal", makeup: "Maquillaje", practical_effect: "Efecto práctico",
  visual_effect: "Efecto visual", stunt: "Acción especializada", sound_music: "Sonido / música",
  equipment: "Equipo", service: "Servicio", other: "Otro",
};
const resourceLabels: Record<ResourceType, string> = {
  person: "Persona", location: "Locación", prop: "Utilería", wardrobe: "Vestuario", vehicle: "Vehículo",
  equipment: "Equipo", service: "Servicio", other: "Otro",
};

export default function ProductionWorkspace({ initialData: data, viewerName }: { initialData: ProductionWorkspaceData; viewerName: string }) {
  const router = useRouter();
  const [view, setView] = useState<WorkspaceView>("overview");
  const [activeDayId, setActiveDayId] = useState<string | null>(data.days[0]?.id ?? null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState<string | null>(data.requirements[0]?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [locationCreateRequest, setLocationCreateRequest] = useState(0);

  const resolvedActiveDayId = data.days.some((day) => day.id === activeDayId) ? activeDayId : data.days[0]?.id ?? null;
  const resolvedSelectedItemId = data.scheduleItems.some((item) => item.id === selectedItemId) ? selectedItemId : null;
  const resolvedRequirementId = data.requirements.some((item) => item.id === selectedRequirementId) ? selectedRequirementId : data.requirements[0]?.id ?? null;
  const activeDay = data.days.find((day) => day.id === resolvedActiveDayId) ?? null;
  const selectedItem = data.scheduleItems.find((item) => item.id === resolvedSelectedItemId) ?? null;
  const selectedRequirement = data.requirements.find((item) => item.id === resolvedRequirementId) ?? null;
  const scheduledShots = new Set(data.scheduleItems.flatMap((item) => item.sourceShotId ? [item.sourceShotId] : []));
  const scheduledScenes = new Set(data.scheduleItems.flatMap((item) => item.sourceSceneId ? [item.sourceSceneId] : []));
  const sourceShotCount = data.source.groups.reduce((total, group) => total + group.shots.length, 0);
  const dayItems = activeDay ? data.scheduleItems.filter((item) => item.dayId === activeDay.id).sort((a, b) => a.position - b.position) : [];
  const daySceneIds = new Set(dayItems.flatMap((item) => item.sourceSceneId ? [item.sourceSceneId] : []));
  const dayRequirements = activeDay ? data.requirements.filter((requirement) =>
    requirement.sourceSceneIds.some((sceneId) => daySceneIds.has(sceneId))
    || data.coverages.some((coverage) => coverage.dayId === activeDay.id && coverage.requirementId === requirement.id)
  ) : [];
  const confirmedDayRequirements = activeDay ? dayRequirements.filter((requirement) => data.coverages.some((coverage) =>
    coverage.dayId === activeDay.id && coverage.requirementId === requirement.id && coverage.status === "confirmed" && !coverage.needsReconfirmation
  )).length : 0;
  const pendingTasks = data.tasks.filter((task) => task.status !== "done").length;
  const selectedCoverage = activeDay && selectedRequirement
    ? data.coverages.find((coverage) => coverage.dayId === activeDay.id && coverage.requirementId === selectedRequirement.id) ?? null
    : null;
  const sourceWarnings = sourceWarningList(data);
  const overlaps = activeDay ? detectOverlaps(dayItems, activeDay) : [];
  const locations = data.resources.filter((resource) => resource.resourceType === "location");
  const contacts = data.resources.filter((resource) => resource.resourceType === "person");
  const locationRequirementIds = new Set(data.requirements.filter((requirement) => requirement.category === "location").map((requirement) => requirement.id));
  const linkedLocationIds = new Set(activeDay ? data.coverages.filter((coverage) => coverage.dayId === activeDay.id && coverage.resourceId && coverage.status !== "unavailable" && locationRequirementIds.has(coverage.requirementId)).map((coverage) => coverage.resourceId) : []);
  const dayLocations = locations.filter((location) => linkedLocationIds.has(location.id));
  const contextLocations = dayLocations.length ? dayLocations : locations;

  async function mutate<T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) {
    if (busyKey) return false;
    setBusyKey(key); setSaveState("saving"); setError(null);
    let result: ActionResult<T>;
    try {
      result = await operation;
    } catch {
      setBusyKey(null); setSaveState("error"); setError("No pudimos guardar el cambio. Revisa tu conexión e intenta de nuevo.");
      return false;
    }
    if (!result.ok) {
      setBusyKey(null); setSaveState("error"); setError(result.message);
      return false;
    }
    setBusyKey(null); setSaveState("saved"); after?.(); router.refresh();
    window.setTimeout(() => setSaveState("idle"), 2200);
    return true;
  }

  async function scheduleGroup(group: SourceGroup) {
    const unscheduled = group.shots.filter((shot) => !scheduledShots.has(shot.id));
    if (!activeDay || !unscheduled.length || busyKey) return;
    setBusyKey(`group-${group.id}`); setSaveState("saving"); setError(null);
    for (const shot of unscheduled) {
      const result = await scheduleSourceAction({ productionId: data.production.id, dayId: activeDay.id, sourceKind: "shot", sourceId: shot.id });
      if (!result.ok) { setBusyKey(null); setSaveState("error"); setError(result.message); return; }
    }
    setBusyKey(null); setSaveState("saved"); router.refresh();
  }

  const stats = [
    { icon: "□", value: data.days.length, label: "Jornadas" },
    sourceShotCount
      ? { icon: "▣", value: `${scheduledShots.size} / ${sourceShotCount}`, label: "Planos" }
      : { icon: "▣", value: scheduledScenes.size, label: "Escenas" },
    { icon: "⌖", value: locations.length, label: "Locaciones" },
    { icon: "♧", value: contacts.length, label: "Contactos" },
  ];

  return (
    <div className="production-workspace">
      <header className="production-header">
        <div className="production-brand"><Link href="/">FILMATTA</Link><span /><strong className="production-project-name" title={data.production.name}>{data.production.name}</strong></div>
        <nav aria-label="Flujo creativo"><Link href="/writer">Writer</Link><span aria-disabled="true">Breakdown</span><Link href="/shotlists">Shotlist</Link>{data.production.shotlistId ? <Link href={`/shotlists/${data.production.shotlistId}/storyboard`}>Storyboard</Link> : <span aria-disabled="true">Storyboard</span>}<b>Production</b><span aria-disabled="true">Rec</span></nav>
        <div className="production-header-context"><span className={`production-save is-${saveState}`}>{saveState === "saving" ? "Guardando…" : saveState === "error" ? "Error" : saveState === "saved" ? "Guardado" : "En línea"}</span><div className="production-avatar">{viewerName.slice(0, 2).toUpperCase()}</div></div>
      </header>

      <aside className="production-sidebar">
        <div><p>PRODUCTION ASSISTANT</p><h2>{data.production.name}</h2><span>{sourceDescription(data)}</span></div>
        <nav aria-label="Secciones de Production">
          {nav.map((item) => <button key={item.id} type="button" className={view === item.id ? "is-active" : ""} onClick={() => { if (item.id === "locations") setLocationCreateRequest(0); setView(item.id); }}><i>{item.icon}</i>{item.label}{item.id === "tasks" && pendingTasks > 0 && <em>{pendingTasks}</em>}</button>)}
        </nav>
        <section className="production-sidebar-day">
          <span>Jornada activa</span><strong>{activeDay?.name ?? "Sin jornada"}</strong><small>{activeDay?.shootDate ? formatDate(activeDay.shootDate) : "Fecha por definir"}</small>
          <button type="button" onClick={() => setView("days")}>{activeDay ? "Ver planificación" : "Crear jornada"} →</button>
        </section>
        <Link className="production-sidebar-back" href="/production">← Todas las producciones</Link>
      </aside>

      <main className="production-main">
        <section className="production-title-row"><div><p className="production-eyebrow">FILMATTA PRODUCTION</p><h1>{viewTitle(view)}</h1><span>{viewSubtitle(view)}</span></div><div className="production-title-actions"><div className="production-view-switch" aria-label="Vista de producción"><button type="button" className={view === "calendar" ? "is-active" : ""} onClick={() => setView("calendar")}>Calendario</button><button type="button" className={view === "days" ? "is-active" : ""} onClick={() => setView("days")}>Jornadas</button><button type="button" className={view === "locations" ? "is-active" : ""} onClick={() => { setLocationCreateRequest(0); setView("locations"); }}>Locaciones</button></div>{activeDay && <div className="production-active-day"><i /> {activeDay.name} · {activeDay.shootDate ? formatDate(activeDay.shootDate) : "sin fecha"}</div>}</div></section>
        <section className="production-stats" aria-label="Indicadores de producción">{stats.map((stat) => <article key={stat.label}><i>{stat.icon}</i><div><strong>{stat.value}</strong><span>{stat.label}</span></div></article>)}<button type="button" className="production-pack-link" onClick={() => setView("documents")}>Production Pack →</button></section>
        {error && <div className="production-error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)}>×</button></div>}
        {sourceWarnings.length > 0 && <div className="production-source-banner"><strong>Fuente para revisar</strong><span>{sourceWarnings.join(" · ")}</span></div>}

        {view === "overview" && (data.days.length ? <DaysView
          data={data} activeDay={activeDay} setActiveDayId={setActiveDayId} dayItems={dayItems} overlaps={overlaps}
          selectedItemId={selectedItemId} setSelectedItemId={setSelectedItemId} scheduledShots={scheduledShots}
          mutate={mutate} busyKey={busyKey} scheduleGroup={scheduleGroup}
        /> : <OverviewView data={data} stats={{ sourceShotCount, scheduledShots: scheduledShots.size, scheduledScenes: scheduledScenes.size, confirmedDayRequirements, dayRequirements: dayRequirements.length, pendingTasks }} setView={setView} />)}
        {view === "calendar" && <ProductionCalendar data={data} activeDayId={resolvedActiveDayId} onSelectDay={(id) => setActiveDayId(id)} onOpenDay={() => setView("days")} />}
        {view === "days" && <DaysView
          data={data} activeDay={activeDay} setActiveDayId={setActiveDayId} dayItems={dayItems} overlaps={overlaps}
          selectedItemId={selectedItemId} setSelectedItemId={setSelectedItemId} scheduledShots={scheduledShots}
          mutate={mutate} busyKey={busyKey} scheduleGroup={scheduleGroup}
        />}
        {view === "requirements" && <RequirementsView
          data={data} activeDay={activeDay} selectedRequirement={selectedRequirement} setSelectedRequirementId={setSelectedRequirementId}
          selectedCoverage={selectedCoverage} mutate={mutate} busyKey={busyKey}
        />}
        {view === "resources" && <ResourcesView data={data} mutate={mutate} busyKey={busyKey} />}
        {view === "locations" && <LocationCatalog data={data} mutate={mutate} busyKey={busyKey} createRequest={locationCreateRequest} />}
        {view === "contacts" && <ContactCatalog data={data} mutate={mutate} busyKey={busyKey} />}
        {view === "documents" && <ProductionDocuments data={data} activeDayId={resolvedActiveDayId} viewerName={viewerName} />}
        {view === "tasks" && <TasksView data={data} activeDay={activeDay} mutate={mutate} busyKey={busyKey} />}
      </main>

      <aside className="production-context">
        {selectedItem && (view === "days" || view === "overview" && data.days.length > 0) && <ItemInspector productionId={data.production.id} item={selectedItem} mutate={mutate} busyKey={busyKey} />}
        <section className="production-context-locations"><header><h3>{dayLocations.length ? "Locaciones del día" : "Locaciones registradas"}</h3><button type="button" className="production-context-link" onClick={() => { setLocationCreateRequest(0); setView("locations"); }}>Ver todas →</button></header>{activeDay && !dayLocations.length && locations.length > 0 && <p className="production-context-empty">Aún no hay locación asignada a esta jornada. Mostrando el directorio de la producción.</p>}{contextLocations.length ? <ul className="production-location-list">{contextLocations.slice(0, 3).map((location) => <li key={location.id}><span className="production-location-glyph" aria-hidden="true">⌖</span><div><strong>{location.name}</strong><small>{location.address ?? "Dirección por agregar"}</small></div></li>)}</ul> : <p className="production-context-empty">Aún no hay locaciones. Agrega la primera para tenerla a mano durante la planificación.</p>}<button type="button" className="production-context-action" onClick={() => { setLocationCreateRequest((current) => current + 1); setView("locations"); }}>＋ Agregar locación</button></section>
        <section><header><h3>Clima</h3><span>{activeDay?.shootDate ? formatShortDate(activeDay.shootDate) : "—"}</span></header><div className="production-weather"><b>☼</b><span><strong>Pronóstico no disponible</strong><small>{!activeDay?.shootDate ? "Fecha de rodaje pendiente" : !dayLocations.length ? "Locación de la jornada pendiente" : "Pendiente de conexión meteorológica"}</small></span></div></section>
        <section><header><h3>Notas de producción</h3><span>{activeDay ? activeDay.name : "—"}</span></header>{activeDay?.notes ? <p className="production-context-notes">{activeDay.notes}</p> : <p className="production-context-empty">Sin notas para esta jornada.</p>}<button type="button" className="production-context-action" onClick={() => setView("days")}>{activeDay?.notes ? "Editar notas" : "＋ Añadir nota"}</button></section>
        <section><header><h3>Detalle de jornada</h3><span>{activeDay ? activeDay.name : "—"}</span></header>{activeDay ? <dl className="production-context-list"><div><dt>Fecha</dt><dd>{activeDay.shootDate ? formatDate(activeDay.shootDate) : "Por definir"}</dd></div><div><dt>Call</dt><dd>{activeDay.callTime ?? "Por definir"}</dd></div><div><dt>Wrap</dt><dd>{activeDay.wrapTime ? `${activeDay.wrapTime}${activeDay.wrapNextDay ? " +1" : ""}` : "Por definir"}</dd></div><div><dt>Bloques</dt><dd>{dayItems.length}</dd></div></dl> : <p className="production-context-empty">Crea una jornada para empezar a programar.</p>}</section>
        <section><header><h3>Documentos del día</h3><button type="button" className="production-context-link" onClick={() => setView("documents")}>Ver centro →</button></header>{activeDay ? <div className="production-context-docs"><a href={`/production/${data.production.id}/documents/call-sheet?day=${activeDay.id}`} target="_blank" rel="noreferrer">▤ Call Sheet <span>↗</span></a><a href={`/production/${data.production.id}/documents/calendar`} target="_blank" rel="noreferrer">□ Calendario PDF <span>↗</span></a></div> : <p className="production-context-empty">El Call Sheet estará disponible al crear una jornada.</p>}</section>
        <section><header><h3>Necesidades del día</h3><span>{activeDay ? `${confirmedDayRequirements}/${dayRequirements.length}` : "—"}</span></header>{dayRequirements.length ? <ul className="production-compact-list">{dayRequirements.slice(0, 6).map((requirement) => { const coverage = data.coverages.find((item) => item.dayId === activeDay?.id && item.requirementId === requirement.id); return <li key={requirement.id}><i className={`is-${coverage?.status ?? "unassigned"}`} /><span><strong>{requirement.name}</strong><small>{coverageLabel(coverage?.status, coverage?.needsReconfirmation)}</small></span><button type="button" onClick={() => { setSelectedRequirementId(requirement.id); setView("requirements"); }}>→</button></li>; })}</ul> : <p className="production-context-empty">{data.requirements.length ? "Programa escenas para ver sus necesidades aquí." : "Sin necesidades registradas."}</p>}</section>
        <SettingsPanel data={data} mutate={mutate} busyKey={busyKey} />
      </aside>
    </div>
  );
}

function OverviewView({ data, stats, setView }: {
  data: ProductionWorkspaceData;
  stats: { sourceShotCount: number; scheduledShots: number; scheduledScenes: number; confirmedDayRequirements: number; dayRequirements: number; pendingTasks: number };
  setView: (view: WorkspaceView) => void;
}) {
  const empty = data.days.length === 0 && data.scheduleItems.length === 0;
  return <div className="production-view production-overview-view">
    {empty ? <section className="production-workspace-empty">
      <div className="production-empty-visual" aria-hidden="true"><span className="production-script-stack">FUENTES</span><b>→</b><span className="production-shot-stack">ESCENAS<br />PLANOS</span><b>→</b><span className="production-plan-stack">JORNADAS</span></div>
      <div><p className="production-eyebrow">DE GUION A SET</p><h2>Prepara tu producción</h2><p>{data.production.scriptId || data.production.shotlistId ? "Tus fuentes están vinculadas. Crea la primera jornada y decide qué se rueda, cuándo y con qué recursos." : "Empieza con una jornada manual o vincula un guion y una Shotlist desde la configuración."}</p><button type="button" className="production-primary" onClick={() => setView("days")}>＋ CREAR PRIMERA JORNADA</button><small>No se generarán horarios ni decisiones de rodaje automáticamente.</small></div>
    </section> : <>
      <section className="production-overview-grid">
        <article><p className="production-eyebrow">PROGRAMACIÓN</p><h2>{stats.sourceShotCount ? `${stats.scheduledShots} de ${stats.sourceShotCount} planos` : `${stats.scheduledScenes} escenas`}</h2><p>{stats.sourceShotCount && stats.scheduledShots < stats.sourceShotCount ? "Hay planos actuales todavía sin programar." : "Revisa el orden y los horarios de cada jornada."}</p><button type="button" onClick={() => setView("days")}>Abrir jornadas →</button></article>
        <article><p className="production-eyebrow">COBERTURA</p><h2>{stats.dayRequirements ? `${stats.confirmedDayRequirements} de ${stats.dayRequirements}` : "Sin necesidades registradas"}</h2><p>{stats.dayRequirements ? "Confirmaciones de la jornada seleccionada." : "Importa el desglose vigente o registra necesidades manuales."}</p><button type="button" onClick={() => setView("requirements")}>Revisar necesidades →</button></article>
        <article><p className="production-eyebrow">TAREAS</p><h2>{stats.pendingTasks} pendientes</h2><p>Programación, cobertura y tareas se mantienen como señales separadas.</p><button type="button" onClick={() => setView("tasks")}>Ver tareas →</button></article>
      </section>
      <section className="production-day-strip"><header><div><h2>Jornadas</h2><p>Plan de rodaje en orden operativo.</p></div><button type="button" onClick={() => setView("days")}>Ver planificación completa →</button></header><ol>{data.days.map((day) => { const items = data.scheduleItems.filter((item) => item.dayId === day.id); return <li key={day.id}><span>{day.position + 1}</span><div><strong>{day.name}</strong><small>{day.shootDate ? formatDate(day.shootDate) : "Sin fecha"} · {items.length} bloques</small></div><i>{day.callTime ?? "—"} → {day.wrapTime ? `${day.wrapTime}${day.wrapNextDay ? "+1" : ""}` : "—"}</i></li>; })}</ol></section>
    </>}
  </div>;
}

function DaysView({ data, activeDay, setActiveDayId, dayItems, overlaps, selectedItemId, setSelectedItemId, scheduledShots, mutate, busyKey, scheduleGroup }: {
  data: ProductionWorkspaceData; activeDay: ProductionDay | null; setActiveDayId: (id: string) => void; dayItems: ProductionScheduleItem[]; overlaps: string[];
  selectedItemId: string | null; setSelectedItemId: (id: string | null) => void; scheduledShots: Set<string>;
  mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null; scheduleGroup: (group: SourceGroup) => Promise<void>;
}) {
  const scheduledByShot = new Map(data.scheduleItems.flatMap((item) => item.sourceShotId ? [[item.sourceShotId, item] as const] : []));
  return <div className="production-view production-days-view">
    <section className="production-day-tabs" aria-label="Selector de jornada">{data.days.map((day) => <button type="button" key={day.id} className={day.id === activeDay?.id ? "is-active" : ""} onClick={() => setActiveDayId(day.id)}><strong>Día {day.position + 1}</strong><span>{day.shootDate ? formatShortDate(day.shootDate) : "Sin fecha"}</span></button>)}<details className="production-add-day"><summary>＋ Jornada</summary><DayCreateForm productionId={data.production.id} nextNumber={data.days.length + 1} mutate={mutate} busyKey={busyKey} /></details></section>
    {!activeDay ? <section className="production-no-day"><span>□</span><h2>Crea una jornada</h2><p>Una jornada puede tener fecha y horarios, o empezar como una secuencia ordenada sin horario.</p><DayCreateForm productionId={data.production.id} nextNumber={1} mutate={mutate} busyKey={busyKey} /></section> : <>
      <section className="production-plan-panel">
        <header><div><p className="production-eyebrow">PLAN DE RODAJE</p><h2>{activeDay.name}</h2><span>{activeDay.shootDate ? `${formatDate(activeDay.shootDate)} · ${data.production.timezone}` : `Sin fecha · ${data.production.timezone}`}</span></div><details><summary>Editar jornada</summary><DayEditForm productionId={data.production.id} day={activeDay} itemCount={dayItems.length} coverageCount={data.coverages.filter((coverage) => coverage.dayId === activeDay.id).length} mutate={mutate} busyKey={busyKey} /></details></header>
        <div className="production-plan-toolbar"><details><summary>＋ Bloque manual</summary><ScheduleBlockForm productionId={data.production.id} dayId={activeDay.id} kind="manual" mutate={mutate} busyKey={busyKey} /></details><details><summary>＋ Logística</summary><ScheduleBlockForm productionId={data.production.id} dayId={activeDay.id} kind="logistics" mutate={mutate} busyKey={busyKey} /></details><span>{dayItems.length} bloques · {dayItems.filter((item) => item.shootMinutes).reduce((total, item) => total + (item.shootMinutes ?? 0), 0)} min estimados</span></div>
        {overlaps.length > 0 && <div className="production-overlap-warning">Revisar solapamientos: {overlaps.join(", ")}. No se reajustaron horarios automáticamente.</div>}
        <ProductionTimeline data={data} day={activeDay} items={dayItems} selectedItemId={selectedItemId} onSelect={setSelectedItemId} />
      </section>
      <section className="production-source-catalog">
        <header><div><h2>Escenas y planos</h2><p>Disponibles y sin programar. La duración en pantalla no se usa como tiempo de rodaje.</p></div><span>{scheduledShots.size}/{data.source.groups.reduce((total, group) => total + group.shots.length, 0) || data.source.scenes.length} programados</span></header>
        {data.scheduleItems.some((item) => !item.dayId) && <div className="production-unscheduled"><h3>Sin programar</h3>{data.scheduleItems.filter((item) => !item.dayId).map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.itemType === "shot" ? "Plano" : item.itemType === "scene" ? "Escena" : "Bloque manual"}</small></div><button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(`move-${item.id}`, moveScheduleItemAction({ productionId: data.production.id, itemId: item.id, dayId: activeDay.id, expectedRevision: item.revision }))}>Asignar a {activeDay.name}</button></article>)}</div>}
        {data.source.groups.length ? <div className="production-groups">{data.source.groups.map((group) => {
          const unscheduled = group.shots.filter((shot) => !scheduledShots.has(shot.id));
          return <details key={group.id}><summary><span><strong>{group.title}</strong><small>{group.shots.length} planos · {group.sourceStatus === "missing" ? "Fuente no disponible" : "Vinculada"}</small></span>{group.shots.length > 0 && <button type="button" disabled={!unscheduled.length || Boolean(busyKey)} onClick={(event) => { event.preventDefault(); void scheduleGroup(group); }}>{unscheduled.length ? `Programar ${unscheduled.length} aquí` : "Programada"}</button>}</summary><ul>{group.shots.length ? group.shots.map((shot) => { const item = scheduledByShot.get(shot.id); const itemDay = data.days.find((day) => day.id === item?.dayId); return <li key={shot.id}><span className="production-shot-number">{shot.position + 1}</span><div><strong>{shot.title}</strong><small>Duración en pantalla: {shot.durationSeconds == null ? "Por definir" : `${shot.durationSeconds} s`} · Rodaje: {item?.shootMinutes ? `${item.shootMinutes} min` : "Por estimar"}</small></div>{!item ? <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(`shot-${shot.id}`, scheduleSourceAction({ productionId: data.production.id, dayId: activeDay.id, sourceKind: "shot", sourceId: shot.id }))}>＋ Añadir</button> : item.dayId === activeDay.id ? <button type="button" onClick={() => setSelectedItemId(item.id)}>En {activeDay.name}</button> : <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(`move-${item.id}`, moveScheduleItemAction({ productionId: data.production.id, itemId: item.id, dayId: activeDay.id, expectedRevision: item.revision }))}>Mover desde {itemDay?.name ?? "sin jornada"}</button>}</li>; }) : <li><div><strong>Bloque de escena</strong><small>Esta escena no tiene planos actuales.</small></div><button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(`scene-${group.id}`, scheduleSourceAction({ productionId: data.production.id, dayId: activeDay.id, sourceKind: "scene", sourceId: group.id }))}>＋ Añadir escena</button></li>}</ul></details>;
        })}</div> : data.source.scenes.length ? <ul className="production-scene-list">{data.source.scenes.map((scene) => { const existing = data.scheduleItems.find((item) => item.itemType === "scene" && item.sourceSceneId === scene.id); return <li key={scene.id}><span>{scene.position + 1}</span><strong>{scene.title}</strong>{existing ? <button type="button" onClick={() => setSelectedItemId(existing.id)}>Programada</button> : <button type="button" disabled={Boolean(busyKey)} onClick={() => mutate(`scene-${scene.id}`, scheduleSourceAction({ productionId: data.production.id, dayId: activeDay.id, sourceKind: "scene", sourceId: scene.id }))}>＋ Añadir</button>}</li>; })}</ul> : <div className="production-catalog-empty"><strong>Sin fuentes vinculadas</strong><span>Crea bloques manuales o vincula fuentes desde la configuración lateral.</span></div>}
      </section>
    </>}
  </div>;
}

function ProductionTimeline({ data, day, items, selectedItemId, onSelect }: { data: ProductionWorkspaceData; day: ProductionDay; items: ProductionScheduleItem[]; selectedItemId: string | null; onSelect: (id: string) => void }) {
  const timed = items.filter((item) => item.startTime);
  const blocks = timelineVisualBlocks(items, data);
  if (!day.shootDate || !timed.length) return <div className="production-sequence"><header><span>ORDEN</span><span>Sin horario</span><span>TIEMPO DE RODAJE</span></header>{blocks.length ? blocks.map((block, index) => <button type="button" key={block.id} className={block.items.some((item) => item.id === selectedItemId) ? "is-selected" : ""} onClick={() => onSelect(block.id)}><i>{index + 1}</i><span><strong>{block.title}</strong><small>{block.detail}</small></span><em>{block.minutes ? `${block.minutes} min` : "Por estimar"}</em></button>) : <div className="production-sequence-empty"><span>□</span><strong>Sin bloques programados</strong><small>Añade una escena, un plano o un bloque manual.</small></div>}</div>;
  const scale = timelineScale(day, timed);
  return <><div className="production-timeline"><div className="production-timeline-axis">{scale.ticks.map((tick) => <span key={tick.value} style={{ left: `${tick.left}%` }}>{tick.label}</span>)}</div><div className="production-timeline-track">{blocks.filter((block) => block.startTime).map((block) => { const last = block.items.at(-1)!; const box = timelineBox({ ...block.items[0], startTime: block.startTime, endTime: last.endTime, endNextDay: last.endNextDay }, scale.start, scale.end); return <button type="button" key={block.id} title={`${block.title}\n${block.detail}`} className={`${block.items.some((item) => item.id === selectedItemId) ? "is-selected" : ""} is-${block.itemType}`} style={{ left: `${box.left}%`, width: `${box.width}%` }} onClick={() => onSelect(block.id)}><strong>{block.title}</strong><small>{block.itemType === "logistics" ? `${block.startTime}–${last.endTime ?? "?"}` : block.detail}</small></button>; })}</div></div><div className="production-mobile-program">{blocks.map((block) => <button type="button" key={block.id} onClick={() => onSelect(block.id)}><time>{block.startTime ?? "—"}</time><span><strong>{block.title}</strong><small>{block.detail}</small></span></button>)}</div></>;
}

function timelineVisualBlocks(items: ProductionScheduleItem[], data: ProductionWorkspaceData) {
  const groups: Array<{ id: string; sceneKey: string | null; items: ProductionScheduleItem[] }> = [];
  for (const item of items) {
    const sceneKey = item.itemType === "scene" || item.itemType === "shot" ? item.sourceSceneId ?? item.sourceGroupId : null;
    const previous = groups.at(-1);
    if (sceneKey && previous?.sceneKey === sceneKey) previous.items.push(item);
    else groups.push({ id: item.id, sceneKey, items: [item] });
  }
  return groups.map((group) => {
    const first = group.items[0];
    const minutes = group.items.reduce((total, item) => total + (item.shootMinutes ?? 0), 0);
    const scene = first.sourceSceneId ? data.source.scenes.find((item) => item.id === first.sourceSceneId) : null;
    const sourceGroup = first.sourceGroupId ? data.source.groups.find((item) => item.id === first.sourceGroupId) : null;
    const shotNumbers = group.items.flatMap((item) => sourceGroup?.shots.find((shot) => shot.id === item.sourceShotId)?.position == null ? [] : [sourceGroup.shots.find((shot) => shot.id === item.sourceShotId)!.position + 1]);
    const range = shotNumbers.length ? `${Math.min(...shotNumbers)}${shotNumbers.length > 1 ? `–${Math.max(...shotNumbers)}` : ""}` : `${group.items.length}`;
    const title = group.sceneKey ? `ESC. ${scene ? String(scene.position + 1).padStart(2, "0") : "—"} · ${scene?.title ?? sourceGroup?.title ?? first.sourceLabel ?? first.title}` : first.itemType === "logistics" ? first.title.toUpperCase() : first.title;
    const detail = group.sceneKey ? `Planos ${range} · ${minutes ? `${minutes} min` : "tiempo por estimar"}` : `${first.startTime ?? "—"}–${first.endTime ?? "?"}${minutes ? ` · ${minutes} min` : ""}`;
    return { ...group, itemType: first.itemType, title, detail, minutes, startTime: group.items.find((item) => item.startTime)?.startTime ?? null };
  });
}

function RequirementsView({ data, activeDay, selectedRequirement, setSelectedRequirementId, selectedCoverage, mutate, busyKey }: {
  data: ProductionWorkspaceData; activeDay: ProductionDay | null; selectedRequirement: ProductionRequirement | null; setSelectedRequirementId: (id: string) => void;
  selectedCoverage: ProductionWorkspaceData["coverages"][number] | null; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null;
}) {
  const newCandidates = data.source.eligibleRequirements.filter((item) => !item.alreadyImported);
  return <div className="production-view production-split-view">
    <section className="production-list-panel"><header><div><h2>Necesidades</h2><p>La confirmación del desglose no confirma un recurso para rodaje.</p></div><details><summary>＋ Manual</summary><RequirementCreateForm productionId={data.production.id} mutate={mutate} busyKey={busyKey} /></details></header>
      {data.production.scriptId && <div className="production-import-bar"><span><strong>{newCandidates.length ? `${newCandidates.length} nuevas` : "Sin nuevas necesidades"}</strong><small>Sólo confirmadas, vigentes y presentes/utilizadas.</small></span><button type="button" disabled={!newCandidates.length || Boolean(busyKey)} onClick={() => mutate("import-requirements", importRequirementsAction({ productionId: data.production.id }))}>Importar necesidades</button></div>}
      {data.requirements.length ? <ul>{data.requirements.map((requirement) => { const coverage = activeDay ? data.coverages.find((item) => item.dayId === activeDay.id && item.requirementId === requirement.id) : null; return <li key={requirement.id} className={selectedRequirement?.id === requirement.id ? "is-selected" : ""}><button type="button" onClick={() => setSelectedRequirementId(requirement.id)}><i className={`is-${coverage?.status ?? "unassigned"}`} /><span><strong>{requirement.name}</strong><small>{requirementLabels[requirement.category]} · {requirement.origin === "breakdown" ? "Breakdown" : "Manual"}</small></span><em>{activeDay ? coverageLabel(coverage?.status, coverage?.needsReconfirmation) : "Elige jornada"}</em></button></li>; })}</ul> : <div className="production-panel-empty"><strong>Sin necesidades registradas</strong><span>Importa un Breakdown confirmado o añade una necesidad manual.</span></div>}
    </section>
    <section className="production-detail-panel">{selectedRequirement ? <><header><p className="production-eyebrow">{requirementLabels[selectedRequirement.category]}</p><h2>{selectedRequirement.name}</h2><span>{selectedRequirement.sourceSceneIds.length ? `${selectedRequirement.sourceSceneIds.length} escenas vinculadas` : "Sin vínculo de escena"}</span>{selectedRequirement.origin === "manual" && <details className="production-inline-edit"><summary>Editar necesidad</summary><RequirementEditForm productionId={data.production.id} requirement={selectedRequirement} mutate={mutate} busyKey={busyKey} /></details>}</header>{activeDay ? <CoverageForm data={data} day={activeDay} requirement={selectedRequirement} coverage={selectedCoverage} mutate={mutate} busyKey={busyKey} /> : <div className="production-panel-empty"><strong>Selecciona o crea una jornada</strong><span>La cobertura se confirma siempre con contexto de jornada.</span></div>}</> : <div className="production-panel-empty"><strong>Selecciona una necesidad</strong><span>Revisa su recurso y estado para la jornada activa.</span></div>}</section>
  </div>;
}

function ResourcesView({ data, mutate, busyKey }: { data: ProductionWorkspaceData; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <div className="production-view"><section className="production-resource-head"><div><h2>Recursos manuales</h2><p>Registrar un recurso no lo confirma para todas las jornadas.</p></div><details><summary>＋ Nuevo recurso</summary><ResourceCreateForm productionId={data.production.id} mutate={mutate} busyKey={busyKey} /></details></section>{data.resources.length ? <div className="production-resource-grid">{data.resources.map((resource) => { const uses = data.coverages.filter((coverage) => coverage.resourceId === resource.id); return <article key={resource.id}><span>{resourceLabels[resource.resourceType]}</span><h3>{resource.name}</h3><p>{resource.contact || resource.address || resource.notes || "Sin datos adicionales"}</p><footer><small>{uses.length} asignaciones por jornada</small><i>{uses.filter((item) => item.status === "confirmed" && !item.needsReconfirmation).length} confirmadas</i></footer><details className="production-card-edit"><summary>Editar recurso</summary><ResourceEditForm productionId={data.production.id} resource={resource} mutate={mutate} busyKey={busyKey} /></details></article>; })}</div> : <div className="production-large-empty"><span>◎</span><h2>Sin recursos</h2><p>Añade personas, locaciones, utilería, vehículos, equipo o servicios disponibles para esta producción.</p></div>}</div>;
}

function TasksView({ data, activeDay, mutate, busyKey }: { data: ProductionWorkspaceData; activeDay: ProductionDay | null; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "done">("all");
  const tasks = filter === "all" ? data.tasks : data.tasks.filter((task) => task.status === filter);
  return <div className="production-view"><section className="production-task-head"><div><h2>Tareas de producción</h2><p>Responsables manuales, prioridad y vínculos simples. Sin invitaciones ni notificaciones.</p></div><details><summary>＋ Nueva tarea</summary><TaskCreateForm data={data} activeDay={activeDay} mutate={mutate} busyKey={busyKey} /></details></section><nav className="production-filters" aria-label="Filtrar tareas">{(["all", "pending", "in_progress", "done"] as const).map((value) => <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "Todas" : taskStatusLabel(value)} <span>{value === "all" ? data.tasks.length : data.tasks.filter((task) => task.status === value).length}</span></button>)}</nav>{tasks.length ? <div className="production-task-list"><header><span>Tarea</span><span>Responsable</span><span>Fecha</span><span>Prioridad</span><span>Estado</span><span /></header>{tasks.map((task) => <article key={task.id}><div><strong>{task.title}</strong><small>{task.department || "Sin departamento"}{task.dayId ? ` · ${data.days.find((day) => day.id === task.dayId)?.name ?? "Jornada"}` : ""}</small></div><span>{task.assigneeText || data.resources.find((resource) => resource.id === task.assigneeResourceId)?.name || "Sin asignar"}</span><time>{task.dueDate ? formatShortDate(task.dueDate) : "—"}</time><em className={`is-${task.priority}`}>{priorityLabel(task.priority)}</em><select aria-label={`Estado de ${task.title}`} value={task.status} disabled={Boolean(busyKey)} onChange={(event) => mutate(`task-${task.id}`, updateTaskStatusAction({ productionId: data.production.id, taskId: task.id, expectedRevision: task.revision, status: event.target.value as typeof task.status }))}><option value="pending">Pendiente</option><option value="in_progress">En progreso</option><option value="done">Listo</option></select><details className="production-row-menu"><summary aria-label={`Acciones de ${task.title}`}>•••</summary><TaskEditForm productionId={data.production.id} task={task} mutate={mutate} busyKey={busyKey} /><button type="button" onClick={() => window.confirm("¿Eliminar esta tarea?") && mutate(`delete-task-${task.id}`, deleteTaskAction({ productionId: data.production.id, taskId: task.id, expectedRevision: task.revision }))}>Eliminar tarea</button></details></article>)}</div> : <div className="production-large-empty"><span>✓</span><h2>Sin tareas en esta vista</h2><p>Crea tareas reales; no se generan tareas ficticias al importar fuentes.</p></div>}</div>;
}

function DayCreateForm({ productionId, nextNumber, mutate, busyKey }: { productionId: string; nextNumber: number; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void mutate("create-day", createDayAction({ productionId, name: String(values.get("name")), shootDate: String(values.get("date")), callTime: String(values.get("call")), wrapTime: String(values.get("wrap")), wrapNextDay: values.get("nextDay") === "on", notes: String(values.get("notes")) }), () => form.reset()); }}><label>Nombre<input name="name" defaultValue={`Día ${nextNumber}`} required maxLength={120} /></label><div><label>Fecha<input type="date" name="date" /></label><label>Call<input type="time" name="call" /></label></div><div><label>Wrap<input type="time" name="wrap" /></label><label className="production-check"><input type="checkbox" name="nextDay" /> Día siguiente</label></div><label>Notas<textarea name="notes" maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Crear jornada</button></form>;
}

function DayEditForm({ productionId, day, itemCount, coverageCount, mutate, busyKey }: { productionId: string; day: ProductionDay; itemCount: number; coverageCount: number; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutate(`day-${day.id}`, updateDayAction({ productionId, dayId: day.id, expectedRevision: day.revision, name: String(values.get("name")), shootDate: String(values.get("date")), callTime: String(values.get("call")), wrapTime: String(values.get("wrap")), wrapNextDay: values.get("nextDay") === "on", notes: String(values.get("notes")) })); }}><label>Nombre<input name="name" defaultValue={day.name} required maxLength={120} /></label><div><label>Fecha<input type="date" name="date" defaultValue={day.shootDate ?? ""} /></label><label>Call<input type="time" name="call" defaultValue={day.callTime ?? ""} /></label></div><div><label>Wrap<input type="time" name="wrap" defaultValue={day.wrapTime ?? ""} /></label><label className="production-check"><input type="checkbox" name="nextDay" defaultChecked={day.wrapNextDay} /> Día siguiente</label></div><label>Notas<textarea name="notes" defaultValue={day.notes ?? ""} maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Guardar jornada</button><button type="button" className="production-danger" disabled={Boolean(busyKey)} onClick={() => window.confirm(`Se retirarán ${itemCount} bloques a “Sin programar” y se eliminarán ${coverageCount} coberturas específicas de ${day.name}. Las fuentes no se borrarán. ¿Continuar?`) && mutate(`delete-day-${day.id}`, deleteDayAction({ productionId, dayId: day.id, expectedRevision: day.revision }))}>Eliminar jornada</button></form>;
}

function ScheduleBlockForm({ productionId, dayId, kind, mutate, busyKey }: { productionId: string; dayId: string; kind: "manual" | "logistics"; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void mutate(`block-${kind}`, createScheduleBlockAction({ productionId, dayId, itemType: kind, logisticsType: kind === "logistics" ? String(values.get("logistics")) as LogisticsType : null, title: String(values.get("title")), notes: String(values.get("notes")), shootMinutes: values.get("minutes") ? Number(values.get("minutes")) : null, startTime: String(values.get("start")), endTime: String(values.get("end")), endNextDay: values.get("nextDay") === "on" }), () => form.reset()); }}>
    {kind === "logistics" && <label>Tipo<select name="logistics"><option value="call">Call</option><option value="meal">Comida</option><option value="transfer">Traslado</option><option value="break">Pausa</option><option value="other">Otro</option></select></label>}<label>Nombre<input name="title" required maxLength={200} placeholder={kind === "manual" ? "Escena o bloque manual" : "Comida, traslado…"} /></label><div><label>Inicio<input type="time" name="start" /></label><label>Fin<input type="time" name="end" /></label></div><div><label>Rodaje (min)<input type="number" name="minutes" min={1} max={1440} /></label><label className="production-check"><input type="checkbox" name="nextDay" /> Fin +1 día</label></div><label>Notas<textarea name="notes" maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Añadir bloque</button>
  </form>;
}

function RequirementCreateForm({ productionId, mutate, busyKey }: { productionId: string; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void mutate("create-requirement", createRequirementAction({ productionId, name: String(values.get("name")), category: String(values.get("category")) as RequirementCategory, notes: String(values.get("notes")) }), () => form.reset()); }}><label>Nombre<input name="name" required maxLength={160} placeholder="Casete, Mara, Casa Principal…" /></label><label>Categoría<select name="category">{Object.entries(requirementLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Notas<textarea name="notes" maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Crear necesidad</button></form>;
}

function RequirementEditForm({ productionId, requirement, mutate, busyKey }: { productionId: string; requirement: ProductionRequirement; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutate(`requirement-${requirement.id}`, updateRequirementAction({ productionId, requirementId: requirement.id, expectedRevision: requirement.revision, name: String(values.get("name")), category: String(values.get("category")) as RequirementCategory, notes: String(values.get("notes")) })); }}><label>Nombre<input name="name" defaultValue={requirement.name} required maxLength={160} /></label><label>Categoría<select name="category" defaultValue={requirement.category}>{Object.entries(requirementLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Notas<textarea name="notes" defaultValue={requirement.notes ?? ""} maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Guardar necesidad</button></form>;
}

function ResourceCreateForm({ productionId, mutate, busyKey }: { productionId: string; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form is-wide" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void mutate("create-resource", createResourceAction({ productionId, name: String(values.get("name")), resourceType: String(values.get("type")) as ResourceType, contact: String(values.get("contact")), address: String(values.get("address")), availabilityNotes: String(values.get("availability")), notes: String(values.get("notes")) }), () => form.reset()); }}><label>Nombre<input name="name" required maxLength={160} /></label><label>Tipo<select name="type">{Object.entries(resourceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Contacto opcional<input name="contact" maxLength={500} /></label><label>Dirección (locaciones)<input name="address" maxLength={1000} /></label><label>Disponibilidad declarada<textarea name="availability" maxLength={2000} /></label><label>Notas<textarea name="notes" maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Guardar recurso</button></form>;
}

function ResourceEditForm({ productionId, resource, mutate, busyKey }: { productionId: string; resource: ProductionWorkspaceData["resources"][number]; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form is-wide" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutate(`resource-${resource.id}`, updateResourceAction({ productionId, resourceId: resource.id, expectedRevision: resource.revision, name: String(values.get("name")), resourceType: String(values.get("type")) as ResourceType, contact: String(values.get("contact")), address: String(values.get("address")), availabilityNotes: String(values.get("availability")), notes: String(values.get("notes")) })); }}><label>Nombre<input name="name" defaultValue={resource.name} required maxLength={160} /></label><label>Tipo<select name="type" defaultValue={resource.resourceType}>{Object.entries(resourceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Contacto<input name="contact" defaultValue={resource.contact ?? ""} maxLength={500} /></label><label>Dirección<input name="address" defaultValue={resource.address ?? ""} maxLength={1000} /></label><label>Disponibilidad declarada<textarea name="availability" defaultValue={resource.availabilityNotes ?? ""} maxLength={2000} /></label><label>Notas<textarea name="notes" defaultValue={resource.notes ?? ""} maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Guardar recurso</button></form>;
}

function CoverageForm({ data, day, requirement, coverage, mutate, busyKey }: { data: ProductionWorkspaceData; day: ProductionDay; requirement: ProductionRequirement; coverage: ProductionWorkspaceData["coverages"][number] | null; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-coverage-form" key={`${day.id}-${requirement.id}-${coverage?.revision ?? 0}`} onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutate(`coverage-${requirement.id}`, upsertCoverageAction({ productionId: data.production.id, requirementId: requirement.id, dayId: day.id, resourceId: String(values.get("resource")) || null, status: String(values.get("status")) as CoverageStatus, requiredTime: String(values.get("required")), arrivalTime: String(values.get("arrival")), notes: String(values.get("notes")), expectedRevision: coverage?.revision ?? null })); }}>
    <div className="production-coverage-day"><span>Jornada</span><strong>{day.name}</strong><small>{day.shootDate ? formatDate(day.shootDate) : "Fecha por definir"}</small></div>
    {!day.shootDate && <p className="production-form-note">Puedes proponer un recurso, pero la confirmación requiere una fecha de jornada.</p>}
    {coverage?.needsReconfirmation && <p className="production-form-warning">La fecha cambió. Esta cobertura necesita reconfirmación.</p>}
    <label>Recurso<select name="resource" defaultValue={coverage?.resourceId ?? ""}><option value="">Sin asignar</option>{data.resources.map((resource) => <option value={resource.id} key={resource.id}>{resource.name} · {resourceLabels[resource.resourceType]}</option>)}</select></label>
    <label>Estado<select name="status" defaultValue={coverage?.status ?? "unassigned"}><option value="unassigned">Sin asignar</option><option value="tentative">Tentativo</option><option value="confirmed" disabled={!day.shootDate}>Confirmado</option><option value="unavailable">No disponible</option></select></label>
    <div><label>Se requiere a las<input type="time" name="required" defaultValue={coverage?.requiredTime ?? ""} /></label><label>Llegada declarada<input type="time" name="arrival" defaultValue={coverage?.arrivalTime ?? ""} /></label></div>
    <p className="production-field-help">La hora de llegada no es la hora del plano ni una disponibilidad inferida.</p><label>Notas<textarea name="notes" defaultValue={coverage?.notes ?? ""} maxLength={2000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Guardar cobertura</button>
  </form>;
}

function TaskCreateForm({ data, activeDay, mutate, busyKey }: { data: ProductionWorkspaceData; activeDay: ProductionDay | null; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form is-wide" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const dayId = String(values.get("day")); void mutate("create-task", createTaskAction({ productionId: data.production.id, title: String(values.get("title")), status: "pending", priority: String(values.get("priority")) as "low" | "medium" | "high", assigneeText: String(values.get("assignee")), dueDate: String(values.get("date")), department: String(values.get("department")), notes: String(values.get("notes")), linkType: dayId ? "day" : null, linkId: dayId || null }), () => form.reset()); }}><label>Título<input name="title" required maxLength={240} /></label><div><label>Prioridad<select name="priority"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label><label>Fecha<input type="date" name="date" /></label></div><label>Responsable manual<input name="assignee" maxLength={160} placeholder="Nombre o rol" /></label><label>Departamento<input name="department" maxLength={120} /></label><label>Jornada opcional<select name="day" defaultValue={activeDay?.id ?? ""}><option value="">Sin vínculo</option>{data.days.map((day) => <option value={day.id} key={day.id}>{day.name}</option>)}</select></label><label>Nota<textarea name="notes" maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Crear tarea</button></form>;
}

function TaskEditForm({ productionId, task, mutate, busyKey }: { productionId: string; task: ProductionWorkspaceData["tasks"][number]; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <form className="production-popover-form is-wide" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutate(`edit-task-${task.id}`, updateTaskAction({ productionId, taskId: task.id, expectedRevision: task.revision, title: String(values.get("title")), priority: String(values.get("priority")) as "low" | "medium" | "high", assigneeText: String(values.get("assignee")), dueDate: String(values.get("date")), department: String(values.get("department")), notes: String(values.get("notes")) })); }}><label>Título<input name="title" defaultValue={task.title} required maxLength={240} /></label><div><label>Prioridad<select name="priority" defaultValue={task.priority}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label><label>Fecha<input type="date" name="date" defaultValue={task.dueDate ?? ""} /></label></div><label>Responsable<input name="assignee" defaultValue={task.assigneeText ?? ""} maxLength={160} /></label><label>Departamento<input name="department" defaultValue={task.department ?? ""} maxLength={120} /></label><label>Nota<textarea name="notes" defaultValue={task.notes ?? ""} maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Guardar tarea</button></form>;
}

function ItemInspector({ productionId, item, mutate, busyKey }: { productionId: string; item: ProductionScheduleItem; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <section className="production-item-inspector"><header><h3>Detalle del bloque</h3><span>{item.itemType === "shot" ? "Plano" : item.itemType === "scene" ? "Escena" : item.itemType === "logistics" ? "Logística" : "Manual"}</span></header><form key={item.revision} onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutate(`item-${item.id}`, updateScheduleItemAction({ productionId, itemId: item.id, expectedRevision: item.revision, title: String(values.get("title")), notes: String(values.get("notes")), shootMinutes: values.get("minutes") ? Number(values.get("minutes")) : null, startTime: String(values.get("start")), endTime: String(values.get("end")), endNextDay: values.get("nextDay") === "on" })); }}><label>Título<input name="title" defaultValue={item.title} maxLength={200} required /></label>{item.sourceLabel && <p className="production-source-reference">Fuente: {item.sourceLabel}</p>}<label>Tiempo de rodaje<input name="minutes" type="number" min={1} max={1440} defaultValue={item.shootMinutes ?? ""} placeholder="Por estimar" /><small>No es la duración en pantalla.</small></label><div><label>Inicio<input name="start" type="time" defaultValue={item.startTime ?? ""} /></label><label>Fin<input name="end" type="time" defaultValue={item.endTime ?? ""} /></label></div><label className="production-check"><input name="nextDay" type="checkbox" defaultChecked={item.endNextDay} /> Termina al día siguiente</label><label>Notas<textarea name="notes" defaultValue={item.notes ?? ""} maxLength={4000} /></label><button className="production-primary" disabled={Boolean(busyKey)}>Guardar bloque</button><div className="production-order-controls" aria-label="Cambiar orden del bloque"><button type="button" className="production-secondary" disabled={Boolean(busyKey)} onClick={() => mutate(`order-up-${item.id}`, reorderScheduleItemAction({ productionId, itemId: item.id, expectedRevision: item.revision, direction: -1 }))}>↑ Subir</button><button type="button" className="production-secondary" disabled={Boolean(busyKey)} onClick={() => mutate(`order-down-${item.id}`, reorderScheduleItemAction({ productionId, itemId: item.id, expectedRevision: item.revision, direction: 1 }))}>↓ Bajar</button></div><button type="button" className="production-secondary" disabled={Boolean(busyKey)} onClick={() => mutate(`unschedule-${item.id}`, moveScheduleItemAction({ productionId, itemId: item.id, dayId: null, expectedRevision: item.revision }))}>Mover a “Sin programar”</button><button type="button" className="production-danger" disabled={Boolean(busyKey)} onClick={() => window.confirm("¿Retirar este bloque? La escena o plano fuente no se borrará.") && mutate(`delete-item-${item.id}`, deleteScheduleItemAction({ productionId, itemId: item.id, expectedRevision: item.revision }))}>Retirar bloque</button></form></section>;
}

function SettingsPanel({ data, mutate, busyKey }: { data: ProductionWorkspaceData; mutate: <T>(key: string, operation: Promise<ActionResult<T>>, after?: () => void) => Promise<boolean>; busyKey: string | null }) {
  return <section><details className="production-settings"><summary>Configuración y fuentes</summary><form onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutate("settings", updateProductionSettingsAction({ productionId: data.production.id, expectedRevision: data.production.revision, name: String(values.get("name")), timezone: String(values.get("timezone")) })); }}><label>Nombre<input name="name" defaultValue={data.production.name} maxLength={160} /></label><label>Zona horaria<input name="timezone" defaultValue={data.production.timezone} maxLength={80} /></label><button className="production-secondary" disabled={Boolean(busyKey)}>Guardar</button></form>{!data.production.scriptId && !data.production.shotlistId && <form onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutate("link-source", linkProductionSourcesAction({ productionId: data.production.id, expectedRevision: data.production.revision, scriptId: String(values.get("script")) || null, shotlistId: String(values.get("shotlist")) || null })); }}><label>Guion<select name="script"><option value="">Sin guion</option>{data.sourceOptions.scripts.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Shotlist<select name="shotlist"><option value="">Sin Shotlist</option>{data.sourceOptions.shotlists.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><button className="production-secondary" disabled={Boolean(busyKey)}>Vincular fuentes</button></form>}</details></section>;
}

function sourceWarningList(data: ProductionWorkspaceData) {
  const warnings: string[] = [];
  if (data.source.script && !data.source.script.available) warnings.push("Guion fuente no disponible");
  if (data.source.shotlist && !data.source.shotlist.available) warnings.push("Shotlist fuente no disponible");
  if (data.source.script?.available && data.production.sourceScriptRevision && data.source.script.revision > data.production.sourceScriptRevision) warnings.push("El guion cambió desde la vinculación");
  if (data.source.shotlist?.available && data.production.sourceShotlistRevision && data.source.shotlist.revision > data.production.sourceShotlistRevision) warnings.push("La Shotlist tiene cambios nuevos");
  return warnings;
}
function sourceDescription(data: ProductionWorkspaceData) { return data.source.shotlist?.available ? data.source.shotlist.title : data.source.script?.available ? data.source.script.title : data.production.scriptId || data.production.shotlistId ? "Fuente no disponible" : "Planificación manual"; }
function viewTitle(view: WorkspaceView) { return ({ overview: "Production Assistant", calendar: "Calendario", days: "Plan de rodaje", locations: "Locaciones", contacts: "Contactos", documents: "Documentos", tasks: "Tareas", requirements: "Necesidades", resources: "Recursos" } as const)[view]; }
function viewSubtitle(view: WorkspaceView) { return ({ overview: "Planifica. Organiza. Rueda.", calendar: "Consulta tus fechas de rodaje y abre cada jornada.", days: "Ordena escenas, planos y logística en una línea de tiempo.", locations: "Direcciones e indicaciones listas para el equipo.", contacts: "Tu agenda de personas vinculadas a esta producción.", documents: "Prepara hojas de producción con datos vigentes.", tasks: "Trabajo pendiente de la producción.", requirements: "Qué se necesita, con qué recurso y para qué jornada.", resources: "Elementos reales disponibles para el plan." } as const)[view]; }
function coverageLabel(status?: CoverageStatus, reconfirm = false) { if (reconfirm) return "Reconfirmar"; return ({ unassigned: "Sin asignar", tentative: "Tentativo", confirmed: "Confirmado", unavailable: "No disponible" } as const)[status ?? "unassigned"]; }
function taskStatusLabel(status: "pending" | "in_progress" | "done") { return status === "pending" ? "Pendientes" : status === "in_progress" ? "En progreso" : "Listas"; }
function priorityLabel(priority: "low" | "medium" | "high") { return priority === "low" ? "Baja" : priority === "medium" ? "Media" : "Alta"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function formatShortDate(value: string) { return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function timeMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function timelineScale(day: ProductionDay, items: ProductionScheduleItem[]) {
  const rawStarts = items.flatMap((item) => item.startTime ? [timeMinutes(item.startTime)] : []);
  const call = day.callTime ? timeMinutes(day.callTime) : Math.min(...rawStarts);
  const crosses = day.wrapNextDay || items.some((item) => item.endNextDay);
  const normalized = (minute: number) => crosses && minute < call ? minute + 1440 : minute;
  const start = Math.floor(Math.min(call, ...rawStarts.map(normalized)) / 60) * 60;
  const ends = items.map((item) => item.endTime ? normalized(timeMinutes(item.endTime)) + (item.endNextDay && !crosses ? 1440 : 0) : normalized(timeMinutes(item.startTime!)) + (item.shootMinutes ?? 60));
  const wrap = day.wrapTime ? normalized(timeMinutes(day.wrapTime)) : Math.max(...ends);
  const end = Math.max(start + 120, Math.ceil(Math.max(wrap, ...ends) / 60) * 60);
  const ticks: Array<{ value: number; label: string; left: number }> = [];
  for (let value = start; value <= end; value += 60) ticks.push({ value, label: `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:00`, left: (value - start) / (end - start) * 100 });
  return { start, end, ticks };
}
function timelineBox(item: ProductionScheduleItem, start: number, end: number) {
  let itemStart = timeMinutes(item.startTime!); if (itemStart < start) itemStart += 1440;
  let itemEnd = item.endTime ? timeMinutes(item.endTime) : itemStart + (item.shootMinutes ?? 60);
  if (item.endNextDay || itemEnd <= itemStart) itemEnd += 1440;
  return { left: Math.max(0, (itemStart - start) / (end - start) * 100), width: Math.max(3, Math.min(100, (itemEnd - itemStart) / (end - start) * 100)) };
}
function detectOverlaps(items: ProductionScheduleItem[], day: ProductionDay) {
  const timed = items.filter((item) => item.startTime && (item.endTime || item.shootMinutes));
  const base = day.callTime ? timeMinutes(day.callTime) : timed[0]?.startTime ? timeMinutes(timed[0].startTime) : 0;
  const spans = timed.map((item) => { let start = timeMinutes(item.startTime!); if (start < base) start += 1440; let end = item.endTime ? timeMinutes(item.endTime) : start + (item.shootMinutes ?? 0); if (item.endNextDay || end <= start) end += 1440; return { item, start, end }; }).sort((a, b) => a.start - b.start);
  return spans.flatMap((span, index) => index > 0 && span.start < spans[index - 1].end ? [`${spans[index - 1].item.title} / ${span.item.title}`] : []);
}
