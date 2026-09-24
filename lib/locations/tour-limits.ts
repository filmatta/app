export const LOCATION_TOUR_MAX_DURATION_SECONDS = 180;
export const LOCATION_TOUR_AUTO_STOP_SECONDS = 178;
export const LOCATION_TOUR_MAX_BLOB_BYTES = 150_000_000;
export const LOCATION_TOUR_VIDEO_BITS_PER_SECOND = 2_500_000;
export const LOCATION_TOUR_POLL_INTERVAL_MS = 5_000;

export const LOCATION_TOUR_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
] as const;

export function locationTourBlobProblem(blob: Pick<Blob, "size" | "type">, durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return "No se obtuvo una grabación utilizable.";
  if (durationSeconds > LOCATION_TOUR_MAX_DURATION_SECONDS) return "El recorrido supera los 180 segundos.";
  if (!blob.size) return "La cámara no produjo datos de video.";
  if (blob.size > LOCATION_TOUR_MAX_BLOB_BYTES) return "La grabación supera el máximo de 150 MB de esta prueba.";
  if (!/^video\/(webm|mp4)(;|$)/i.test(blob.type)) return "El navegador produjo un formato de video no compatible.";
  return null;
}
