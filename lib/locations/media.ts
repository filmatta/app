export const LOCATION_PHOTO_LIMIT = 20;
export const LOCATION_PHOTO_MAX_BYTES = 10_000_000;
export const LOCATION_PHOTO_BUCKET = "location-photos";
export const LOCATION_PHOTO_SIGNED_URL_SECONDS = 300;

export const LOCATION_PHOTO_TYPES = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
} as const;

export type LocationPhotoMime = keyof typeof LOCATION_PHOTO_TYPES;

export type LocationPhotoDeclaration = {
  name: string;
  size: number;
  type: string;
};

export function validateLocationPhotoDeclaration(file: LocationPhotoDeclaration) {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > LOCATION_PHOTO_MAX_BYTES) {
    return "Cada foto debe pesar como máximo 10 MB.";
  }
  const extensions = LOCATION_PHOTO_TYPES[file.type as LocationPhotoMime];
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!extensions?.includes(extension as never)) {
    return "Usa una imagen JPG, PNG o WebP.";
  }
  return null;
}

export async function validateLocationPhotoSignature(file: Blob & { type: string }) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => bytes[index] === value);
  const webp = bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  return (file.type === "image/jpeg" && jpeg)
    || (file.type === "image/png" && png)
    || (file.type === "image/webp" && webp);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}
