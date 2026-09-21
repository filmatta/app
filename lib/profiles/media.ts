import { parseImageCrop, type ImageCrop } from "./image-input";
// Decimal product limits. The video limit validates a declaration, not Mux bytes.
export const VIDEO_LIMIT = 5_000_000_000;
export const IMAGE_LIMIT = 20_000_000;
export const VIDEO_GUIDANCE =
  "Máximo 5 GB. Para portafolio recomendamos 1080p o 4K comprimido en H.264/H.265. No subas masters, ProRes ni archivos sin comprimir.";
export const VIDEO_TOO_LARGE =
  "Tu archivo es demasiado grande para portafolio. Súbelo a YouTube o Vimeo y pega el enlace.";
export type MediaCategory = "work" | "reel" | "book";
export type MediaItem = {
  id: string;
  category: MediaCategory;
  title: string;
  role: string;
  year: string;
  description: string;
  media_type: "image" | "video" | "link";
  source: "external" | "storage" | "mux";
  url: string;
  provider: "youtube" | "vimeo" | null;
  external_video_id: string | null;
  thumbnail_id: string | null;
  featured: boolean;
  sort_order: number;
  visibility: "visible" | "hidden" | "archived";
  status:
    "uploading" | "processing" | "ready" | "errored" | "rejected" | "deleted";
  created_at: string;
  updated_at: string;
  duration_seconds?: number | null;
  image_crop?: ImageCrop;
  image_width?: number | null;
  image_height?: number | null;
  purpose?: "portfolio" | "portrait" | "cover";
  aspect_ratio?: string | null;
  terminal_reason?: "cancelled" | "expired" | "provider-error" | null;
};
export type MediaInput = Pick<
  MediaItem,
  | "category"
  | "title"
  | "role"
  | "year"
  | "description"
  | "media_type"
  | "source"
  | "url"
  | "featured"
  | "purpose"
  | "image_crop"
>;
export function externalVideo(value: unknown) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : [
              "youtube.com",
              "www.youtube.com",
              "m.youtube.com",
              "www.youtube-nocookie.com",
            ].includes(u.hostname)
          ? u.pathname === "/watch"
            ? u.searchParams.get("v")
            : u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]
          : null;
    if (id && /^[\w-]{11}$/.test(id))
      return {
        provider: "youtube" as const,
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
      };
    if (
      ["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(u.hostname)
    ) {
      const match = u.pathname.match(
        /^\/(?:video\/)?([0-9]{1,15})(?:\/([a-zA-Z0-9]{1,64}))?\/?$/,
      );
      if (match) {
        const hash = match[2] || u.searchParams.get("h");
        if (hash && !/^[a-zA-Z0-9]{1,64}$/.test(hash)) return null;
        return {
          provider: "vimeo" as const,
          id: match[1],
          url: `https://vimeo.com/${match[1]}${hash ? `/${hash}` : ""}`,
        };
      }
    }
  } catch {}
  return null;
}
export function validateUploadDeclaration(
  type: "image" | "video",
  file: { name: string; type: string; size: number },
) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0)
    return "El archivo está vacío o su tamaño no es válido.";
  if (file.size > (type === "video" ? VIDEO_LIMIT : IMAGE_LIMIT))
    return type === "video" ? VIDEO_TOO_LARGE : "La imagen supera 20 MB.";
  const allowed: Record<string, RegExp> =
    type === "image"
      ? {
          "image/jpeg": /\.jpe?g$/i,
          "image/png": /\.png$/i,
          "image/webp": /\.webp$/i,
        }
      : { "video/mp4": /\.mp4$/i, "video/quicktime": /\.mov$/i };
  if (!allowed[file.type]?.test(file.name) || file.name.length > 255)
    return type === "image"
      ? "Usa JPG, PNG o WebP."
      : "Usa un archivo MP4 o MOV.";
  return null;
}
export function parseMediaInput(value: unknown): MediaInput | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number) =>
    typeof v[key] === "string" && (v[key] as string).length <= max
      ? (v[key] as string).trim()
      : null;
  const title = text("title", 100),
    role = text("role", 80),
    year = text("year", 4),
    description = text("description", 240),
    url = text("url", 500);
  if (
    !title ||
    role === null ||
    year === null ||
    !/^(|19\d{2}|20\d{2})$/.test(year) ||
    description === null ||
    url === null ||
    typeof v.featured !== "boolean"
  )
    return null;
  if (
    !["work", "reel", "book"].includes(String(v.category)) ||
    !["image", "video", "link"].includes(String(v.media_type)) ||
    !["external", "storage", "mux"].includes(String(v.source))
  )
    return null;
  if (v.category === "work" && !role) return null;
  if (
    (v.category === "reel" && v.media_type !== "video") ||
    (v.category === "book" && v.media_type !== "image")
  )
    return null;
  if (
    v.media_type === "video" &&
    v.source === "external" &&
    !externalVideo(url)
  )
    return null;
  if (
    (v.source === "mux" && v.media_type !== "video") ||
    (v.source === "storage" && v.media_type !== "image")
  )
    return null;
  if (
    v.media_type === "link" ||
    (v.media_type === "image" && v.source === "external")
  )
    return null; // Legacy items are imported only by the database.
  const crop = parseImageCrop(v.image_crop);
  if (!crop || (v.purpose != null && !["portfolio", "portrait", "cover"].includes(String(v.purpose)))) return null;
  if (v.purpose && v.purpose !== "portfolio" && (v.source !== "storage" || v.media_type !== "image")) return null;
  return {
    purpose: (v.purpose ?? "portfolio") as MediaInput["purpose"], image_crop: crop,
    category: v.category as MediaCategory,
    title,
    role,
    year,
    description,
    media_type: v.media_type as MediaInput["media_type"],
    source: v.source as MediaInput["source"],
    url: v.source === "external" ? externalVideo(url)!.url : "",
    featured: v.featured,
  };
}
