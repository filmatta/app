import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";
import { LOCATION_PHOTO_BUCKET, validateLocationPhotoSignature } from "@/lib/locations/media";
import { deleteLocationPhotoObject } from "@/lib/locations/photo-storage";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!portfolioRequestOrigin(request)) return new Response(null, { status: 403 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401 });
  const { id } = await params;
  const rowResult = await db.from("location_photos")
    .select("id,owner_id,storage_path,lifecycle_status,expected_size_bytes,mime_type")
    .eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  const row = rowResult.data;
  if (!row || !row.storage_path || row.lifecycle_status !== "uploading") return new Response(null, { status: 409 });

  const admin = createAdminClient();
  const infoResult = await admin.storage.from(LOCATION_PHOTO_BUCKET).info(row.storage_path);
  const info = (infoResult.data ?? {}) as unknown as Record<string, unknown>;
  const metadata = (typeof info.metadata === "object" && info.metadata ? info.metadata : {}) as Record<string, unknown>;
  const actualSize = numberValue(info.size, metadata.size, metadata.contentLength);
  const actualMime = stringValue(info.contentType, info.mimetype, metadata.mimetype, metadata.contentType);
  let signatureValid = false;
  if (!infoResult.error && actualSize !== null && actualMime) {
    const signed = await admin.storage.from(LOCATION_PHOTO_BUCKET).createSignedUrl(row.storage_path, 60);
    if (!signed.error && signed.data?.signedUrl) {
      const response = await fetch(signed.data.signedUrl, { headers: { Range: "bytes=0-31" }, cache: "no-store" });
      if (response.ok) {
        const prefix = new Blob([await readPrefix(response, 32)], { type: actualMime });
        signatureValid = await validateLocationPhotoSignature(prefix as Blob & { type: string });
      }
    }
  }
  const valid = signatureValid && actualSize === row.expected_size_bytes && actualMime === row.mime_type;
  const attested = await admin.rpc("attest_location_photo", {
    p_id: row.id,
    p_owner: auth.user.id,
    p_valid: valid,
    p_actual_size: actualSize,
    p_actual_mime: actualMime,
  });
  if (!valid || attested.error || attested.data !== true) {
    await deleteLocationPhotoObject(admin, row.id, row.storage_path);
    return Response.json({ error: "La imagen no coincide con un JPG, PNG o WebP válido, o llegó fuera de tiempo." }, { status: 400 });
  }
  return Response.json({ ready: true });
}

async function readPrefix(response: Response, limit: number) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const result = new Uint8Array(limit);
  let offset = 0;
  try {
    while (offset < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const length = Math.min(value.byteLength, limit - offset);
      result.set(value.subarray(0, length), offset);
      offset += length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return result.subarray(0, offset);
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function stringValue(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
}
