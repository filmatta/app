"use client";
import "@/components/profiles/activation-owner.css";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { validateUploadDeclaration } from "@/lib/profiles/media";
import { DEFAULT_CROP } from "@/lib/profiles/image-input";
import { PROFILE_COVER_PRESETS } from "@/lib/profiles/cover-presets";
import IdentityImage from "@/components/profiles/IdentityImage";
import ProfileAvatar from "@/components/profiles/ProfileAvatar";
import { saveIdentityImage } from "./portfolio-actions";
import type { EditorState } from "./PortfolioDialogs";
export type IdentityImageHandle = { save: () => Promise<boolean> };
export default function IdentityImageEditor({
  kind,
  id,
  fallbackUrl,
  done,
  continueRef,
  name = "F",
}: {
  kind: "portrait" | "cover";
  id?: string | null;
  fallbackUrl?: string;
  done: (state: EditorState) => void;
  continueRef?: Ref<IdentityImageHandle>;
  name?: string;
}) {
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState("");
  const [preset, setPreset] = useState<string | null>(null),
    [stored, setStored] = useState({ id, fallbackUrl });
  const [crop, setCrop] = useState({ ...DEFAULT_CROP }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    saving = useRef(false);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function save(remove = false): Promise<boolean> {
    if (saving.current) return false;
    if (!remove && !file && !preset) return true;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      let mediaId: string | null = null;
      if (!remove) {
        let selected = file;
        if (preset) {
          const choice = PROFILE_COVER_PRESETS.find((p) => p.id === preset);
          if (!choice) throw Error("Elige una portada válida.");
          const response = await fetch(choice.src);
          if (!response.ok)
            throw Error("No se pudo cargar esta portada. Inténtalo de nuevo.");
          selected = new File(
            [await response.blob()],
            `filmatta-${choice.id}.webp`,
            { type: "image/webp" },
          );
        }
        if (!selected) throw Error("Selecciona una imagen.");
        const invalid = validateUploadDeclaration("image", selected);
        if (invalid) throw Error(invalid);
        const response = await fetch("/api/portfolio/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: {
              category: "book",
              purpose: kind,
              title:
                kind === "portrait"
                  ? "Retrato"
                  : preset
                    ? "Portada FILMATTA predeterminada"
                    : "Portada",
              role: "",
              year: "",
              description: "",
              source: "storage",
              media_type: "image",
              url: "",
              featured: false,
              image_crop: crop,
            },
            file: {
              name: selected.name,
              type: selected.type,
              size: selected.size,
            },
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || "No se pudo preparar la subida.");
        const upload = await createClient()
          .storage.from("profile-media")
          .upload(result.path, selected, {
            contentType: selected.type,
            upsert: false,
          });
        if (upload.error)
          throw Error(
            "No se completó la subida. La imagen anterior se conserva. Puedes reintentar.",
          );
        const complete = await fetch(
          `/api/portfolio/media/${result.id}/complete`,
          { method: "POST" },
        );
        if (!complete.ok)
          throw Error(
            "No se pudo validar la imagen. Usa JPG, PNG o WebP estático, de 64 px como mínimo y hasta 20 MB / 40 megapíxeles.",
          );
        mediaId = result.id;
      }
      const saved = await saveIdentityImage(kind, mediaId);
      if ("error" in saved) throw Error(saved.error);
      setStored({
        id: mediaId,
        fallbackUrl:
          kind === "portrait"
            ? saved.data.profile.presentation.portrait_url
            : undefined,
      });
      done(saved.data);
      setFile(null);
      setPreset(null);
      setUrl("");
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos guardar la imagen. Puedes reintentar.",
      );
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  useImperativeHandle(continueRef, () => ({ save: () => save() }));
  const selectedUrl =
      url || PROFILE_COVER_PRESETS.find((p) => p.id === preset)?.src,
    hasImage = Boolean(selectedUrl || stored.id || stored.fallbackUrl);
  return (
    <fieldset
      className={`pe-identity-upload pe-identity-upload--${kind}`}
      disabled={busy}
    >
      <legend>
        {kind === "portrait" ? "Tu foto de perfil" : "Portada de perfil"}
      </legend>
      <p className="pe-hint">
        {kind === "portrait"
          ? "Usa una foto nítida y de buena calidad donde tu rostro se vea claramente."
          : "Una buena portada puede ser un still de uno de tus trabajos o una fotografía horizontal de un rodaje."}
      </p>
      <div
        className={`pe-image-preview ${kind === "cover" && !hasImage ? "pe-image-preview--empty-cover" : ""}`}
      >
        {selectedUrl ? (
          <div className="pe-crop-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedUrl}
              alt="Vista previa del encuadre"
              style={{
                objectPosition: `${crop.x}% ${crop.y}%`,
                transform: `scale(${crop.zoom})`,
                transformOrigin: `${crop.x}% ${crop.y}%`,
              }}
            />
          </div>
        ) : kind === "portrait" ? (
          <ProfileAvatar
            id={stored.id}
            fallbackUrl={stored.fallbackUrl}
            name={name}
          />
        ) : stored.id ? (
          <IdentityImage id={stored.id} alt="Portada actual" />
        ) : (
          <div className="activation-cover-placeholder">
            <strong>Portada de perfil</strong>
            <p>Agrega una imagen horizontal para personalizar tu perfil.</p>
            <button type="button" onClick={() => input.current?.click()}>
              Agregar portada
            </button>
          </div>
        )}
      </div>
      {kind === "cover" && hasImage && (
        <button type="button" onClick={() => input.current?.click()}>
          Cambiar portada
        </button>
      )}
      {kind === "cover" && (
        <div className="activation-presets">
          <h3>Portadas FILMATTA</h3>
          <p className="pe-hint">
            Imágenes predeterminadas para personalizar tu perfil; no representan
            trabajos de tu portfolio.
          </p>
          <div role="group" aria-label="Portadas predeterminadas">
            {PROFILE_COVER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={preset === p.id}
                onClick={() => {
                  setPreset(p.id);
                  setFile(null);
                  setUrl("");
                  setCrop({ ...DEFAULT_CROP });
                  setError("");
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt="" loading="lazy" />
                <span>
                  {p.label}
                  {preset === p.id ? " ✓" : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <input
        ref={input}
        hidden
        aria-label={
          kind === "portrait"
            ? "Archivo de foto de perfil"
            : "Archivo de portada"
        }
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const invalid = validateUploadDeclaration("image", f);
          setError(invalid ?? "");
          if (invalid) {
            e.target.value = "";
            return;
          }
          setFile(f);
          setPreset(null);
          setUrl(URL.createObjectURL(f));
          setCrop({ ...DEFAULT_CROP });
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => input.current?.click()}>
        {kind === "cover"
          ? "Subir mi portada"
          : hasImage
            ? "Cambiar imagen"
            : "Elegir imagen"}
      </button>
      <p className="pe-hint">
        {kind === "portrait"
          ? "Recomendado: 800 × 800 px."
          : "Recomendado: 1920 × 780 px."}{" "}
        JPG, PNG o WebP · hasta 20 MB.
      </p>
      {file && (
        <div className="pe-crop-controls">
          {(["x", "y", "zoom"] as const).map((key) => (
            <label key={key}>
              {key === "x"
                ? "Encuadre horizontal"
                : key === "y"
                  ? "Encuadre vertical"
                  : "Acercamiento"}
              <input
                type="range"
                min={key === "zoom" ? 1 : 0}
                max={key === "zoom" ? 3 : 100}
                step={key === "zoom" ? 0.05 : 1}
                value={crop[key]}
                onChange={(e) =>
                  setCrop((v) => ({ ...v, [key]: Number(e.target.value) }))
                }
              />
            </label>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="pe-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Guardando imagen…</p>}
      {!continueRef && (
        <div className="pe-tools">
          <button
            type="button"
            disabled={(!file && !preset) || busy}
            onClick={() => void save()}
          >
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
          {(stored.id || stored.fallbackUrl) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
            >
              Quitar imagen
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}
