"use client";

import { useRef, useState } from "react";
import { SHOTLIST_COLUMNS, type ShotlistFilter } from "@/lib/shotlist/ux";
import { useWriterPopoverDismissal } from "@/components/writer/useWriterPopoverDismissal";

const filterable = SHOTLIST_COLUMNS.filter((column) => column.filterable) as Array<typeof SHOTLIST_COLUMNS[number] & { key: ShotlistFilter["column"] }>;

export default function ShotlistFilters({ filters, filteredCount, totalCount, onAdd, onRemove, onClear }: { filters: ShotlistFilter[]; filteredCount: number; totalCount: number; onAdd: (filter: ShotlistFilter) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [column, setColumn] = useState<ShotlistFilter["column"]>("lens");
  const [condition, setCondition] = useState<ShotlistFilter["condition"]>("equals");
  const [value, setValue] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useWriterPopoverDismissal({ open, rootRef: root, triggerRef: trigger, onDismiss: () => setOpen(false) });
  const canAdd = condition === "empty" || value.trim().length > 0;

  function add() {
    if (!canAdd) return;
    onAdd({ id: crypto.randomUUID(), column, condition, value: condition === "empty" ? "" : value.trim() });
    setValue("");
  }

  return <div className="shotlist-filter-area" ref={root}>
    <button ref={trigger} type="button" className="shotlist-filter-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>⌁ Filtros{filters.length ? ` (${filters.length})` : ""}</button>
    <span className="shotlist-filter-count">{filteredCount} de {totalCount}</span>
    {open && <div className="shotlist-filter-popover" role="dialog" aria-label="Añadir filtro">
      <label>Columna<select value={column} onChange={(event) => setColumn(event.target.value as ShotlistFilter["column"])}>{filterable.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>Condición<select value={condition} onChange={(event) => setCondition(event.target.value as ShotlistFilter["condition"])}><option value="equals">es</option><option value="contains">contiene</option><option value="empty">está vacío</option></select></label>
      {condition !== "empty" && <label>Valor<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder={column === "lens" ? "50 mm" : "Valor"} /></label>}
      <button type="button" disabled={!canAdd} onClick={add}>Añadir filtro</button>
    </div>}
    {filters.length > 0 && <div className="shotlist-filter-chips" aria-label="Filtros activos">{filters.map((filter) => <button key={filter.id} type="button" onClick={() => onRemove(filter.id)} title="Quitar filtro"><span>{columnLabel(filter.column)} {conditionLabel(filter.condition)}{filter.value ? ` ${filter.value}` : ""}</span> ×</button>)}<button type="button" className="is-clear" onClick={onClear}>Limpiar filtros</button></div>}
  </div>;
}

function columnLabel(key: ShotlistFilter["column"]) {
  return SHOTLIST_COLUMNS.find((column) => column.key === key)?.label ?? key;
}

function conditionLabel(condition: ShotlistFilter["condition"]) {
  return condition === "equals" ? "es" : condition === "contains" ? "contiene" : "está vacío";
}
