"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, FormEvent } from "react";
import type {
  MediaCategory,
  MediaItem,
  MediaInput,
} from "@/lib/profiles/media";
import {
  VIDEO_GUIDANCE,
  validateUploadDeclaration,
} from "@/lib/profiles/media";
import type { ProfessionalProfile } from "@/lib/profiles/types";
import {
  AVAILABILITY_LABELS,
  PROFILE_DISCIPLINES,
} from "@/lib/profiles/constants";
import { createClient } from "@/lib/supabase/client";
import {
  loadMyPortfolio,
  managePortfolioItem,
  savePortfolioItem,
  savePortfolioSection,
} from "./portfolio-actions";
import { analyzeBio, BIO_CONTACT_TITLE, BIO_CONTACT_MESSAGE, BIO_EMAIL_NOTICE } from "@/lib/profiles/bio-policy";
import "@/app/cuenta/private-contact.css";
import IdentityImageEditor from "./IdentityImageEditor";
import { PRODUCTION_TYPES } from "@/lib/profiles/credits";
import { DEFAULT_CROP } from "@/lib/profiles/image-input";
import { RATE_CURRENCIES } from "@/lib/profiles/rate";
export type EditorState = {
  profile: ProfessionalProfile;
  items: MediaItem[] | null;
};

export function EditorDialog({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="pe-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">FILMATTA / Editar perfil</p>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar editor"
          disabled={busy}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function WorkDialog({
  category,
  item,
  items,
  done,
  close,
}: {
  category: MediaCategory;
  item?: MediaItem;
  items: MediaItem[];
  done: (v: EditorState) => void;
  close: () => void;
}) {
  const [type, setType] = useState<"image" | "video" | "link" | null>(
    item?.media_type ??
      (category === "book" ? "image" : category === "reel" ? "video" : null),
  );
  const [source, setSource] = useState(item?.source ?? "external");
  const [imageCrop, setImageCrop] = useState(item?.image_crop ?? { ...DEFAULT_CROP });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState("");
  const upload = useRef<XMLHttpRequest | null>(null);
  const reserved = useRef<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (inFlight.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const internal = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest?.("a[href]");
      if (inFlight.current && link && !window.confirm("Hay una transferencia pendiente. ¿Salir y dejar que el servidor compruebe su estado?")) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    document.addEventListener("click", internal, true);
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", internal, true);
      upload.current?.abort();
    };
  }, []);
  function xhr(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: File,
  ) {
    return new Promise<void>((resolve, reject) => {
      const req = new XMLHttpRequest();
      upload.current = req;
      req.open(method, url);
      for (const [key, value] of Object.entries(headers))
        req.setRequestHeader(key, value);
      req.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setProgress(Math.round((e.loaded / e.total) * 100));
      };
      req.onload = () =>
        req.status >= 200 && req.status < 300
          ? resolve()
          : reject(new Error("La subida no terminó. Inténtalo de nuevo."));
      req.onerror = () =>
        reject(new Error("La conexión se interrumpió. Inténtalo de nuevo."));
      req.onabort = () => reject(new Error("Subida cancelada."));
      req.send(body);
    });
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || !type) return;
    const form = new FormData(e.currentTarget);
    const selectedSource =
      type === "image" ? (item?.source ?? "storage") : source;
    const value: MediaInput = {
      category: !item && category === "reel" ? "work" : category,
      title: String(form.get("title")),
      role: String(form.get("role") ?? "") || (category === "reel" ? "Reel" : ""),
      year: String(form.get("year") ?? ""),
      description: String(form.get("description") ?? ""),
      media_type: type,
      image_crop: imageCrop,
      source: selectedSource,
      url: String(form.get("url") ?? item?.url ?? ""),
      featured: form.get("featured") === "on",
    };
    const thumbnail = String(form.get("thumbnail") ?? "");
    if (!item && selectedSource !== "external") {
      if (!file) {
        setError("Elige un archivo.");
        return;
      }
      const err = validateUploadDeclaration(
        type === "image" ? "image" : "video",
        file,
      );
      if (err) {
        setError(err);
        return;
      }
    }
    setError("");
    setBusy(true);
    inFlight.current = true;
    try {
      if (item || selectedSource === "external") {
        const result = await savePortfolioItem(item?.id ?? null, value);
        if ("error" in result) throw new Error(result.error);
        if (
          item &&
          item.media_type !== "image" &&
          thumbnail !== (item.thumbnail_id ?? "")
        ) {
          const r = await managePortfolioItem(
            item.id,
            "thumbnail",
            thumbnail || null,
          );
          if ("error" in r) throw new Error(r.error);
          done(r.data);
        } else done(result.data);
      } else if (file) {
        setPhase("Preparando subida…");
        const response = await fetch("/api/portfolio/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: value,
            file: { name: file.name, type: file.type, size: file.size },
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "No pudimos iniciar la subida.");
        reserved.current = result.id;
        setProgress(0);
        setPhase("Subiendo archivo…");
        if (selectedSource === "mux")
          await xhr(
            result.uploadUrl,
            "PUT",
            { "Content-Type": file.type },
            file,
          );
        else {
          const db = createClient();
          const { data } = await db.auth.getSession();
          if (!data.session)
            throw new Error("Tu sesión terminó. Inicia sesión de nuevo.");
          const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/profile-media/${result.path}`;
          await xhr(
            url,
            "POST",
            {
              Authorization: `Bearer ${data.session.access_token}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
              "Content-Type": file.type,
              "x-upsert": "false",
            },
            file,
          );
          setPhase("Verificando imagen…");
          const verified = await fetch(
            `/api/portfolio/media/${result.id}/complete`,
            { method: "POST" },
          );
          if (!verified.ok) {
            const v = await verified.json();
            throw new Error(v.error ?? "No pudimos verificar la imagen.");
          }
        }
        setProgress(null);
        setPhase(
          selectedSource === "mux"
            ? "Archivo recibido. Procesando video…"
            : "Imagen lista.",
        );
        if (value.featured && selectedSource !== "mux") {
          const featured = await managePortfolioItem(result.id, "feature");
          if ("error" in featured) throw new Error(featured.error);
        }
        const refreshed = await loadMyPortfolio();
        if ("error" in refreshed) throw new Error(refreshed.error);
        done(refreshed.data);
      }
      close();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos guardar el trabajo.",
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function cancelUpload() {
    if (
      !window.confirm(
        "¿Cancelar esta subida? Tendrás que seleccionar el archivo de nuevo.",
      )
    )
      return;
    upload.current?.abort();
    if (reserved.current) {
      try {
        const response = await fetch(`/api/portfolio/media/${reserved.current}/cancel`, { method: "POST" });
        const result = await response.json();
        if (!response.ok) { setError(result.error); return; }
        if (result.state === "pending") { setError("La cancelación sigue pendiente. No descartamos un archivo recibido."); return; }
        const current = await loadMyPortfolio();
        if ("data" in current) done(current.data);
        if (result.state === "received") { setError("El archivo ya fue recibido y se conservará mientras se procesa."); return; }
      } catch { setError("No pudimos confirmar la cancelación. Comprueba el intento en tu perfil."); return; }
    }
    close();
  }
  return (
    <EditorDialog
      title={
        item
          ? "Editar trabajo"
          : category === "book"
            ? "Añadir foto"
            : category === "reel"
              ? "Añadir reel"
              : "Añadir trabajo"
      }
      close={close}
      busy={busy}
    >
      {!type ? (
        <>
          <p className="pe-hint">Elige cómo quieres presentar esta pieza.</p>
          <div className="pe-choice">
            <button
              type="button"
              onClick={() => {
                setType("image");
                setSource("storage");
              }}
            >
              Imagen<small>Un still, fotografía o proyecto visual</small>
            </button>
            <button type="button" onClick={() => setType("video")}>
              Video<small>YouTube, Vimeo o un archivo propio</small>
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          {!item && type === "video" && (
            <fieldset className="pe-tools">
              <legend>Fuente del video</legend>
              <label className="pe-checkbox">
                <input
                  type="radio"
                  name="source"
                  checked={source === "external"}
                  onChange={() => setSource("external")}
                  disabled={busy}
                />
                Pegar enlace
              </label>
              <label className="pe-checkbox">
                <input
                  type="radio"
                  name="source"
                  checked={source === "mux"}
                  onChange={() => setSource("mux")}
                  disabled={busy}
                />
                Subir archivo
              </label>
            </fieldset>
          )}
          {type === "video" && source === "external" && (
            <label>
              Enlace de YouTube o Vimeo
              <input
                name="url"
                type="url"
                required
                defaultValue={item?.url}
                placeholder="https://vimeo.com/…"
                disabled={busy}
              />
            </label>
          )}
          {!item && (type === "image" || source === "mux") && (
            <div className="pe-upload">
              <label>
                {type === "image" ? "Subir imagen" : "Subir video"}
                <input
                  type="file"
                  accept={
                    type === "image"
                      ? "image/jpeg,image/png,image/webp"
                      : "video/mp4,video/quicktime,.mov"
                  }
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    setError(
                      f
                        ? (validateUploadDeclaration(
                            type === "image" ? "image" : "video",
                            f,
                          ) ?? "")
                        : "",
                    );
                  }}
                />
              </label>
              <p>
                {type === "image"
                  ? "JPG, PNG o WebP · Máximo 20 MB"
                  : VIDEO_GUIDANCE}
              </p>
              {file && (
                <p>
                  {file.name} · {(file.size / 1_000_000).toFixed(1)} MB
                </p>
              )}
              {progress !== null && (
                <>
                  <progress
                    max={100}
                    value={progress}
                    aria-label="Progreso de subida"
                  />
                  <p role="status">
                    {phase} {progress}%
                  </p>
                </>
              )}
            </div>
          )}
          {type === "image" && <fieldset><legend>Encuadre de miniatura</legend>
            <label>Formato<select value={imageCrop.frame} onChange={e => setImageCrop(v => ({ ...v, frame: e.target.value as typeof v.frame }))}><option value="auto">Original</option><option value="portrait">Vertical 4:5</option><option value="square">Cuadrado</option><option value="landscape">Horizontal</option></select></label>
            {(["x", "y", "zoom"] as const).map(key => <label key={key}>{key === "x" ? "Horizontal" : key === "y" ? "Vertical" : "Acercamiento"}<input type="range" min={key === "zoom" ? 1 : 0} max={key === "zoom" ? 3 : 100} step={key === "zoom" ? .05 : 1} value={imageCrop[key]} onChange={e => setImageCrop(v => ({ ...v, [key]: Number(e.target.value) }))} /></label>)}
            <p className="pe-hint">Sólo cambia la miniatura. Al ampliar se muestra la imagen completa.</p>
          </fieldset>}
          <label>
            Título
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={item?.title}
              disabled={busy}
            />
          </label>
          <div className="pe-row">
            <label>
              Rol {category !== "work" && "(opcional)"}
              <input
                name="role"
                required={category === "work"}
                maxLength={80}
                defaultValue={item?.role}
                disabled={busy}
              />
            </label>
            <label>
              Año
              <input
                name="year"
                inputMode="numeric"
                pattern="(19|20)[0-9]{2}"
                maxLength={4}
                defaultValue={item?.year}
                disabled={busy}
              />
            </label>
          </div>
          <label>
            Descripción breve (opcional)
            <textarea
              name="description"
              maxLength={240}
              defaultValue={item?.description}
              disabled={busy}
            />
          </label>
          {category === "reel" && !item && <p className="pe-hint">El video se añade a Otros videos. Cuando esté listo, podrás elegirlo como reel si su duración verificada es de hasta 3 minutos. Los enlaces externos sin duración verificada permanecen en Otros videos.</p>}
          <label className="pe-checkbox">
            <input
              name="featured"
              type="checkbox"
              defaultChecked={item?.featured}
              disabled={busy}
            />
            {category === "book"
              ? "Foto principal del book"
              : "Trabajo destacado"}
          </label>
          <p className="pe-hint">
            Un principal por sección. Al destacarlo reemplazas la selección
            anterior.
          </p>
          {item && item.media_type !== "image" && (
            <label>
              Still personalizado
              <select
                name="thumbnail"
                defaultValue={item.thumbnail_id ?? ""}
                disabled={busy}
              >
                <option value="">Frame del video</option>
                {items
                  .filter(
                    (i) =>
                      i.media_type === "image" &&
                      i.status === "ready" &&
                      i.visibility !== "archived",
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
              </select>
              <small>
                Para usar otro still, añádelo como imagen y selecciónalo aquí.
              </small>
            </label>
          )}
          {error && (
            <p role="alert" className="pe-error">
              {error}
            </p>
          )}
          {busy && (
            <p role="status" className="pe-hint">
              Mantén esta ventana abierta hasta que termine la transferencia.
              Después puedes cerrar mientras el video se procesa.
            </p>
          )}
          <footer>
            {busy && progress !== null ? (
              <button type="button" onClick={cancelUpload}>
                Cancelar subida
              </button>
            ) : (
              <button type="button" onClick={close} disabled={busy}>
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="pe-primary"
              disabled={
                busy ||
                Boolean(
                  file &&
                  validateUploadDeclaration(
                    type === "image" ? "image" : "video",
                    file,
                  ),
                )
              }
            >
              {busy
                ? "Guardando…"
                : item
                  ? "Guardar cambios"
                  : "Añadir al portfolio"}
            </button>
          </footer>
        </form>
      )}
    </EditorDialog>
  );
}

export function SectionDialog({
  section,
  profile,
  bioDraft,
  setBioDraft,
  done,
  close,
}: {
  section: string;
  profile: ProfessionalProfile;
  bioDraft: string;
  setBioDraft: (text: string) => void;
  done: (v: EditorState) => void;
  close: () => void;
}) {
  const bioWarning = useRef<HTMLDivElement>(null);
  const bioAnalysis = analyzeBio(bioDraft);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [credits, setCredits] = useState(profile.presentation.credits);
  const titles: Record<string, string> = {
    identity: "Identidad profesional",
    about: "Sobre mí",
    credits: "Trayectoria / CV",
    skills: "Habilidades y equipo",
    publication: "Publicar y contacto",
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (section === "about" && bioDraft.trim() !== (profile.bio ?? "").trim() && bioAnalysis.blocked) { bioWarning.current?.focus(); setError(BIO_CONTACT_MESSAGE); return; }
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const input: Record<string, unknown> = Object.fromEntries(form.entries());
    input.disciplines = form.getAll("disciplines");
    input.is_public = form.get("is_public") === "on";
    input.credits = credits;
    try {
      const result = await savePortfolioSection(section, input);
      if ("error" in result) setError(result.error);
      else {
        done(result.data);
        close();
      }
    } catch {
      setError("No pudimos guardar los cambios.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <EditorDialog title={titles[section]} close={close} busy={busy}>
      <form onSubmit={submit}>
        {section === "identity" && (
          <>
            <label>
              Nombre profesional
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={
                  profile.presentation.stage_name || profile.display_name
                }
              />
            </label>
            <fieldset>
              <legend>Disciplinas · elige hasta 5</legend>
              <div className="pe-disciplines">
                {Array.from(
                  new Set([...PROFILE_DISCIPLINES, ...profile.disciplines]),
                ).map((d) => (
                  <label className="pe-checkbox" key={d}>
                    <input
                      type="checkbox"
                      name="disciplines"
                      value={d}
                      defaultChecked={profile.disciplines.includes(d)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Ciudad
              <input
                name="city"
                maxLength={80}
                defaultValue={profile.city ?? ""}
              />
            </label>
            <label>
              Zona de trabajo (opcional)
              <input
                name="work_area"
                maxLength={80}
                defaultValue={profile.presentation.work_area}
              />
            </label>
            <label>
              Disponibilidad
              <select name="availability" defaultValue={profile.availability}>
                {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>Orientación del portafolio<select name="portfolio_mode" defaultValue={profile.presentation.portfolio_mode ?? "unspecified"}><option value="unspecified">Sin especificar</option><option value="audiovisual">Audiovisual · reel prioritario</option><option value="photographic">Fotográfico · Book</option></select></label>
            <IdentityImageEditor kind="portrait" id={profile.presentation.portrait_media_id} fallbackUrl={profile.presentation.portrait_url} done={done} />
            <IdentityImageEditor kind="cover" id={profile.presentation.cover_media_id} done={done} />

          </>
        )}
        {section === "about" && <>
          <label htmlFor="profile-bio">Bio breve</label>
          <textarea id="profile-bio" name="bio" maxLength={1200} value={bioDraft} onChange={e => setBioDraft(e.target.value)} rows={7} aria-describedby={bioAnalysis.blocked ? "bio-contact-warning" : bioAnalysis.hasEmail ? "bio-email-notice" : undefined} />
          {bioAnalysis.blocked && <div id="bio-contact-warning" ref={bioWarning} tabIndex={-1} className="bio-contact-warning"><strong>⚠ {BIO_CONTACT_TITLE}</strong><p>{BIO_CONTACT_MESSAGE}</p><a href="/cuenta#datos-contacto" target="_blank" rel="noopener noreferrer">Ir a datos de contacto ↗</a>{bioDraft.trim() === (profile.bio ?? "").trim() && <p>Bio histórica: puedes guardar otras secciones. Al modificarla, tendrás que corregir estos datos.</p>}</div>}
          {bioAnalysis.hasEmail && <p id="bio-email-notice" className="pe-hint">{BIO_EMAIL_NOTICE}</p>}
        </>}
        {section === "credits" && (
          <>
            {credits.map((c, i) => (
              <div className="pe-credit" key={i}>
                <label>
                  Producción
                  <input
                    required
                    maxLength={100}
                    value={c.title}
                    onChange={(e) =>
                      setCredits((v) =>
                        v.map((r, j) =>
                          j === i ? { ...r, title: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </label>
                <div className="pe-row">
                  <label>
                    Rol
                    <input
                      required
                      maxLength={80}
                      value={c.role}
                      onChange={(e) =>
                        setCredits((v) =>
                          v.map((r, j) =>
                            j === i ? { ...r, role: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Inicio (año o año-mes)
                    <input
                      maxLength={7}
                      pattern="(19|20)[0-9]{2}(-(0[1-9]|1[0-2]))?"
                      placeholder="2024 o 2024-06"
                      value={c.start || c.year}
                      onChange={(e) =>
                        setCredits((v) =>
                          v.map((r, j) =>
                            j === i ? { ...r, year: e.target.value.slice(0,4), start: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label className="pe-checkbox"><input type="checkbox" checked={c.ongoing ?? false} onChange={e => setCredits(v => v.map((r,j) => j === i ? { ...r, ongoing: e.target.checked, end: e.target.checked ? "" : r.end } : r))} />En curso</label>
                {!c.ongoing && <label>Fin (opcional, año o año-mes)<input maxLength={7} pattern="(19|20)[0-9]{2}(-(0[1-9]|1[0-2]))?" value={c.end ?? ""} onChange={e => setCredits(v => v.map((r,j) => j === i ? { ...r, end: e.target.value } : r))} /></label>}
                <label>Productora / cliente (opcional)<input maxLength={100} value={c.company ?? ""} onChange={e => setCredits(v => v.map((r,j) => j === i ? { ...r, company: e.target.value } : r))} /></label>
                <label>Tipo de producción<select value={c.production_type ?? ""} onChange={e => setCredits(v => v.map((r,j) => j === i ? { ...r, production_type: e.target.value } : r))}>{PRODUCTION_TYPES.map(t => <option key={t} value={t}>{t || "Sin especificar"}</option>)}</select></label>
                <label>Descripción breve<textarea maxLength={400} value={c.description ?? ""} onChange={e => setCredits(v => v.map((r,j) => j === i ? { ...r, description: e.target.value } : r))} /></label>
                <label>Enlace público (opcional)<input type="url" maxLength={500} value={c.url ?? ""} onChange={e => setCredits(v => v.map((r,j) => j === i ? { ...r, url: e.target.value } : r))} /></label>
                <button
                  type="button"
                  onClick={() => setCredits((v) => v.filter((_, j) => j !== i))}
                >
                  Quitar experiencia
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={credits.length >= 30}
              onClick={() =>
                setCredits((v) => [...v, { title: "", role: "", year: "" }])
              }
            >
              + Añadir experiencia
            </button>
          </>
        )}
        {section === "skills" && (
          <>
            <label>
              Habilidades · separadas por coma
              <textarea
                name="skills"
                defaultValue={profile.skills.join(", ")}
              />
            </label>
            <label>
              Equipo · separado por coma
              <textarea
                name="equipment"
                defaultValue={profile.equipment.join(", ")}
              />
            </label>
            <fieldset><legend>Tarifa aproximada (opcional)</legend>
              <div className="pe-row"><label>Importe<input name="amount" inputMode="decimal" pattern="(0|[1-9][0-9]{0,7})([.][0-9]{1,2})?" defaultValue={profile.presentation.rate?.amount ?? ""} placeholder="5000" /></label>
              <label>Moneda<select name="currency" defaultValue={profile.presentation.rate?.currency ?? "MXN"}>{RATE_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label></div>
              <label>Unidad<select name="unit" defaultValue={profile.presentation.rate?.unit ?? "day"}><option value="hour">Por hora</option><option value="day">Por día</option></select></label>
              <p className="pe-hint">Referencia orientativa. No activa cobros ni reservas.</p>
              {profile.presentation.rate_range && <><p className="pe-hint">Valor anterior: {profile.presentation.rate_range}. Completa moneda y unidad sin asumirlas.</p><label className="pe-checkbox"><input type="checkbox" name="clear_legacy_rate" />Quitar el texto histórico al guardar</label></>}
            </fieldset>

          </>
        )}
        {section === "publication" && (
          <>
            <label className="pe-checkbox">
              <input
                name="is_public"
                type="checkbox"
                defaultChecked={profile.is_public}
              />
              Perfil público y compartible
            </label>
            <p className="pe-hint">
              Mientras sea público, cada cambio guardado se verá en tu perfil.
              En borrador sólo tú puedes verlo. Los enlaces protegidos ya
              emitidos pueden tardar hasta 5 minutos en caducar.
            </p>
            <a href="/cuenta#datos-contacto" target="_blank" rel="noopener noreferrer">Editar datos de contacto ↗</a>
            <p className="pe-hint">Las consultas internas no dan acceso a Instagram ni WhatsApp.</p>
            <label>
              Contacto
              <select
                name="contact_policy"
                defaultValue={profile.contact_policy}
              >
                <option value="members_only">
                  Pueden contactarme miembros de FILMATTA
                </option>
                <option value="closed">No recibir solicitudes</option>
              </select>
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="pe-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="pe-primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </footer>
      </form>
    </EditorDialog>
  );
}
