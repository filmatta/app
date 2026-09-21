"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { validateUploadDeclaration } from "@/lib/profiles/media";
import { DEFAULT_CROP } from "@/lib/profiles/image-input";
import IdentityImage from "@/components/profiles/IdentityImage";
import { saveIdentityImage } from "./portfolio-actions";
import type { EditorState } from "./PortfolioDialogs";
export default function IdentityImageEditor({ kind, id, fallbackUrl, done }: { kind: "portrait" | "cover"; id?: string | null; fallbackUrl?: string; done: (state: EditorState) => void }) {
  const [file, setFile] = useState<File | null>(null), [url, setUrl] = useState("");
  const [crop, setCrop] = useState({ ...DEFAULT_CROP });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function save(remove = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      let mediaId: string | null = null;
      if (!remove) {
        if (!file) throw Error("Selecciona una imagen.");
        const invalid = validateUploadDeclaration("image", file); if (invalid) throw Error(invalid);
        const response = await fetch("/api/portfolio/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          item: { category: "book", purpose: kind, title: kind === "portrait" ? "Retrato" : "Portada", role: "", year: "", description: "", source: "storage", media_type: "image", url: "", featured: false, image_crop: crop },
          file: { name: file.name, type: file.type, size: file.size },
        }) });
        const result = await response.json(); if (!response.ok) throw Error(result.error);
        const db = createClient();
        const upload = await db.storage.from("profile-media").upload(result.path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw Error("No se completó la subida. La imagen anterior se conserva.");
        const complete = await fetch(`/api/portfolio/media/${result.id}/complete`, { method: "POST" });
        if (!complete.ok) throw Error("No se pudo validar la imagen. Usa JPG, PNG o WebP estático, de 64 px como mínimo y hasta 20 MB / 40 megapíxeles.");
        mediaId = result.id;
      }
      const saved = await saveIdentityImage(kind, mediaId);
      if ("error" in saved) throw Error(saved.error);
      done(saved.data); setFile(null); setUrl("");
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar la imagen."); }
    finally { setBusy(false); }
  }
  return <fieldset className={`pe-identity-upload pe-identity-upload--${kind}`} disabled={busy}>
    <legend>{kind === "portrait" ? "Foto de perfil" : "Portada"}</legend>
    <p className="pe-hint">{kind === "portrait" ? "Recomendado: 800 × 800 px. Una imagen de 500 × 500 también funciona." : "Recomendado: 1920 × 780 px. Portada panorámica."} JPG, PNG o WebP · hasta 20 MB.</p>
    <div className="pe-image-preview">
      {file && url ? <div className="pe-crop-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Vista previa del encuadre" style={{ objectPosition: `${crop.x}% ${crop.y}%`, transform: `scale(${crop.zoom})`, transformOrigin: `${crop.x}% ${crop.y}%` }} />
      </div> : <IdentityImage id={id} fallbackUrl={fallbackUrl} alt={kind === "portrait" ? "Foto actual" : "Portada actual"} />}
    </div>
    {kind === "cover" && <p className="pe-hint">Vista panorámica; en móvil se conserva la misma proporción y el punto elegido.</p>}
    <label>Elegir imagen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); setUrl(f ? URL.createObjectURL(f) : ""); setCrop({ ...DEFAULT_CROP }); setError(f ? validateUploadDeclaration("image", f) ?? "" : ""); }} /></label>
    {file && <div className="pe-crop-controls">{(["x", "y", "zoom"] as const).map(key => <label key={key}>{key === "x" ? "Encuadre horizontal" : key === "y" ? "Encuadre vertical" : "Acercamiento"}<input type="range" min={key === "zoom" ? 1 : 0} max={key === "zoom" ? 3 : 100} step={key === "zoom" ? .05 : 1} value={crop[key]} onChange={e => setCrop(v => ({ ...v, [key]: Number(e.target.value) }))} /></label>)}</div>}
    {error && <p role="alert" className="pe-error">{error}</p>}
    <div className="pe-tools"><button type="button" disabled={!file || !!error || busy} onClick={() => void save()}>{busy ? "Validando imagen…" : "Guardar imagen"}</button>{(id || fallbackUrl) && <button type="button" disabled={busy} onClick={() => void save(true)}>Quitar imagen</button>}</div>
    <p className="pe-hint">Guardar imagen actualiza sólo esta foto. Si falla, conservamos la anterior.</p>
  </fieldset>;
}
