"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SHOTLIST_COLUMNS, SHOTLIST_VALUE_COLUMNS, shotlistValueCatalog, type ShotlistFilter, type ShotlistRowContext } from "@/lib/shotlist/ux";
import { useWriterPopoverDismissal } from "@/components/writer/useWriterPopoverDismissal";

const filterable = SHOTLIST_COLUMNS.filter((item) => item.filterable) as Array<typeof SHOTLIST_COLUMNS[number] & { key: ShotlistFilter["column"] }>;

export default function ShotlistFilters({ rows, filters, filteredCount, totalCount, onApply, onRemove, onClear }: {
  rows: ShotlistRowContext[];
  filters: ShotlistFilter[];
  filteredCount: number;
  totalCount: number;
  onApply: (column: ShotlistFilter["column"], filter: ShotlistFilter | null) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState<ShotlistFilter["column"]>("location");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [condition, setCondition] = useState<"equals" | "contains" | "empty">("contains");
  const [value, setValue] = useState("");
  const [position, setPosition] = useState<CSSProperties>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const parent = useRef<HTMLInputElement>(null);
  const catalog = useMemo(() => shotlistValueCatalog(rows, column), [rows, column]);
  const enumerable = SHOTLIST_VALUE_COLUMNS.includes(column);
  const visible = catalog.filter((item) => `${item.label} ${item.detail}`.toLocaleLowerCase("es-MX").includes(query.trim().toLocaleLowerCase("es-MX")));
  const selectedVisible = visible.filter((item) => draft.has(item.key)).length;
  const allSelected = catalog.length > 0 && catalog.every((item) => draft.has(item.key));
  useEffect(() => { if (parent.current) parent.current.indeterminate = selectedVisible > 0 && selectedVisible < visible.length; }, [selectedVisible, visible.length]);
  useWriterPopoverDismissal({ open, rootRef: root, triggerRef: trigger, onDismiss: () => setOpen(false) });
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 16);
      const height = Math.min(480, window.innerHeight - 16);
      const below = window.innerHeight - rect.bottom;
      setPosition({ width, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top: below >= Math.min(height, 330) ? rect.bottom + 5 : Math.max(8, rect.top - height - 5), maxHeight: height });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open]);

  function begin(nextColumn: ShotlistFilter["column"]) {
    const current = filters.find((item) => item.column === nextColumn);
    const options = shotlistValueCatalog(rows, nextColumn);
    setColumn(nextColumn); setQuery("");
    setDraft(current?.condition === "none" ? new Set() : current?.condition === "in" ? new Set(current.values ?? []) : new Set(options.map((item) => item.key)));
    setCondition(current?.condition === "equals" || current?.condition === "empty" ? current.condition : "contains");
    setValue(current && (current.condition === "equals" || current.condition === "contains") ? current.value : "");
  }

  function apply() {
    if (enumerable) {
      const chosen = [...draft];
      const next: ShotlistFilter | null = allSelected ? null : { id: crypto.randomUUID(), column, condition: chosen.length ? "in" : "none", value: "", values: chosen };
      onApply(column, next);
    } else if (condition === "empty" || value.trim()) {
      onApply(column, { id: crypto.randomUUID(), column, condition, value: condition === "empty" ? "" : value.trim() });
    } else return;
    setOpen(false);
  }

  function toggleVisible() {
    setDraft((current) => {
      const next = new Set(current);
      const shouldSelect = visible.some((item) => !next.has(item.key));
      for (const item of visible) if (shouldSelect) next.add(item.key); else next.delete(item.key);
      return next;
    });
  }

  return <div className="shotlist-filter-area" ref={root}>
    <button ref={trigger} type="button" className="shotlist-filter-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) begin(column); setOpen(!open); }}>⌁ Filtros{filters.length ? ` (${filters.length})` : ""}</button>
    <span className="shotlist-filter-count">{filteredCount} de {totalCount}</span>
    {open && position && createPortal(<div className="shotlist-filter-popover is-portal" style={position} role="dialog" aria-label="Filtrar planos" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <label className="shotlist-filter-column">Columna<select value={column} onChange={(event) => begin(event.target.value as ShotlistFilter["column"])}>{filterable.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      {enumerable ? <>
        <input className="shotlist-filter-search" autoFocus aria-label="Buscar valor" placeholder="Buscar valor…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label className="shotlist-filter-all"><input ref={parent} type="checkbox" checked={visible.length > 0 && selectedVisible === visible.length} onChange={toggleVisible} />{query.trim() ? "Seleccionar resultados" : "Seleccionar todos"}<small>{selectedVisible}/{visible.length}</small></label>
        <div className="shotlist-filter-values" role="group" aria-label={`Valores de ${columnLabel(column)}`}>{visible.map((item) => <label key={item.key}><input type="checkbox" checked={draft.has(item.key)} onChange={(event) => setDraft((current) => { const next = new Set(current); if (event.target.checked) next.add(item.key); else next.delete(item.key); return next; })} /><span>{item.label}{item.detail && <small>{item.detail}</small>}</span><small>{item.count}</small></label>)}{!visible.length && <p>Sin valores coincidentes.</p>}</div>
        <p className="shotlist-filter-hint">{draft.size === 0 ? "Ningún valor seleccionado: cero resultados." : allSelected ? "Todos: sin restricción para esta columna." : `${draft.size} valor(es) seleccionado(s).`}</p>
      </> : <div className="shotlist-filter-text"><label>Condición<select value={condition} onChange={(event) => setCondition(event.target.value as typeof condition)}><option value="equals">es</option><option value="contains">contiene</option><option value="empty">está vacío</option></select></label>{condition !== "empty" && <label>Valor<input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); apply(); } }} /></label>}</div>}
      <div className="shotlist-filter-actions"><button type="button" className="is-remove" onClick={() => { onApply(column, null); setOpen(false); }}>Quitar filtro</button><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button type="button" className="is-apply" disabled={!enumerable && condition !== "empty" && !value.trim()} onClick={apply}>Aplicar</button></div>
    </div>, document.body)}
    {filters.length > 0 && <div className="shotlist-filter-chips" aria-label="Filtros activos">{filters.map((filter) => <button key={filter.id} type="button" onClick={() => onRemove(filter.id)} title={`Quitar filtro ${columnLabel(filter.column)}`}><span>{columnLabel(filter.column)} · {filter.condition === "none" ? "ninguno" : filter.condition === "in" ? filter.values?.length === 1 ? shotlistValueCatalog(rows, filter.column).find((item) => item.key === filter.values?.[0])?.label ?? "1 valor" : `${filter.values?.length ?? 0} valores` : filter.condition === "empty" ? "sin especificar" : filter.value}</span> ×</button>)}<button type="button" className="is-clear" onClick={onClear}>Limpiar filtros</button></div>}
  </div>;
}

function columnLabel(key: ShotlistFilter["column"]) { return SHOTLIST_COLUMNS.find((item) => item.key === key)?.label ?? key; }
