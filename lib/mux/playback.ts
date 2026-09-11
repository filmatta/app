import "server-only";
import type { VideoPresentation } from "@/components/LessonVideoPlayer";
import { createMuxClient } from "./server";

type StoredVideo = {
  status: string;
  playback_policy: string;
  mux_playback_id: string | null;
};

// Caller must first authorize access to this exact lesson on the server.
export async function presentVideo(video: StoredVideo | null): Promise<VideoPresentation> {
  if (!video) return { status: "none" };
  if (video.status !== "ready") return { status: video.status === "errored" ? "errored" : "preparing" };
  if (!video.mux_playback_id) return { status: "errored" };
  if (video.playback_policy === "public") return { status: "ready", playbackId: video.mux_playback_id };
  if (video.playback_policy !== "signed") return { status: "errored" };
  if (!process.env.MUX_SIGNING_KEY || !process.env.MUX_PRIVATE_KEY) return { status: "ready", message: "Video listo. La reproducción protegida requiere configurar las claves de firma de Mux." };
  const mux = createMuxClient();
  const privateKey = process.env.MUX_PRIVATE_KEY.replace(/\\n/g, "\n");
  const [playback, thumbnail, storyboard] = await Promise.all([
    mux.jwt.signPlaybackId(video.mux_playback_id, { expiration: "4h", type: "video", keySecret: privateKey }),
    mux.jwt.signPlaybackId(video.mux_playback_id, { expiration: "4h", type: "thumbnail", keySecret: privateKey }),
    mux.jwt.signPlaybackId(video.mux_playback_id, { expiration: "4h", type: "storyboard", keySecret: privateKey }),
  ]);
  const tokens = { playback, thumbnail, storyboard };
  return { status: "ready", playbackId: video.mux_playback_id, tokens };
}

// This deliberately creates only an image token. Callers must authorize the
// lesson independently and must not use this helper to construct a player.
export async function presentVideoPoster(video: StoredVideo | null) {
  if (
    !video ||
    video.status !== "ready" ||
    !video.mux_playback_id
  ) {
    return null;
  }

  const baseUrl = `https://image.mux.com/${encodeURIComponent(video.mux_playback_id)}/thumbnail.jpg`;

  if (video.playback_policy === "public") {
    return `${baseUrl}?width=1280&fit_mode=preserve`;
  }

  if (
    video.playback_policy !== "signed" ||
    !process.env.MUX_SIGNING_KEY ||
    !process.env.MUX_PRIVATE_KEY
  ) {
    return null;
  }

  const thumbnailToken = await createMuxClient().jwt.signPlaybackId(
    video.mux_playback_id,
    {
      expiration: "15m",
      type: "thumbnail",
      params: { width: "1280", fit_mode: "preserve" },
      keySecret: process.env.MUX_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
  );

  return `${baseUrl}?token=${encodeURIComponent(thumbnailToken)}&width=1280&fit_mode=preserve`;
}
