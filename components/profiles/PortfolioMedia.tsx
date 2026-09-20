"use client";
import { useEffect, useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react/lazy";
import type { MediaCategory, MediaItem } from "@/lib/profiles/media";
import { reelSource, portfolioWebUrl } from "@/lib/profiles/presentation";
import ProfileImage from "./ProfileImage";
import "./portfolio-editor.css";

type Resource = {
  image?: string;
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
      observer.disconnect();
    };
  }, [id, attempt]);
  return { ref, resource, error, retry: () => setAttempt((a) => a + 1) };
}
export function MediaVisual({
  item,
  override,
}: {
  item: MediaItem;
  override?: MediaItem;
}) {
  const stored = item.source !== "external" && item.status === "ready";
  const { ref, resource, error, retry } = useResource(stored ? item.id : null);
  const [playing, setPlaying] = useState(false);
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
        {
          (
            {
              uploading: "Esperando archivo…",
              processing: "Procesando video…",
              errored:
                "No se pudo procesar. Archiva este intento y vuelve a subirlo.",
              rejected:
                "Archivo rechazado. Revisa el formato e inténtalo de nuevo.",
              deleted: "Archivo eliminado.",
            } as Record<string, string>
          )[item.status]
        }
      </div>
    );
  return (
    <div
      ref={ref}
      className={`pm-screen ${item.category === "book" ? "pm-screen--portrait" : ""}`}
    >
      <div ref={thumbRef} />
      {item.media_type === "image" ? (
        <ProfileImage
          src={item.source === "external" ? item.url : resource?.image}
          alt={item.title}
          fallback="IMAGEN"
        />
      ) : playing && item.source === "mux" && resource?.playbackId ? (
        <MuxPlayer
          playbackId={resource.playbackId}
          tokens={resource.tokens}
          streamType="on-demand"
          accentColor="#B9DCEB"
          autoPlay={false}
          onError={() => {
            setPlaying(false);
            retry();
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
              ▷ <span>Ver {item.category === "reel" ? "reel" : "video"}</span>
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
      {error && (
        <button type="button" className="pm-retry" onClick={retry}>
          No se pudo cargar. Reintentar
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
  const visible = items.filter((i) =>
    controls
      ? i.visibility !== "archived"
      : i.visibility === "visible" && i.status === "ready",
  );
  const categories: MediaCategory[] = talent
    ? ["book", "reel", "work"]
    : ["reel", "work", "book"];
  return (
    <div className="pm-portfolio" id="portfolio">
      {categories.map((category) => {
        const group = visible
          .filter((i) => i.category === category)
          .sort(
            (a, b) =>
              Number(b.featured) - Number(a.featured) ||
              a.sort_order - b.sort_order ||
              a.id.localeCompare(b.id),
          );
        if (!group.length && !controls) return null;
        if (category === "book" && !talent && !group.length && !controls)
          return null;
        return (
          <section
            key={category}
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
                  ? talent
                    ? "Book"
                    : "Imágenes"
                  : category === "reel"
                    ? "Reel"
                    : "Trabajos seleccionados"}
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
                    {item.description && <p>{item.description}</p>}
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
