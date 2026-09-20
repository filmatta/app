"use client";
import { useState } from "react";
export default function ShareProfile({
  slug,
  compact = false,
}: {
  slug: string;
  compact?: boolean;
}) {
  const [message, setMessage] = useState("");
  const path = `/perfiles/${encodeURIComponent(slug)}`;
  async function share() {
    const url = new URL(path, window.location.origin).href;
    try {
      if (navigator.share)
        await navigator.share({ title: "Mi perfil FILMATTA", url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage("Enlace copiado.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("Copia la dirección del enlace de tu perfil.");
    }
  }
  return (
    <div className={compact ? "p2-share-compact" : "profile-share"}>
      <button type="button" onClick={share} className="profile-text-link">
        {compact ? "Compartir perfil ↗" : "Comparte tu perfil FILMATTA ↗"}
      </button>
      <a href={path} className={compact ? "sr-only" : "profile-url"}>
        /perfiles/{slug}
      </a>
      <span role="status" className="text-sm text-[#B9DCEB]">
        {message}
      </span>
    </div>
  );
}
