"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DialogFrame } from "./ShotlistDialogs";
import { SHOTLIST_COLUMNS, suggestedImportColumn, type ShotlistColumnKey } from "@/lib/shotlist/ux";

type ScriptOption = { id: string; title: string; revision: number; updatedAt: string };
type SceneOption = { sceneId: string; heading: string; context: string };
type SheetPreview = { name: string; headers: string[]; rows: string[][]; rowCount: number; warnings: string[]; formulaCells: number; formulasWithoutValue: number };
type Target = ShotlistColumnKey | "skip" | "unreviewed";

const importTargets = SHOTLIST_COLUMNS.filter((column) => column.key !== "storyboard") as Array<typeof SHOTLIST_COLUMNS[number] & { key: ShotlistColumnKey }>;

export default function ShotlistImportDialog({ open, shotlistId, linkedScriptId, onClose, onImported }: { open: boolean; shotlistId: string; linkedScriptId: string | null; onClose: () => void; onImported: () => Promise<void> | void }) {
  const [source, setSource] = useState<"writer" | "file">("writer");
  const [scripts, setScripts] = useState<ScriptOption[]>([]);
  const [scriptId, setScriptId] = useState(linkedScriptId ?? "");
  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetPreview[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [mapping, setMapping] = useState<Target[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    void fetch(`/api/shotlists/${shotlistId}/import`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos cargar tus guiones.");
      setScripts(data.scripts ?? []);
    }).catch((cause) => setError(cause.message));
  }, [open, shotlistId]);

  useEffect(() => {
    if (!open || !scriptId) return;
    void fetch(`/api/shotlists/${shotlistId}/import?scriptId=${encodeURIComponent(scriptId)}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos revisar el guion.");
      const next = (data.scenes ?? []) as SceneOption[];
      setScenes(next); setSelectedScenes(new Set(next.map((scene) => scene.sceneId)));
    }).catch((cause) => setError(cause.message));
  }, [open, scriptId, shotlistId]);

  const activeSheet = useMemo(() => sheets.find((sheet) => sheet.name === sheetName) ?? null, [sheetName, sheets]);
  const duplicateTargets = useMemo(() => {
    const assigned = mapping.filter((target) => target !== "skip" && target !== "unreviewed");
    return new Set(assigned).size !== assigned.length;
  }, [mapping]);

  function close() {
    if (busy) return;
    onClose();
  }

  async function inspect(nextFile: File | null) {
    operationId.current = crypto.randomUUID();
    setFile(nextFile); setSheets([]); setSheetName(""); setMapping([]); setError(null);
    if (!nextFile) return;
    setBusy(true);
    try {
      const form = new FormData(); form.set("mode", "inspect"); form.set("file", nextFile);
      const response = await fetch(`/api/shotlists/${shotlistId}/import`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos leer el archivo.");
      const nextSheets = (data.sheets ?? []) as SheetPreview[];
      setSheets(nextSheets);
      selectSheet(nextSheets[0]?.name ?? "", nextSheets);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos leer el archivo."); }
    finally { setBusy(false); }
  }

  function selectSheet(name: string, sourceSheets = sheets) {
    setSheetName(name);
    const sheet = sourceSheets.find((candidate) => candidate.name === name);
    setMapping((sheet?.headers ?? []).map((header) => {
      const suggestion = suggestedImportColumn(header);
      return suggestion === "skip" ? "unreviewed" : suggestion;
    }));
  }

  async function applyWriter() {
    if (!scriptId || !selectedScenes.size || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/shotlists/${shotlistId}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "writer", scriptId, sceneIds: [...selectedScenes], operationId: operationId.current }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos importar desde Writer.");
      await onImported(); operationId.current = crypto.randomUUID(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos importar desde Writer."); }
    finally { setBusy(false); }
  }

  async function applyFile() {
    if (!file || !activeSheet || mapping.some((target) => target === "unreviewed") || duplicateTargets || busy) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("mode", "apply"); form.set("file", file); form.set("sheet", activeSheet.name);
      form.set("mapping", JSON.stringify(mapping)); form.set("operationId", operationId.current);
      const response = await fetch(`/api/shotlists/${shotlistId}/import`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No pudimos aplicar la importación.");
      await onImported(); operationId.current = crypto.randomUUID(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos aplicar la importación."); }
    finally { setBusy(false); }
  }

  const canApply = source === "writer" ? Boolean(scriptId && selectedScenes.size) : Boolean(file && activeSheet && !mapping.some((target) => target === "unreviewed") && !duplicateTargets);
  return <DialogFrame open={open} title="Importar a Shotlist" eyebrow="SIN SALIR DE SHOTLIST" onClose={close} footer={<><button type="button" className="is-secondary" onClick={close}>Cancelar</button><button type="button" disabled={!canApply || busy} onClick={() => void (source === "writer" ? applyWriter() : applyFile())}>{busy ? "Procesando…" : "Incorporar"}</button></>}>
    <div className="shotlist-import-tabs" role="tablist" aria-label="Origen de importación"><button type="button" role="tab" aria-selected={source === "writer"} onClick={() => setSource("writer")}>Desde Writer</button><button type="button" role="tab" aria-selected={source === "file"} onClick={() => setSource("file")}>Desde archivo</button></div>
    {source === "writer" ? <section className="shotlist-import-writer">
      <label>Guion propio<select value={scriptId} onChange={(event) => { if (event.target.value === scriptId) return; operationId.current = crypto.randomUUID(); setScriptId(event.target.value); setScenes([]); setSelectedScenes(new Set()); setError(null); }}><option value="">Selecciona un guion</option>{scripts.map((script) => <option key={script.id} value={script.id}>{script.title}</option>)}</select></label>
      {linkedScriptId && scriptId && linkedScriptId !== scriptId && <p className="shotlist-import-warning">Esta Shotlist ya tiene otra fuente. El vínculo no se sustituirá.</p>}
      {scenes.length > 0 && <div className="shotlist-import-scenes"><header><strong>Revisar escenas</strong><span>{selectedScenes.size} de {scenes.length}</span></header>{scenes.map((scene) => <label key={scene.sceneId}><input type="checkbox" checked={selectedScenes.has(scene.sceneId)} onChange={(event) => setSelectedScenes((current) => { const next = new Set(current); if (event.target.checked) next.add(scene.sceneId); else next.delete(scene.sceneId); return next; })} /><span><strong>{scene.heading}</strong><small>{scene.context || "Sin acción visible para previsualizar."}</small></span></label>)}</div>}
      <p className="shotlist-dialog-note">Se usan escenas y texto ya guardados. No se crea otro guion, no se inventan planos y no se ejecuta IA.</p>
    </section> : <section className="shotlist-import-file">
      <label className="shotlist-file-picker">Archivo .xls o .csv<input type="file" accept=".xls,.csv,text/csv,application/vnd.ms-excel" onChange={(event) => void inspect(event.target.files?.[0] ?? null)} /></label>
      <p className="shotlist-dialog-note">Máximo 8 MB, 5,000 filas, 80 columnas y 120,000 celdas. XLSX no se anuncia en esta Beta. No se evalúan fórmulas, macros, scripts, HTML ni vínculos externos.</p>
      {sheets.length > 1 && <label>Hoja<select value={sheetName} onChange={(event) => selectSheet(event.target.value)}>{sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}</select></label>}
      {activeSheet && <><div className="shotlist-import-summary"><strong>{activeSheet.rowCount} filas</strong><span>{activeSheet.headers.length} columnas</span></div>{activeSheet.warnings.map((warning) => <p key={warning} className="shotlist-import-warning">{warning}</p>)}<div className="shotlist-import-mapping"><h3>Mapeo de columnas</h3>{activeSheet.headers.map((header, index) => <label key={`${header}:${index}`}><span>{header || `Columna ${index + 1}`}</span><select value={mapping[index] ?? "unreviewed"} onChange={(event) => setMapping((current) => current.map((target, targetIndex) => targetIndex === index ? event.target.value as Target : target))}><option value="unreviewed" disabled>Revisar…</option><option value="skip">Omitir conscientemente</option>{importTargets.map((target) => <option key={target.key} value={target.key}>{target.label}</option>)}</select></label>)}</div>{duplicateTargets && <p className="shotlist-import-warning">Cada campo de Shotlist sólo puede recibir una columna. Corrige el mapeo duplicado antes de incorporar.</p>}<div className="shotlist-import-preview"><table><thead><tr>{activeSheet.headers.map((header, index) => <th key={`${header}:${index}`}>{header || `Col. ${index + 1}`}</th>)}</tr></thead><tbody>{activeSheet.rows.slice(0, 8).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div></>}
    </section>}
    {error && <p className="shotlist-form-error" role="alert">{error}</p>}
  </DialogFrame>;
}
