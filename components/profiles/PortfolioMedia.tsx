"use client";
import { useEffect, useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react/lazy";
import type { MediaCategory, MediaItem } from "@/lib/profiles/media";
import { reelSource, portfolioWebUrl } from "@/lib/profiles/presentation";
import ProfileImage from "./ProfileImage";
import { portfolioGroups } from "@/lib/profiles/portfolio-order";
import { reelEligible } from "@/lib/profiles/upload-lifecycle";
import "./portfolio-editor.css";

type Resource = {
  image?: string;
  expiresAt?: number;
  playbackId?: string;
  tokens?: { playback: string; thumbnail: string };
};
function useResource(id: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [resource, setResource] = useState<Resource | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id || !ref.current) return;
    let live = true;
    const controller = new AbortController();
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        fetch(`/api/portfolio/media/${id}/resource`, {
          cache: "no-store",
          signal: controller.signal,
        })
          .then(async (r) => {
            if (!r.ok) throw new Error();
            const result = await r.json();
            if (live) {
              setResource(result);
              setError(false);
              if (result.expiresAt) refresh = setTimeout(() => {
                if (document.visibilityState === "visible") setAttempt(a => a + 1);
              }, Math.max(1000, result.expiresAt - Date.now() - 15000));
            }
          })
          .catch(() => {
            if (live) setError(true);
          });
      },
      { rootMargin: "250px" },
    );
    observer.observe(ref.current);
    return () => {
      live = false;
      controller.abort();
      clearTimeout(refresh);
      observer.disconnect();
    };
  }, [id, attempt]);
  return { ref, resource, error, retry: () => setAttempt((a) => a + 1) };
}
export function MediaVisual({
  item,
  override,
  openImage,
}: {
  item: MediaItem;
  override?: MediaItem;
  openImage?: () => void;
}) {
  const stored = item.source !== "external" && item.status === "ready";
  const { ref, resource, error, retry } = useResource(stored ? item.id : null);
  const [playing, setPlaying] = useState(false);
  const [visualError, setVisualError] = useState("");
  const external = reelSource(item.url);
  const { ref: thumbRef, resource: thumbnailResource } = useResource(
    override?.source === "storage" ? override.id : null,
  );
  const poster =
    thumbnailResource?.image ||
    (override?.source === "external" ? override.url : undefined);
  if (item.status !== "ready")
    return (
      <div className="pm-screen pm-processing" role="status">
        {item.terminal_reason === "cancelled" ? "Subida cancelada. Selecciona el archivo para un nuevo intento." : item.terminal_reason === "expired" ? "El intento venció sin completarse. Puedes volver a subir el archivo." : (
            {
              uploading: "Esperando archivo…",
              processing: "Procesando video…",
              errored:
                "No se pudo procesar. Archiva este intento y vuelve a subirlo.",
              rejected:
                "Archivo rechazado. Revisa el formato e inténtalo de nuevo.",
              deleted: "Archivo eliminado.",
            } as Record<string, string>
          )[item.status]}
      </div>
    );
  return (
    <div
      ref={ref}
      className={`pm-screen ${item.category === "book" ? "pm-screen--portrait" : ""}`}
      style={item.media_type === "video" && item.aspect_ratio ? { aspectRatio: item.aspect_ratio.replace(":", "/") } : undefined}
    >
      <div ref={thumbRef} />
      {item.media_type === "image" ? (
        <><ProfileImage
          src={item.source === "external" ? item.url : resource?.image}
          alt={item.title}
          fallback="IMAGEN"
        />{openImage && <button className="pm-open-image" type="button" onClick={openImage} aria-label={`Ampliar ${item.title}`} />}</>
      ) : playing && item.source === "mux" && resource?.playbackId ? (
        <MuxPlayer
          playbackId={resource.playbackId}
          tokens={resource.tokens}
          streamType="on-demand"
          accentColor="#B9DCEB"
          autoPlay={false}
          onError={() => {
            setPlaying(false);
            setVisualError("No pudimos reproducir el video. Renueva el acceso para reintentar.");
          }}
        />
      ) : playing && external ? (
        <iframe
          src={external.embed}
          title={item.title}
          loading="lazy"
          allow="fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      ) : (
        <>
          <ProfileImage
            src={
              poster ||
              external?.thumbnail ||
              (resource?.playbackId && resource.tokens
                ? `https://image.mux.com/${resource.playbackId}/thumbnail.jpg?token=${encodeURIComponent(resource.tokens.thumbnail)}`
                : undefined)
            }
            alt=""
            onError={() => setVisualError("La miniatura no está disponible. Puedes reintentar o reproducir el video.")}
            fallback={item.source === "mux" ? "VIDEO" : "TRABAJO"}
          />
          {external || item.source === "mux" ? (
            <button
              type="button"
              className="reel-play"
              onClick={() => {
                if (item.source === "mux") retry();
                setPlaying(true);
              }}
              disabled={item.source === "mux" && !resource?.playbackId}
              aria-label={`Reproducir ${item.title}`}
            >
              â–· <span>Ver {item.category === "reel" ? "reel" : "video"}</span>
            </button>
          ) : (
            portfolioWebUrl(item.url) && (
              <a
                className="reel-play"
                href={item.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                Ver trabajo â†—
              </a>
            )
          )}
        </>
      )}
      {(error || visualError) && (
        <button type="button" className="pm-retry" onClick={() => { setVisualError(""); retry(); }}>
          {visualError || "No se pudo obtener acceso al archivo."} Reintentar
        </button>
      )}
    </div>
  );
}
export type MediaControls = {
  add: (category: MediaCategory) => void;
  edit: (item: MediaItem) => void;
  action: (item: MediaItem, action: string) => void;
  busy: boolean;
};
export default function PortfolioMedia({
  items,
  talent,
  controls,
}: {
  items: MediaItem[];
  talent: boolean;
  controls?: MediaControls;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const visible = items.filter((i) =>
    controls
      ? i.visibility !== "archived"
      : i.visibility === "visible" && i.status === "ready",
  );
  const categories: MediaCategory[] = ["reel", "work", "book"];
  const groups = portfolioGroups(visible);
  return (
    <div className="pm-portfolio" id="portfolio">
      {expanded && <BookLightbox items={groups.book.filter(i => i.status === "ready")} id={expanded} select={setExpanded} close={() => setExpanded(null)} />}
      {categories.map((category) => {
        const group = groups[category];
        if (!group.length && !controls) return null;
        if (category === "book" && !talent && !group.length && !controls)
          return null;
        return (
          <section
            key={category}
            id={category === "work" ? "videos" : category}
            className={`pm-section pm-${category}`}
            aria-label={
              category === "book"
                ? "Book"
                : category === "reel"
                  ? "Reels"
                  : "Trabajos"
            }
          >
            <div className="p2-section-heading">
              <h2>
                {category === "book"
                  ? "Book"
                  : category === "reel"
                    ? "Reel"
                    : "Otros videos"}
              </h2>
              {controls && (
                <button
                  type="button"
                  onClick={() => controls.add(category)}
                  disabled={controls.busy}
                >
                  +{" "}
                  {category === "book"
                    ? "Añadir foto"
                    : category === "reel"
                      ? "Añadir reel"
                      : "Añadir trabajo"}
                </button>
              )}
            </div>
            {!group.length && controls && (
              <div className="pm-empty">
                <p>
                  {category === "work"
                    ? "Todavía no has añadido trabajos."
                    : category === "book"
                      ? "Tu book está vacío."
                      : "Tu reel, en primer plano."}
                </p>
                <button type="button" onClick={() => controls.add(category)}>
                  {category === "work"
                    ? "+ Añadir tu primer trabajo"
                    : category === "book"
                      ? "+ Añadir foto"
                      : "+ Añadir reel"}
                </button>
              </div>
            )}
            <div
              className={`pm-grid ${category === "reel" ? "pm-grid--reels" : ""}`}
            >
              {group.map((item, index) => (
                <figure
                  key={item.id}
                  className={`pm-piece ${item.featured || (category === "reel" && index === 0) ? "pm-piece--featured" : ""} ${item.visibility === "hidden" ? "pm-piece--hidden" : ""}`}
                >
                  <MediaVisual
                    item={item}
                    openImage={item.media_type === "image" ? () => setExpanded(item.id) : undefined}
                    override={items.find(
                      (i) =>
                        i.id === item.thumbnail_id &&
                        (controls || i.visibility === "visible"),
                    )}
                  />
                  <figcaption>
                    <h3>{item.title}</h3>
                    {(item.role || item.year) && (
                      <p>
                        {[item.role, item.year].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {item.duration_seconds != null && <p>{Math.floor(item.duration_seconds / 60)}:{String(Math.floor(item.duration_seconds % 60)).padStart(2, "0")}</p>}
                    {item.description && <p>{item.description}</p>}
                    {controls && category === "reel" && !reelEligible(item) && <p>Selección histórica: duración no verificada o superior a 3 minutos. Puedes conservarla o elegir otro reel.</p>}
                  </figcaption>
                  {controls && (
                    <div
                      className="pm-item-controls"
                      aria-label={`Editar ${item.title}`}
                    >
                      <span>
                        {item.featured
                          ? category === "book"
                            ? "Portada"
                            : "Destacado"
                          : item.visibility === "hidden"
                            ? "Oculto"
                            : ""}
                      </span>
                      <button
                        type="button"
                        disabled={controls.busy}
                        onClick={() => controls.edit(item)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={controls.busy}
                        onClick={() => controls.action(item, "up")}
                        aria-label={`Mover arriba: ${item.title}`}
                      >
                        â†‘
                      </button>
                      <button
                        type="button"
                        disabled={controls.busy}
                        onClick={() => controls.action(item, "down")}
                        aria-label={`Mover abajo: ${item.title}`}
                      >
                        â†“
                      </button>
                      {item.media_type === "video" && category !== "reel" && <button type="button" disabled={controls.busy || !reelEligible(item)} onClick={() => controls.action(item, "reel")}>Elegir como reel</button>}
                      {category === "reel" && <button type="button" disabled={controls.busy} onClick={() => controls.action(item, "other-video")}>Mover a otros videos</button>}
                      <button
                        type="button"
                        disabled={controls.busy}
                        onClick={() => controls.action(item, "feature")}
                      >
                        {item.featured
                          ? "Quitar destacado"
                          : category === "book"
                            ? "Hacer portada"
                            : "Destacar"}
                      </button>
                      <button
                        type="button"
                        disabled={controls.busy}
                        onClick={() =>
                          controls.action(
                            item,
                            item.visibility === "hidden" ? "show" : "hide",
                          )
                        }
                      >
                        {item.visibility === "hidden" ? "Mostrar" : "Ocultar"}
                      </button>
                      <button
                        type="button"
                        disabled={controls.busy}
                        onClick={() => controls.action(item, "archive")}
                      >
                        Archivar
                      </button>
                    </div>
                  )}
                </figure>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BookLightbox({ items, id, select, close }: { items: MediaItem[]; id: string; select: (id: string) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const index = items.findIndex(i => i.id === id);
  const item = items[index];
  const { ref, resource, error, retry } = useResource(item?.source === "storage" ? item.id : null);
  const move = (delta: number) => select(items[(index + delta + items.length) % items.length].id);
  useEffect(() => { const d = dialog.current; d?.showModal(); return () => d?.close(); }, []);
  if (!item) return null;
  return <dialog ref={dialog} className="pm-lightbox" aria-label={item.title} onCancel={close} onKeyDown={e => {
    if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
  }}>
    <header><p>{item.title}</p><button type="button" onClick={close} aria-label="Cerrar imagen">×</button></header>
    <div ref={ref} className="pm-full-image"><ProfileImage src={item.source === "external" ? item.url : resource?.image} alt={item.description || item.title} eager />{error && <button onClick={retry}>Reintentar imagen</button>}</div>
    <footer><button onClick={() => move(-1)} aria-label="Imagen anterior">←</button><p>{index + 1} / {items.length}</p><button onClick={() => move(1)} aria-label="Imagen siguiente">→</button></footer>
  </dialog>;
}
