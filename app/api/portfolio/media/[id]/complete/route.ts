import sharp from "sharp";
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
    row.status !== "uploading"
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
      // Force decoding, not just a spoofable MIME/header check.
      if (valid) await decoder.resize({ width: 1, height: 1 }).raw().toBuffer();
    }
  } catch {
    valid = false;
  }
  // Infrastructure attestation after owner/RLS read. No profile CRUD uses this client.
  const admin = createAdminClient();
  const updated = await admin
    .from("profile_media")
    .update({
      status: valid ? "ready" : "rejected",
      cleanup_after: valid ? row.cleanup_after : new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .eq("status", "uploading")
    .eq("updated_at", row.updated_at)
    .select("id");
  if (updated.error || !updated.data?.length)
    return new Response(null, { status: 409 });
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
