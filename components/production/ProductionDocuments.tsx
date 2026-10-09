"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { documentHasChanges, exportedDocumentVersion, nextDocumentVersion, productionDocumentKey } from "@/lib/production/document-version";
import type { ProductionWorkspaceData } from "@/lib/production/types";
import type { ProductionPdfKind, ProductionPdfSelection } from "@/lib/production/pdf-document";

type Category = "pack" | "call-sheet" | "calendar" | "script" | "shotlist" | "storyboard";
type Props = { data: ProductionWorkspaceData; activeDayId?: string | null; viewerName?: string; variant?: "production" | "project" };
type DocumentRow = { key: string; kind: ProductionPdfKind; title: string; subtitle: string; dayId?: string; available: boolean };
const categories: Array<{ id: Category; label: string }> = [
  { id: "pack", label: "Production Pack" }, { id: "call-sheet", label: "Call Sheets" },
  { id: "calendar", label: "Calendario" }, { id: "script", label: "Guión" },
  { id: "shotlist", label: "Shotlist" }, { id: "storyboard", label: "Storyboard" },
];

export default function ProductionDocuments({ data, activeDayId, viewerName, variant = "production" }: Props) {
  const router = useRouter();
  const projectMode = variant === "project";
  const [category, setCategory] = useState<Category>("pack");
  const [packOpen, setPackOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => {
    const visible = projectMode ? categories.flatMap((item) => documentRows(data, item.id)) : documentRows(data, category);
    if (!projectMode) return visible;
    const missing = !data.source.script?.available ? "Falta guion" : !data.source.shotlist?.available ? "Falta Shotlist" : null;
    return visible.map((row) => row.kind === "pack" && missing ? { ...row, available: false, subtitle: missing } : row);
  }, [data, category, projectMode]);
  const packLast = data.documentExports.find((item) => item.documentKey === "pack");
  const [version, setVersion] = useState(nextDocumentVersion(packLast));
  const [preparedBy, setPreparedBy] = useState(viewerName || "");
  const [selectedDays, setSelectedDays] = useState<string[]>(activeDayId ? [activeDayId] : data.days[0] ? [data.days[0].id] : []);
  const [includeCalendar, setIncludeCalendar] = useState(true);
  const [includeShotlist, setIncludeShotlist] = useState(projectMode
    ? Boolean(data.source.shotlist?.available)
    : !data.days.length && !data.source.script?.available && Boolean(data.source.shotlist?.available));
  const [includeStoryboard, setIncludeStoryboard] = useState(false);
  const [includeScript, setIncludeScript] = useState(!data.days.length || projectMode ? Boolean(data.source.script?.available) : false);
  const [logo, setLogo] = useState<File | null>(null);
  const [showLogo, setShowLogo] = useState(false);
  const [showProductionName, setShowProductionName] = useState(true);
  const [showFilmattaFooter, setShowFilmattaFooter] = useState(true);
  const [confidential, setConfidential] = useState(true);
  const [watermark, setWatermark] = useState(true);
  const [watermarkText, setWatermarkText] = useState(`${data.production.name.toUpperCase()} · PRODUCTION COPY`);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function openPack() { setError(null); setVersion(nextDocumentVersion(packLast)); setPackOpen(true); }

  function selectionFor(row: DocumentRow): ProductionPdfSelection {
    return { callSheetDayIds: row.dayId ? [row.dayId] : [], calendar: row.kind === "calendar", shotlist: row.kind === "shotlist", storyboard: row.kind === "storyboard", script: row.kind === "script" };
  }

  async function run(row: DocumentRow, mode: "preview" | "export", packSettings = false) {
    if (busy) return;
    setBusy(`${row.key}-${mode}`); setError(null);
    const selection: ProductionPdfSelection = packSettings ? {
      callSheetDayIds: selectedDays, calendar: includeCalendar, shotlist: includeShotlist, storyboard: includeStoryboard, script: includeScript,
    } : selectionFor(row);
    const latest = data.documentExports.find((item) => item.documentKey === row.key);
    const form = new FormData();
    form.set("options", JSON.stringify({
      preview: mode === "preview", selection,
      version: packSettings ? version : nextDocumentVersion(latest),
      preparedBy: packSettings ? preparedBy : viewerName || "Producción",
      confidential: packSettings ? confidential : true,
      watermark: packSettings ? watermark : true,
      watermarkText: packSettings ? watermarkText : `${data.production.name.toUpperCase()} · PRODUCTION COPY`,
      showProductionName: packSettings ? showProductionName : true,
      showFilmattaFooter: packSettings ? showFilmattaFooter : true,
    }));
    if (packSettings && showLogo && logo) form.set("logo", logo);
    try {
      const response = await fetch(`/production/${data.production.id}/documents/${row.kind}`, { method: "POST", body: form, credentials: "same-origin" });
      if (!response.ok) throw new Error((await response.text()).slice(0, 240));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (mode === "preview") { setPreviewTitle(row.title); setPreviewUrl(url); }
      else {
        const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || `${row.key}.pdf`;
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        if (packSettings) setPackOpen(false);
        router.refresh();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos generar el documento."); }
    finally { setBusy(null); }
  }

  const packRow = documentRows(data, "pack")[0];
  const packHasSelection = selectedDays.length > 0 || includeCalendar && data.days.length > 0 || includeShotlist || includeStoryboard || includeScript;
  return <section className={`production-documents${projectMode ? " is-project" : ""}`} aria-label="Centro de documentos">
    <header className="production-documents-head">
      <div><p className="production-documents-eyebrow">PRODUCTION DELIVERY</p><h2>{projectMode ? data.production.name : "Document Center"}</h2><p>{projectMode ? "PDF generables desde esta producción." : "Documentos listos para revisar, versionar y entregar al equipo."}</p></div>
      {projectMode ? <details className="production-documents-generate"><summary className="production-documents-primary">＋ Generar documento</summary><div>
        {rows.filter((row) => row.available).map((row) => <button type="button" key={row.key} disabled={Boolean(busy)} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); if (row.kind === "pack") openPack(); else void run(row, "export"); }}>{row.title}</button>)}
        {!rows.some((row) => row.available) && <span>Aún no hay documentos generables.</span>}
      </div></details> : <button type="button" className="production-documents-primary" disabled={!packRow.available} onClick={openPack}>＋ Generar Production Pack</button>}
    </header>
    <div className="production-documents-layout">
      {!projectMode && <nav className="production-documents-categories" aria-label="Categorías de documentos">{categories.map((item) => <button type="button" key={item.id} className={category === item.id ? "is-active" : ""} onClick={() => setCategory(item.id)}>{item.label}<span>→</span></button>)}</nav>}
      <div className="production-documents-list">
        <div className="production-documents-list-head"><div><span>DOCUMENTOS</span><h3>{projectMode ? "Archivos disponibles" : categories.find((item) => item.id === category)?.label}</h3></div><small>{rows.length} {rows.length === 1 ? "archivo" : "archivos"}</small></div>
        {projectMode && <div className="production-documents-column-head" aria-hidden="true"><span>Nombre</span><span>Tipo</span><span>Origen</span><span>Actualizado</span><span>Estado</span><span /></div>}
        {rows.map((row) => {
          const last = data.documentExports.find((item) => item.documentKey === row.key);
          const changed = documentHasChanges(data, row.key, last);
          return <article key={row.key} className={`production-document-row${!row.available ? " is-unavailable" : ""}`}>
            <div className="production-document-icon" aria-hidden="true">▤</div>
            <div className="production-document-main"><strong>{row.title}</strong><span>{row.subtitle}</span><small>{exportedDocumentVersion(last)} · {last ? `Generado ${relativeTime(last.generatedAt)}` : "Aún no generado"}</small></div>
            {projectMode && <><span className="production-document-kind">PDF</span><span className="production-document-origin">Producción</span><time className="production-document-updated" dateTime={last?.generatedAt}>{last ? relativeTime(last.generatedAt) : "—"}</time></>}
            <div className="production-document-state"><i className={changed ? "is-changed" : last ? "is-current" : ""} />{!row.available ? "Fuente pendiente" : changed ? "Cambios desde última exportación" : last ? "Actual" : "Sin exportar"}</div>
            <div className="production-document-actions">{projectMode && row.kind === "pack"
              ? <>{last && <button type="button" disabled={!row.available || Boolean(busy)} onClick={() => void run(row, "preview", true)}>Abrir vista previa actual</button>}<button type="button" disabled={!row.available || Boolean(busy)} onClick={openPack}>Preparar Pack</button></>
              : <><button type="button" disabled={!row.available || Boolean(busy)} onClick={() => row.kind === "pack" ? openPack() : void run(row, "preview")}>Vista previa</button><button type="button" disabled={!row.available || Boolean(busy)} onClick={() => row.kind === "pack" ? openPack() : void run(row, "export")}>{projectMode ? "Descargar" : "Exportar"}</button></>}
            </div>
          </article>;
        })}
        {category === "call-sheet" && !rows.length && <div className="production-documents-empty">Crea una jornada para preparar su Call Sheet.</div>}
        <p className="production-documents-note">Cada exportación crea una versión nueva. La vista previa muestra el contenido actual y no cambia la versión registrada.</p>
      </div>
    </div>
    {error && !packOpen && <p className="production-documents-error" role="alert">{error}</p>}

    {packOpen && <div className="production-pack-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPackOpen(false); }}>
      <div className="production-pack-dialog" role="dialog" aria-modal="true" aria-labelledby="production-pack-title">
        <header><div><p className="production-documents-eyebrow">PRODUCTION DELIVERY</p><h2 id="production-pack-title">Generar Production Pack</h2><span>Elige los documentos y confirma los datos de entrega.</span></div><button type="button" className="production-pack-close" onClick={() => setPackOpen(false)} aria-label="Cerrar">×</button></header>
        <div className="production-pack-body">
          <section><h3>Producción</h3><div className="production-pack-fields"><label>Nombre<input value={data.production.name} readOnly /></label><label>Versión<input value={version} maxLength={8} onChange={(event) => setVersion(event.target.value)} /></label><label>Preparado por<input value={preparedBy} maxLength={120} onChange={(event) => setPreparedBy(event.target.value)} /></label><label>Fecha<input value={new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date())} readOnly /></label></div></section>
          <section><h3>Incluir</h3><div className="production-pack-checks">
            {data.days.map((day) => <Check key={day.id} label={`Call Sheet · Día ${String(day.position + 1).padStart(2, "0")} · ${day.name}`} checked={selectedDays.includes(day.id)} onChange={(checked) => setSelectedDays((current) => checked ? [...current, day.id] : current.filter((id) => id !== day.id))} />)}
            <Check label="Calendario de producción" checked={includeCalendar} disabled={!data.days.length} onChange={setIncludeCalendar} />
            <Check label="Shotlist" checked={includeShotlist} disabled={!data.source.shotlist?.available} onChange={setIncludeShotlist} />
            <Check label="Storyboard" checked={includeStoryboard} disabled={!data.storyboardFingerprint} onChange={setIncludeStoryboard} />
            <Check label="Guión" checked={includeScript} disabled={!data.source.script?.available} onChange={setIncludeScript} />
          </div></section>
          <section><h3>Branding</h3><div className="production-pack-checks"><Check label="Nombre de producción" checked={showProductionName} onChange={setShowProductionName} /><Check label="FILMATTA footer" checked={showFilmattaFooter} onChange={setShowFilmattaFooter} /><Check label="Logo de producción" checked={showLogo} onChange={setShowLogo} /></div>{showLogo && <label className="production-pack-logo">Archivo PNG, JPG o WebP · hasta 2 MB<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} /></label>}</section>
          <section><h3>Protección</h3><div className="production-pack-checks"><Check label="Confidencial" checked={confidential} onChange={setConfidential} /><Check label="Marca de agua" checked={watermark} onChange={setWatermark} /></div>{watermark && <label className="production-pack-watermark">Texto de marca de agua<input value={watermarkText} maxLength={120} onChange={(event) => setWatermarkText(event.target.value)} /></label>}</section>
        </div>
        {error && <p className="production-documents-error" role="alert">{error}</p>}
        <footer><span>{packHasSelection ? `${selectedDays.length} Call Sheets seleccionados` : "Selecciona al menos un documento"}</span><div><button type="button" onClick={() => setPackOpen(false)}>Cancelar</button><button type="button" disabled={!packHasSelection || Boolean(busy) || showLogo && !logo} onClick={() => void run(packRow, "preview", true)}>Vista previa</button><button type="button" className="is-primary" disabled={!packHasSelection || Boolean(busy) || showLogo && !logo || !/^v[1-9]\d{0,2}\.\d{1,3}$/.test(version)} onClick={() => void run(packRow, "export", true)}>{busy ? "Generando…" : "GENERAR PRODUCTION PACK"}</button></div></footer>
      </div>
    </div>}

    {previewUrl && <div className="production-preview-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewUrl(null); }}><div className="production-preview-dialog" role="dialog" aria-modal="true" aria-label={`Vista previa: ${previewTitle}`}><header><strong>{previewTitle}</strong><button type="button" onClick={() => setPreviewUrl(null)} aria-label="Cerrar vista previa">×</button></header><iframe src={previewUrl} title={`Vista previa: ${previewTitle}`} /></div></div>}
  </section>;
}

function Check({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className={disabled ? "is-disabled" : ""}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function documentRows(data: ProductionWorkspaceData, category: Category): DocumentRow[] {
  const name = data.production.name;
  if (category === "pack") {
    const available = data.days.length > 0 || Boolean(data.source.script?.available || data.source.shotlist?.available);
    return [{ key: "pack", kind: "pack", title: "Production Pack", subtitle: available ? `${name} · entrega consolidada` : "Crea una jornada o vincula un guion o Shotlist", available }];
  }
  if (category === "call-sheet") return data.days.map((day) => ({ key: productionDocumentKey("call-sheet", day.id), kind: "call-sheet", title: `CALL SHEET — DÍA ${String(day.position + 1).padStart(2, "0")}`, subtitle: `${day.name} · ${formatDay(day.shootDate)}`, dayId: day.id, available: true }));
  if (category === "calendar") return [{ key: "calendar", kind: "calendar", title: "CALENDARIO DE RODAJE", subtitle: `${data.days.length} jornadas · ${name}`, available: data.days.length > 0 }];
  if (category === "script") return [{ key: "script", kind: "script", title: "GUIÓN DE PRODUCCIÓN", subtitle: data.source.script?.available ? data.source.script.title : "Vincula un guión desde configuración", available: Boolean(data.source.script?.available) }];
  if (category === "shotlist") return [{ key: "shotlist", kind: "shotlist", title: "SHOTLIST", subtitle: data.source.shotlist?.available ? data.source.shotlist.title : "Vincula una Shotlist desde configuración", available: Boolean(data.source.shotlist?.available) }];
  return [{ key: "storyboard", kind: "storyboard", title: "STORYBOARD", subtitle: data.storyboardFingerprint ? "Paneles vinculados a esta producción" : "Crea paneles desde Storyboard", available: Boolean(data.storyboardFingerprint) }];
}

function formatDay(value: string | null) { return value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Sin fecha"; }
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 2) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 1440) return `hace ${Math.floor(minutes / 60)} h`;
  return `el ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value))}`;
}
