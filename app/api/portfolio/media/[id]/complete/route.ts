import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { cropRectangle, parseImageCrop } from "@/lib/profiles/image-input";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_LIMIT } from "@/lib/profiles/media";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!portfolioRequestOrigin(request))
    return new Response(null, { status: 403 });
  const db = await createClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return new Response(null, { status: 401 });
  const { id } = await params;
  const { data: row } = await db
    .from("profile_media")
    .select("*")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (
    !row ||
    row.source !== "storage" ||
    !row.storage_path ||
    !(row.status === "uploading" || (row.status === "errored" && row.review_reason === "image-finalization-required"))
  )
    return new Response(null, { status: 409 });
  const file = await db.storage
    .from("profile-media")
    .download(row.storage_path);
  if (file.error || !file.data)
    return Response.json(
      { error: "No se recibió la imagen." },
      { status: 400 },
    );
  let derivative: Buffer | undefined;
  let dimensions: { width: number; height: number } | undefined;
  let valid =
    file.data.size > 0 &&
    file.data.size <= IMAGE_LIMIT &&
    file.data.size === row.expected_size_bytes;
  try {
    if (valid) {
      const bytes = Buffer.from(await file.data.arrayBuffer());
      const decoder = sharp(bytes, {
        limitInputPixels: 40_000_000,
        failOn: "warning",
      });
      const info = await decoder.metadata();
      const formats: Record<string, string> = {
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };
      valid =
        formats[info.format ?? ""] === row.mime_type && (info.pages ?? 1) === 1;
      valid = valid && Boolean(info.width && info.height && info.width >= 64 && info.height >= 64);
      if (valid) {
        // Rotate and re-encode without keepMetadata: never publish EXIF/GPS originals.
        const rotated = await decoder.rotate().toBuffer({ resolveWithObject: true });
        const crop = parseImageCrop(row.image_crop);
        if (!crop) throw new Error("Invalid crop");
        let output = sharp(rotated.data);
        if (row.purpose === "portrait" || row.purpose === "cover") output = output.extract(cropRectangle(rotated.info.width, rotated.info.height, row.purpose === "portrait" ? 1 : 1920 / 780, crop));
        const result = await output.resize({ width: row.purpose === "portrait" ? 1000 : 2400, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
        derivative = result.data;
        dimensions = { width: result.info.width, height: result.info.height };
      }
    }
  } catch {
    valid = false;
  }
  // Infrastructure attestation after owner/RLS read. No profile CRUD uses this client.
  const admin = createAdminClient();
  const derivativePath = valid && derivative ? `${auth.user.id}/${id}/public-${randomUUID()}.webp` : null;
  if (derivativePath && derivative) {
    const stored = await admin.storage.from("profile-media").upload(derivativePath, derivative, { contentType: "image/webp", upsert: false });
    if (stored.error) return Response.json({ error: "No pudimos preparar la imagen. Tu foto anterior se conserva." }, { status: 503 });
  }
  const updated = await admin
    .from("profile_media")
    .update({
      status: valid ? "ready" : "rejected",
      review_reason: null,
      derivative_path: derivativePath, image_width: dimensions?.width ?? null, image_height: dimensions?.height ?? null,
      cleanup_after: valid ? row.cleanup_after : new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .eq("status", row.status)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (updated.error || !updated.data?.length) {
    // This unique candidate is never referenced if the CAS did not commit.
    if (!updated.error && derivativePath) await admin.storage.from("profile-media").remove([derivativePath]);
    return new Response(null, { status: 409 });
  }
  if (!valid) {
    await admin.storage.from("profile-media").remove([row.storage_path]);
    return Response.json(
      {
        error:
          "Imagen inválida. Usa JPG, PNG o WebP estático, de hasta 20 MB y 40 megapíxeles.",
      },
      { status: 400 },
    );
  }
  return Response.json({ ready: true });
}
