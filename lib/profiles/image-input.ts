export type ImageCrop = { x: number; y: number; zoom: number; frame: "auto" | "portrait" | "square" | "landscape" };
export const DEFAULT_CROP: ImageCrop = { x: 50, y: 50, zoom: 1, frame: "auto" };
export function parseImageCrop(value: unknown): ImageCrop | null {
  if (value == null) return { ...DEFAULT_CROP };
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as ImageCrop;
  if (![v.x,v.y,v.zoom].every(n => typeof n === "number" && Number.isFinite(n)) ||
    v.x < 0 || v.x > 100 || v.y < 0 || v.y > 100 || v.zoom < 1 || v.zoom > 3 ||
    !["auto", "portrait", "square", "landscape"].includes(v.frame)) return null;
  return { x: v.x, y: v.y, zoom: v.zoom, frame: v.frame };
}
export function cropRectangle(width: number, height: number, ratio: number, crop: ImageCrop) {
  const w = Math.max(1, Math.floor(Math.min(width, height * ratio) / crop.zoom));
  const h = Math.max(1, Math.floor(w / ratio));
  return { width: w, height: h, left: Math.round((width - w) * crop.x / 100), top: Math.round((height - h) * crop.y / 100) };
}
