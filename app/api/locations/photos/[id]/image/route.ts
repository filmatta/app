import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LOCATION_PHOTO_BUCKET, LOCATION_PHOTO_SIGNED_URL_SECONDS } from "@/lib/locations/media";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const photoResult = await admin.from("location_photos")
    .select("id,location_id,owner_id,image_url,storage_path,status,lifecycle_status")
    .eq("id", id).maybeSingle();
  const photo = photoResult.data;
  if (!photo || photo.lifecycle_status !== "ready" || photo.status === "archived") return new Response(null, { status: 404 });
  const locationResult = await admin.from("locations").select("status,owner_id").eq("id", photo.location_id).maybeSingle();
  const location = locationResult.data;
  if (!location) return new Response(null, { status: 404 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  const viewerId = auth.user?.id;
  const owner = Boolean(viewerId && viewerId === photo.owner_id && viewerId === location.owner_id);
  const published = location.status === "published" && photo.status === "published";
  if (!owner && !published) return new Response(null, { status: 404 });
  let target = photo.image_url;
  if (photo.storage_path) {
    const signed = await admin.storage.from(LOCATION_PHOTO_BUCKET)
      .createSignedUrl(photo.storage_path, LOCATION_PHOTO_SIGNED_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) return new Response(null, { status: 404 });
    target = signed.data.signedUrl;
  }
  if (!target) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 307,
    headers: { Location: target, "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" },
  });
}
