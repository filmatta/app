"use client";

import { useState } from "react";
import MuxPlayer from "@mux/mux-player-react/lazy";
import type { VideoPresentation } from "@/components/LessonVideoPlayer";

export default function LocationCameraTourPlayer({ tourId, title }: { tourId: string; title: string }) {
  const [video, setVideo] = useState<VideoPresentation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function authorize() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/locations/tours/${tourId}/playback`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No pudimos abrir el recorrido.");
      setVideo(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos abrir el recorrido.");
    } finally { setLoading(false); }
  }

  if (video?.status === "ready" && video.playbackId) {
    return <MuxPlayer aria-label={`Recorrido de ${title}`} playbackId={video.playbackId} tokens={video.tokens} streamType="on-demand" accentColor="#ffffff" className="aspect-video w-full" onError={() => { setVideo(null); setError("La reproducción se interrumpió. Solicita acceso de nuevo."); }} />;
  }
  return <div className="flex aspect-video flex-col items-center justify-center gap-4 bg-white/[0.035] p-8 text-center">
    <button type="button" onClick={authorize} disabled={loading} className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-60">
      {loading ? "Autorizando…" : "▶ Ver recorrido"}
    </button>
    {error && <p role="alert" className="max-w-md text-sm text-red-200">{error}</p>}
    <p className="max-w-md text-xs leading-5 text-white/45">La autorización protegida se solicita al pulsar reproducir; el video no se precarga al abrir la ficha.</p>
  </div>;
}
