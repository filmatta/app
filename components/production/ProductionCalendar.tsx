"use client";

import { useMemo, useState } from "react";
import type { ProductionDay, ProductionScheduleItem, ProductionWorkspaceData } from "@/lib/production/types";

type ProductionCalendarProps = {
  data: ProductionWorkspaceData;
  activeDayId: string | null;
  onSelectDay: (id: string) => void;
  onOpenDay: () => void;
};

const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const monthFormatter = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormatter = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function dateKey(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return null;
  const key = value.slice(0, 10);
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? null : key;
}

function monthFromKey(key: string): string {
  return key.slice(0, 7);
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function monthCells(month: string): Array<{ key: string; day: number; inMonth: boolean }> {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, index - startOffset + 1));
    const key = date.toISOString().slice(0, 10);
    return { key, day: date.getUTCDate(), inMonth: monthFromKey(key) === month };
  });
}

function itemSummary(items: ProductionScheduleItem[]) {
  const sceneIds = new Set(items.flatMap((item) => item.sourceSceneId ? [item.sourceSceneId] : item.itemType === "scene" ? [item.id] : []));
  return { blocks: items.length, scenes: sceneIds.size };
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function daySort(a: ProductionDay, b: ProductionDay): number {
  return (dateKey(a.shootDate) ?? "9999-12-31").localeCompare(dateKey(b.shootDate) ?? "9999-12-31") || a.position - b.position;
}

export default function ProductionCalendar({ data, activeDayId, onSelectDay, onOpenDay }: ProductionCalendarProps) {
  const datedDays = useMemo(() => data.days.filter((day) => dateKey(day.shootDate)).sort(daySort), [data.days]);
  const activeDay = data.days.find((day) => day.id === activeDayId) ?? null;
  const firstMonth = monthFromKey(dateKey(activeDay?.shootDate ?? null) ?? dateKey(datedDays[0]?.shootDate ?? null) ?? new Date().toISOString().slice(0, 10));
  const [visibleMonth, setVisibleMonth] = useState(firstMonth);

  const itemsByDay = useMemo(() => {
    const result = new Map<string, ProductionScheduleItem[]>();
    for (const item of data.scheduleItems) {
      if (!item.dayId) continue;
      const items = result.get(item.dayId) ?? [];
      items.push(item);
      result.set(item.dayId, items);
    }
    return result;
  }, [data.scheduleItems]);
  const daysByDate = useMemo(() => {
    const result = new Map<string, ProductionDay[]>();
    for (const day of datedDays) {
      const key = dateKey(day.shootDate);
      if (!key) continue;
      const days = result.get(key) ?? [];
      days.push(day);
      result.set(key, days);
    }
    return result;
  }, [datedDays]);

  const monthDays = datedDays.filter((day) => monthFromKey(dateKey(day.shootDate) ?? "") === visibleMonth);
  const undatedDays = data.days.filter((day) => !dateKey(day.shootDate)).sort((a, b) => a.position - b.position);
  const monthDate = new Date(`${visibleMonth}-01T00:00:00.000Z`);
  const monthLabel = monthFormatter.format(monthDate);
  const cells = monthCells(visibleMonth);

  function chooseDate(key: string) {
    const days = daysByDate.get(key);
    if (!days?.length) return;
    onSelectDay(days.some((day) => day.id === activeDayId) ? activeDayId! : days[0].id);
  }

  function renderDayRow(day: ProductionDay) {
    const summary = itemSummary(itemsByDay.get(day.id) ?? []);
    const selected = day.id === activeDayId;
    return (
      <li key={day.id}>
        <button type="button" className={`production-calendar-day-row${selected ? " is-selected" : ""}`} aria-pressed={selected} onClick={() => onSelectDay(day.id)}>
          <span className="production-calendar-day-number">{day.shootDate ? new Date(`${dateKey(day.shootDate)}T00:00:00.000Z`).getUTCDate().toString().padStart(2, "0") : "—"}</span>
          <span className="production-calendar-day-name"><strong>{day.name}</strong><small>{day.shootDate ? dateFormatter.format(new Date(`${dateKey(day.shootDate)}T00:00:00.000Z`)) : "Fecha por definir"}</small></span>
          <span className="production-calendar-day-meta"><strong>{day.callTime ? `Call ${day.callTime}` : "Call pendiente"}</strong><small>{countLabel(summary.blocks, "bloque", "bloques")} · {countLabel(summary.scenes, "escena", "escenas")}</small></span>
          <span className="production-calendar-day-arrow" aria-hidden="true">→</span>
        </button>
      </li>
    );
  }

  return (
    <section className="production-calendar-view production-view" aria-label="Calendario de producción">
      <div className="production-calendar-shell">
        <header className="production-calendar-toolbar">
          <div>
            <p className="production-eyebrow">SCHEDULE / CALENDAR</p>
            <h2>Calendario de rodaje</h2>
            <span>{countLabel(data.days.length, "jornada", "jornadas")} · {countLabel(datedDays.length, "con fecha", "con fecha")}</span>
          </div>
          <div className="production-calendar-controls" aria-label="Navegación del calendario">
            <button type="button" aria-label="Mes anterior" onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}>‹</button>
            <strong aria-live="polite">{monthLabel}</strong>
            <button type="button" aria-label="Mes siguiente" onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}>›</button>
          </div>
        </header>

        <div className="production-calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="production-calendar-grid" role="group" aria-label={`Jornadas de ${monthLabel}`}>
          {cells.map((cell) => {
            const days = cell.inMonth ? daysByDate.get(cell.key) ?? [] : [];
            const scheduled = days.flatMap((day) => itemsByDay.get(day.id) ?? []);
            const summary = itemSummary(scheduled);
            const selected = days.some((day) => day.id === activeDayId);
            const fullDate = dateFormatter.format(new Date(`${cell.key}T00:00:00.000Z`));
            return <div key={cell.key} className={`production-calendar-cell${cell.inMonth ? "" : " is-outside"}${days.length ? " has-shoot" : ""}${selected ? " is-selected" : ""}`}>
              {days.length ? <button type="button" aria-pressed={selected} aria-label={`${fullDate}: ${countLabel(days.length, "jornada", "jornadas")}, ${countLabel(summary.blocks, "bloque", "bloques")}, ${countLabel(summary.scenes, "escena", "escenas")}`} onClick={() => chooseDate(cell.key)}>
                <span className="production-calendar-date">{cell.day}</span>
                <strong>{days.length === 1 ? `Día ${days[0].position + 1}` : countLabel(days.length, "jornada", "jornadas")}</strong>
                <small><span>{countLabel(summary.blocks, "bloque", "bloques")}</span><span>{countLabel(summary.scenes, "escena", "escenas")}</span></small>
              </button> : <span className="production-calendar-date">{cell.day}</span>}
            </div>;
          })}
        </div>
      </div>

      <div className="production-calendar-agenda">
        <header>
          <div><p className="production-eyebrow">JORNADAS</p><h3>{monthLabel}</h3></div>
          <span>{monthDays.length}</span>
        </header>
        {monthDays.length ? <ol>{monthDays.map(renderDayRow)}</ol> : <div className="production-calendar-empty-month">No hay jornadas con fecha en este mes.</div>}
        {undatedDays.length > 0 && <div className="production-calendar-undated"><h4>Sin fecha <span>{undatedDays.length}</span></h4><ol>{undatedDays.map(renderDayRow)}</ol></div>}
        {data.days.length === 0 && <div className="production-calendar-empty-plan"><strong>Aún no hay jornadas</strong><p>Crea la primera jornada para organizar el calendario de rodaje.</p></div>}
        <footer>
          <span>{activeDay ? `Seleccionada: ${activeDay.name}` : "Selecciona una jornada"}</span>
          <button type="button" onClick={onOpenDay}>{activeDay ? "Abrir timeline" : "Crear jornada"} <span aria-hidden="true">→</span></button>
        </footer>
      </div>
    </section>
  );
}
