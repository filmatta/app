import type { MediaCategory, MediaItem } from "./media";

export const MAX_VIDEO_DURATION_SECONDS = 300;
export const MAX_VIDEO_FILE_BYTES = 2_000_000_000;

export const FREE_PROFILE_MEDIA_LIMITS = {
  reel: 1,
  work: 2,
  book: 6,
} as const satisfies Record<MediaCategory, number>;

export const FREE_VIDEO_GUIDANCE = "Máximo 5 minutos y 2 GB por archivo.";
export const EXTERNAL_VIDEO_GUIDANCE =
  "Los enlaces externos cuentan dentro de tu límite, pero no tienen límite de duración ni peso.";

const ACTIVE_QUOTA_STATUSES = new Set(["uploading", "processing", "ready"]);

export function isFreeProfilePlan(plan: string | null) {
  return plan === null;
}

export function countsTowardProfileQuota(item: MediaItem) {
  return (
    (!item.purpose || item.purpose === "portfolio") &&
    ACTIVE_QUOTA_STATUSES.has(item.status)
  );
}

export function getProfileMediaCounts(items: MediaItem[]) {
  const active = items.filter(countsTowardProfileQuota);
  return {
    reel: active.filter(
      (item) => item.category === "reel" && item.media_type === "video",
    ).length,
    work: active.filter(
      (item) => item.category === "work" && item.media_type === "video",
    ).length,
    book: active.filter((item) => item.media_type === "image").length,
  };
}

export function profileMediaQuotaError({
  items,
  category,
  mediaType,
  editingExisting = false,
}: {
  items: MediaItem[];
  category: MediaCategory;
  mediaType: "image" | "video" | "link";
  editingExisting?: boolean;
}) {
  if (editingExisting) return null;
  const counts = getProfileMediaCounts(items);
  if (mediaType === "image" && counts.book >= FREE_PROFILE_MEDIA_LIMITS.book)
    return "Tu plan Free permite hasta 6 fotos en Book.";
  if (
    mediaType === "video" &&
    category === "reel" &&
    counts.reel >= FREE_PROFILE_MEDIA_LIMITS.reel
  )
    return "Tu plan Free permite 1 Reel.";
  if (
    mediaType === "video" &&
    category === "work" &&
    counts.work >= FREE_PROFILE_MEDIA_LIMITS.work
  )
    return "Tu plan Free permite hasta 2 videos.";
  return null;
}

export function validateVideoDuration(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0)
    return "No pudimos determinar la duración del video. Elige otro archivo.";
  if (duration > MAX_VIDEO_DURATION_SECONDS)
    return "El video supera el máximo de 5 minutos.";
  return null;
}

export function profileMediaErrorMessage(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("FREE_REEL_LIMIT"))
    return "Tu plan Free permite 1 Reel.";
  if (message.includes("FREE_VIDEO_LIMIT"))
    return "Tu plan Free permite hasta 2 videos.";
  if (message.includes("FREE_BOOK_LIMIT"))
    return "Tu plan Free permite hasta 6 fotos en Book.";
  if (message.includes("FREE_VIDEO_FILE_LIMIT"))
    return "El archivo supera el máximo de 2 GB.";
  if (message.includes("FREE_VIDEO_DURATION_LIMIT"))
    return "El video supera el máximo de 5 minutos.";
  return null;
}
