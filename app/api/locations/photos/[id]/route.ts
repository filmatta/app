import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";
import { deleteLocationPhotoObject } from "@/lib/locations/photo-storage";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!portfolioRequestOrigin(request)) return new Response(null, { status: 403 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401 });
  const { id } = await params;
  const begun = await db.rpc("begin_my_location_photo_delete", { p_id: id });
  if (begun.error || !begun.data) return Response.json({ error: "No pudimos retirar la foto." }, { status: 409 });
  const value = begun.data as { id: string; path: string | null };
  const removed = await deleteLocationPhotoObject(createAdminClient(), value.id, value.path);
  if (!removed) return Response.json({ error: "La foto se retiró de la galería, pero el archivo sigue pendiente de eliminación. Puedes reintentar." }, { status: 503 });
  return Response.json({ deleted: true });
}
