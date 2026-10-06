"use client";

import { useState } from "react";
import { DialogFrame } from "./ShotlistDialogs";
import { SHOTLIST_COLUMNS, type ShotlistColumnKey } from "@/lib/shotlist/ux";

export default function ShotlistExportDialog({ open, initialFormat, visibleColumns, totalCount, filteredCount, busy, onClose, onExport }: { open: boolean; initialFormat: "csv" | "pdf"; visibleColumns: ReadonlySet<ShotlistColumnKey>; totalCount: number; filteredCount: number; busy: boolean; onClose: () => void; onExport: (options: { format: "csv" | "pdf"; scope: "all" | "filtered"; columns: ShotlistColumnKey[]; paper: "A4" | "A3" }) => void }) {
  const [format, setFormat] = useState<"csv" | "pdf">(initialFormat);
  const [scope, setScope] = useState<"all" | "filtered">("all");
  const [paper, setPaper] = useState<"A4" | "A3">("A3");
  const [columns, setColumns] = useState<Set<ShotlistColumnKey>>(() => new Set([...visibleColumns].filter((column) => column !== "storyboard")));
  const count = scope === "all" ? totalCount : filteredCount;
  return <DialogFrame open={open} title="Exportar Shotlist" eyebrow="DATOS COMPLETOS" onClose={onClose} footer={<><button type="button" className="is-secondary" onClick={onClose}>Cancelar</button><button type="button" disabled={busy || !columns.size} onClick={() => onExport({ format, scope, columns: [...columns], paper })}>{busy ? "Preparando…" : `Exportar ${format.toUpperCase()}`}</button></>}>
    <div className="shotlist-export-options">
      <fieldset><legend>Formato</legend><label><input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} /> CSV</label><label><input type="radio" checked={format === "pdf"} onChange={() => setFormat("pdf")} /> PDF tabular horizontal</label></fieldset>
      <fieldset><legend>Alcance</legend><label><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Toda la shotlist ({totalCount} planos)</label><label><input type="radio" checked={scope === "filtered"} onChange={() => setScope("filtered")} /> Resultado filtrado ({filteredCount} planos)</label></fieldset>
      {format === "pdf" && <fieldset><legend>Papel</legend><label><input type="radio" checked={paper === "A4"} onChange={() => setPaper("A4")} /> A4 horizontal</label><label><input type="radio" checked={paper === "A3"} onChange={() => setPaper("A3")} /> A3 horizontal · recomendado para tabla completa</label></fieldset>}
      <fieldset className="shotlist-export-columns"><legend>Columnas ({columns.size})</legend>{SHOTLIST_COLUMNS.filter((column) => column.key !== "storyboard").map((column) => <label key={column.key}><input type="checkbox" checked={columns.has(column.key)} onChange={(event) => setColumns((current) => { const next = new Set(current); if (event.target.checked) next.add(column.key); else next.delete(column.key); return next; })} /> {column.label}</label>)}</fieldset>
      <p className="shotlist-dialog-note">Se exportarán {count} planos desde los datos guardados, no desde una captura del grid. Descripción y Observaciones conservarán sus saltos de línea.</p>
    </div>
  </DialogFrame>;
}
