"use client";
import MuxPlayer from "@mux/mux-player-react/lazy";

export type VideoPresentation = {
  status: "none" | "preparing" | "errored" | "ready" | "unavailable";
  playbackId?: string;
  tokens?: { playback?: string; thumbnail?: string; storyboard?: string };
  message?: string;
  replacementPending?: boolean;
  policyCoherent?: boolean;
};
export default function LessonVideoPlayer({ video }: { video: VideoPresentation }) {
  if (video.status === "ready" && video.playbackId) {
    return <MuxPlayer playbackId={video.playbackId} tokens={video.tokens} streamType="on-demand" accentColor="#ffffff" className="aspect-video w-full" />;
  }
  const labels = { none: "Todavía no hay video disponible.", preparing: "Procesando video…", errored: "No se pudo procesar el video. El equipo debe revisar el archivo.", ready: "La reproducción protegida todavía no está configurada.", unavailable: "No se pudo consultar el video. Inténtalo de nuevo más tarde." };
  return <p role="status" className="p-8 text-sm leading-6 text-white/50">{video.message ?? labels[video.status]}</p>;
}
