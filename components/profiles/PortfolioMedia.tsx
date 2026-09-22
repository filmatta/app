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
  resourceId?: string;
  image?: string;
  expiresAt?: number;
  playbackId?: string;
  tokens?: { playback: string; thumbnail: string };
};
export function useResource(id: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [resource, setResource] = useState<Resource | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id || !ref.current) return;
    let live = true;
    const controller = new AbortController();
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let expiresAt = 0;
    const resume = () => {
      if (
        document.visibilityState === "visible" &&
        expiresAt &&
        Date.now() > expiresAt - 15000
      )
        setAttempt((a) => a + 1);
    };
    document.addEventListener("visibilitychange", resume);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        fetch(`/api/portfolio/media/${id}/resource`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        })
          .then(async (r) => {
            if (!r.ok) throw new Error();
            const result = await r.json();
            if (live) {
              setResource({ ...result, resourceId: id });
              setErrorId(null);
              expiresAt = result.expiresAt ?? 0;
              if (result.expiresAt)
                refresh = setTimeout(
                  () => {
                    if (document.visibilityState === "visible")
                      setAttempt((a) => a + 1);
                  },
                  Math.max(1000, result.expiresAt - Date.now() - 15000),
                );
            }
          })
          .catch(() => {
            if (live) setErrorId(id);
          });
      },
      { rootMargin: "250px" },
    );
    observer.observe(ref.current);
    return () => {
      live = false;
      controller.abort();
      clearTimeout(refresh);
      document.removeEventListener("visibilitychange", resume);
      observer.disconnect();
    };
  }, [id, attempt]);
  return {
    ref,
    resource: resource?.resourceId === id ? resource : null,
    error: Boolean(id && errorId === id),
    retry: () => {
      setErrorId(null);
      setAttempt((a) => a + 1);
    },
  };
}
export function MediaVisual({
  item,
  override,
  customCover,
  openImage,
}: {
  item: MediaItem;
  override?: MediaItem;
  customCover?: MediaItem;
  openImage?: () => void;
}) {
  const stored = item.source !== "external" && item.status === "ready";
  const external = reelSource(item.url);
  const needsResource =
    stored || (item.category === "work" && external?.provider === "Vimeo");
  const { ref, resource, error, retry } = useResource(
    needsResource ? item.id : null,
  );
  const [playing, setPlaying] = useState(false);
  const [visualError, setVisualError] = useState("");
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const [failedCustom, setFailedCustom] = useState<string | null>(null);
  const {
    ref: customRef,
    resource: customResource,
    error: customError,
  } = useResource(
    item.category === "reel" && customCover ? customCover.id : null,
  );
  const {
    ref: thumbRef,
    resource: thumbnailResource,
    error: thumbnailError,
  } = useResource(override?.source === "storage" ? override.id : null);
  const poster =
    thumbnailResource?.image ||
    (override?.source === "external" ? override.url : undefined);
  const automaticPoster =
    external?.thumbnail ||
    resource?.image ||
    (resource?.playbackId && resource.tokens
      ? `https://image.mux.com/${resource.playbackId}/thumbnail.jpg?token=${encodeURIComponent(resource.tokens.thumbnail)}`
      : undefined);
  const customPoster = customResource?.image;
  const selectedPoster =
    customPoster && customPoster !== failedCustom
      ? customPoster
      : poster && poster !== failedPoster
        ? poster
        : automaticPoster;
  if (item.status !== "ready")
    return (
      <div className="pm-screen pm-processing" role="status">
        {item.terminal_reason === "cancelled"
          ? "Subida cancelada. Selecciona el archivo para un nuevo intento."
          : item.terminal_reason === "expired"
            ? "El intento venció sin completarse. Puedes volver a subir el archivo."
            : (
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
      style={
        item.media_type === "video" && item.aspect_ratio
          ? { aspectRatio: item.aspect_ratio.replace(":", "/") }
          : item.media_type === "image"
            ? { aspectRatio: "4/5" }
            : undefined
      }
    >
      <div ref={thumbRef} />
      <div ref={customRef} />
      {item.media_type === "image" ? (
        <>
          <ProfileImage
            src={item.source === "external" ? item.url : resource?.image}
            pending={stored && !resource && !error}
            error={error}
            alt={item.title}
            onError={() =>
              setVisualError(
                "No se pudo cargar la imagen. Renueva el acceso para reintentar.",
              )
            }
            imageStyle={
              item.image_crop
                ? {
                    objectPosition: `${item.image_crop.x}% ${item.image_crop.y}%`,
                    transform: `scale(${item.image_crop.zoom})`,
                    transformOrigin: `${item.image_crop.x}% ${item.image_crop.y}%`,
                  }
                : undefined
            }
            fallback="IMAGEN"
          />
          {openImage && (
            <button
              className="pm-open-image"
              type="button"
              onClick={openImage}
              aria-label={`Ampliar ${item.title}`}
            />
          )}
        </>
      ) : playing && item.source === "mux" && resource?.playbackId ? (
        <MuxPlayer
          playbackId={resource.playbackId}
          tokens={resource.tokens}
          streamType="on-demand"
          accentColor="#B9DCEB"
          // Mounted only after the user presses Play (playing starts false).
          // Start that requested Reel playback; never mount a player as its preview.
          autoPlay={item.category === "reel"}
          onError={() => {
            setPlaying(false);
            setVisualError(
              "No pudimos reproducir el video. Renueva el acceso para reintentar.",
            );
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
            src={selectedPoster}
            pending={Boolean(
              !selectedPoster &&
                ((customCover && !customResource && !customError) ||
                  (override?.source === "storage" &&
                    !thumbnailResource &&
                    !thumbnailError) ||
                  (needsResource && !resource && !error)),
            )}
            error={Boolean(!selectedPoster && error)}
            alt=""
            onError={() => {
              if (selectedPoster === customPoster && customPoster)
                setFailedCustom(customPoster);
              else if (selectedPoster === poster && poster)
                setFailedPoster(poster);
              else
                setVisualError(
                  "La miniatura no está disponible. Puedes reintentar o reproducir el video.",
                );
            }}
            fallback="Portada no disponible"
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
              <span aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M8 5L19 12L8 19V5Z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>{" "}
              <span>Ver {item.category === "reel" ? "reel" : "video"}</span>
            </button>
          ) : (
            portfolioWebUrl(item.url) && (
              <a
                className="reel-play"
                href={item.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                Ver trabajo ↗
              </a>
            )
          )}
        </>
      )}
      {(error || visualError) && (
        <button
          type="button"
          className="pm-retry"
          onClick={() => {
            setVisualError("");
            setFailedPoster(null);
            setFailedCustom(null);
            retry();
          }}
        >
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
  emptyAdd,
}: {
  items: MediaItem[];
  talent: boolean;
  controls?: MediaControls;
  emptyAdd?: (category: MediaCategory) => void;
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
    <div
      className={`pm-portfolio ${controls ? "pm-portfolio--editing" : ""}`}
      id="portfolio"
    >
      {expanded && (
        <BookLightbox
          items={groups.book.filter((i) => i.status === "ready")}
          id={expanded}
          select={setExpanded}
          close={() => setExpanded(null)}
        />
      )}
      {categories.map((category) => {
        const group = groups[category];
        if (!group.length && !controls && !emptyAdd) return null;
        if (
          category === "book" &&
          !talent &&
          !group.length &&
          !controls &&
          !emptyAdd
        )
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
            {!group.length && (controls || emptyAdd) && (
              <div className="pm-empty">
                <p>
                  {category === "work"
                    ? "Agrega escenas, proyectos o trabajos destacados."
                    : category === "book"
                      ? "Agrega fotografías de trabajos, sesiones o producciones."
                      : "Tu Reel puede presentar tu trabajo en pocos minutos."}
                </p>
                <button
                  type="button"
                  onClick={() => (controls?.add ?? emptyAdd)?.(category)}
                >
                  {category === "work"
                    ? "Agregar video"
                    : category === "book"
                      ? "Agregar al Book"
                      : "Agregar Reel"}
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
                    customCover={
                      item.category === "reel"
                        ? items.find(
                            (i) =>
                              i.id === item.custom_reel_cover_id &&
                              i.status === "ready" &&
                              i.visibility !== "archived",
                          )
                        : undefined
                    }
                    openImage={
                      item.media_type === "image"
                        ? () => setExpanded(item.id)
                        : undefined
                    }
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
                    {item.duration_seconds != null && (
                      <p>
                        {Math.floor(item.duration_seconds / 60)}:
                        {String(
                          Math.floor(item.duration_seconds % 60),
                        ).padStart(2, "0")}
                      </p>
                    )}
                    {item.description && <p>{item.description}</p>}
                    {controls && category === "reel" && !reelEligible(item) && (
                      <p>
                        Selección histórica: duración no verificada o superior a
                        3 minutos. Puedes conservarla o elegir otro reel.
                      </p>
                    )}
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
                      {item.source === "storage" &&
                        ["uploading", "errored"].includes(item.status) && (
                          <button
                            type="button"
                            disabled={controls.busy}
                            onClick={() =>
                              controls.action(item, "complete-image")
                            }
                          >
                            Terminar verificación
                          </button>
                        )}
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
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={controls.busy}
                        onClick={() => controls.action(item, "down")}
                        aria-label={`Mover abajo: ${item.title}`}
                      >
                        ↓
                      </button>
                      {item.media_type === "video" && category !== "reel" && (
                        <button
                          type="button"
                          disabled={controls.busy || !reelEligible(item)}
                          onClick={() => controls.action(item, "reel")}
                        >
                          Elegir como reel
                        </button>
                      )}
                      {category === "reel" && (
                        <button
                          type="button"
                          disabled={controls.busy}
                          onClick={() => controls.action(item, "other-video")}
                        >
                          Mover a otros videos
                        </button>
                      )}
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

function BookLightbox({
  items,
  id,
  select,
  close,
}: {
  items: MediaItem[];
  id: string;
  select: (id: string) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const index = items.findIndex((i) => i.id === id);
  const item = items[index];
  const { ref, resource, error, retry } = useResource(
    item?.source === "storage" ? item.id : null,
  );
  const move = (delta: number) =>
    select(items[(index + delta + items.length) % items.length].id);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  if (!item) return null;
  return (
    <dialog
      ref={dialog}
      className="pm-lightbox"
      aria-labelledby="pm-lightbox-title"
      onCancel={close}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        }
      }}
    >
      <header>
        <p>Book</p>
        <button type="button" onClick={close} aria-label="Cerrar imagen">
          ×
        </button>
      </header>
      <div ref={ref} className="pm-full-image">
        <ProfileImage
          src={item.source === "external" ? item.url : resource?.image}
          pending={item.source === "storage" && !resource && !error}
          error={error}
          alt={item.description || item.title}
          eager
        />
        {error && <button onClick={retry}>Reintentar imagen</button>}
      </div>
      <div className="pm-lightbox-details">
        <h2 id="pm-lightbox-title">{item.title}</h2>
        {(item.role || item.year) && (
          <p>{[item.role, item.year].filter(Boolean).join(" · ")}</p>
        )}
        {item.description && <p>{item.description}</p>}
      </div>
      <footer>
        <button onClick={() => move(-1)} aria-label="Imagen anterior">
          ←
        </button>
        <p>
          {index + 1} / {items.length}
        </p>
        <button onClick={() => move(1)} aria-label="Imagen siguiente">
          →
        </button>
      </footer>
    </dialog>
  );
}
