"use client";
import { useState } from "react";
import type { PortfolioItem } from "@/lib/profiles/types";
import { portfolioWebUrl, reelSource } from "@/lib/profiles/presentation";
import ProfileImage from "./ProfileImage";
export default function ReelPlayer({
  item,
  poster,
}: {
  item: PortfolioItem;
  poster?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const source = reelSource(item.url);
  const url = portfolioWebUrl(item.url);
  if (!url) return null;
  return (
    <figure className="profile-reel">
      <div className="profile-reel-screen">
        {playing && source ? (
          <iframe
            title={item.title}
            src={source.embed}
            loading="lazy"
            allow="fullscreen; picture-in-picture; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <>
            <ProfileImage
              src={poster || source?.thumbnail}
              alt=""
              fallback="REEL"
            />
            {source ? (
              <button
                type="button"
                className="reel-play"
                onClick={() => setPlaying(true)}
                aria-label={`Cargar reel: ${item.title}`}
              >
                <span aria-hidden="true">▷</span>
                <span>
                  Ver reel <small>{source.provider}</small>
                </span>
              </button>
            ) : (
              <a
                className="reel-play"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span aria-hidden="true">↗</span>
                <span>
                  Ver reel <small>Abrir sitio original</small>
                </span>
              </a>
            )}
          </>
        )}
      </div>
      <figcaption>
        <div>
          <span className="eyebrow">Reel seleccionado</span>
          <h2>{item.title}</h2>
          {item.summary && <p>{item.summary}</p>}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="profile-text-link"
        >
          Abrir original ↗
        </a>
      </figcaption>
    </figure>
  );
}
