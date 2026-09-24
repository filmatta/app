import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";
import { LOCATION_PHOTO_BUCKET, validateLocationPhotoSignature } from "@/lib/locations/media";
import { deleteLocationPhotoObject } from "@/lib/locations/photo-storage";
import {
  LOCATION_PHOTO_FINALIZATION_TIMEOUT_MS,
  readLocationPhotoPrefix,
  withLocationPhotoDeadline,
} from "@/lib/locations/photo-finalization";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401 });
  const { id } = await params;
  const result = await db.from("location_photos")
    .select("lifecycle_status")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (result.error || !result.data) return new Response(null, { status: 404 });
  return Response.json({
    ready: result.data.lifecycle_status === "ready",
    pending: result.data.lifecycle_status === "uploading",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!portfolioRequestOrigin(request)) return new Response(null, { status: 403 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401 });
  const { id } = await params;
  const rowResult = await db.from("location_photos")
    .select("id,owner_id,storage_path,lifecycle_status,expected_size_bytes,mime_type,expires_at")
    .eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  const row = rowResult.data;
  if (!row || !row.storage_path) return new Response(null, { status: 409 });
  if (row.lifecycle_status === "ready") return Response.json({ ready: true });
  if (row.lifecycle_status !== "uploading") return new Response(null, { status: 409 });
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return Response.json({
      error: "La confirmación venció. El archivo sigue conservado y necesita revisión antes de publicarse.",
      pending: true,
      expired: true,
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const admin = createAdminClient();
  let infoResult: Awaited<ReturnType<ReturnType<typeof admin.storage.from>["info"]>>;
  try {
    infoResult = await withLocationPhotoDeadline(
      admin.storage.from(LOCATION_PHOTO_BUCKET).info(row.storage_path),
    );
  } catch (error) {
    return pendingConfirmation(error);
  }
  if (infoResult.error) {
    if (String(infoResult.error.statusCode) !== "404") return pendingConfirmation(infoResult.error);
    await rejectLocationPhoto(admin, row.id, auth.user.id, row.storage_path, null, null);
    return Response.json({ error: "No encontramos el archivo guardado para confirmar esta foto." }, { status: 400 });
  }
  const info = (infoResult.data ?? {}) as unknown as Record<string, unknown>;
  const metadata = (typeof info.metadata === "object" && info.metadata ? info.metadata : {}) as Record<string, unknown>;
  const actualSize = numberValue(info.size, metadata.size, metadata.contentLength);
  const actualMime = stringValue(info.contentType, info.mimetype, metadata.mimetype, metadata.contentType);
  if (actualSize === null || !actualMime || actualSize !== row.expected_size_bytes || actualMime !== row.mime_type) {
    await rejectLocationPhoto(admin, row.id, auth.user.id, row.storage_path, actualSize, actualMime);
    return Response.json({ error: "El archivo guardado no coincide con la foto seleccionada." }, { status: 400 });
  }
  let signatureValid = false;
  try {
    const signed = await withLocationPhotoDeadline(
      admin.storage.from(LOCATION_PHOTO_BUCKET).createSignedUrl(row.storage_path, 60),
    );
    if (signed.error || !signed.data?.signedUrl) return pendingConfirmation(signed.error);
    const response = await fetch(signed.data.signedUrl, {
      headers: { Range: "bytes=0-31" },
      cache: "no-store",
      signal: AbortSignal.timeout(LOCATION_PHOTO_FINALIZATION_TIMEOUT_MS),
    });
    if (!response.ok) return pendingConfirmation(new Error(`Storage responded ${response.status}`));
    const prefix = new Blob([
      await withLocationPhotoDeadline(readLocationPhotoPrefix(response, 32)),
    ], { type: actualMime });
    signatureValid = await validateLocationPhotoSignature(prefix as Blob & { type: string });
  } catch (error) {
    return pendingConfirmation(error);
  }
  const valid = signatureValid && actualSize === row.expected_size_bytes && actualMime === row.mime_type;
  if (!valid) {
    await rejectLocationPhoto(admin, row.id, auth.user.id, row.storage_path, actualSize, actualMime);
    return Response.json({ error: "El contenido del archivo no coincide con JPG, PNG o WebP." }, { status: 400 });
  }
  const attested = await admin.rpc("attest_location_photo", {
    p_id: row.id,
    p_owner: auth.user.id,
    p_valid: valid,
    p_actual_size: actualSize,
    p_actual_mime: actualMime,
  });
  if (attested.error) return pendingConfirmation(attested.error);
  if (attested.data !== true) {
    const reconciled = await db.from("location_photos")
      .select("lifecycle_status")
      .eq("id", row.id)
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (reconciled.data?.lifecycle_status === "ready") return Response.json({ ready: true });
    if (reconciled.data?.lifecycle_status === "uploading") return pendingConfirmation();
    await deleteLocationPhotoObject(admin, row.id, row.storage_path);
    return Response.json({ error: "La confirmación venció. Reintenta esta foto." }, { status: 400 });
  }
  return Response.json({ ready: true });
}

async function rejectLocationPhoto(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  ownerId: string,
  path: string,
  actualSize: number | null,
  actualMime: string | null,
) {
  await admin.rpc("attest_location_photo", {
    p_id: id,
    p_owner: ownerId,
    p_valid: false,
    p_actual_size: actualSize,
    p_actual_mime: actualMime,
  });
  await deleteLocationPhotoObject(admin, id, path);
}

function pendingConfirmation(error?: unknown) {
  if (error) console.info("Location photo confirmation deferred.");
  return Response.json({
    error: "La foto está guardada, pero no pudimos confirmar su formato. Reintenta la confirmación.",
    pending: true,
  }, { status: 503, headers: { "Cache-Control": "no-store" } });
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
