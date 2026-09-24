import { createClient } from "@/lib/supabase/server";
import { readBoundedBody } from "@/lib/security/bounded-body";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";

export async function PATCH(request: Request) {
  if (!portfolioRequestOrigin(request)) return new Response(null, { status: 403 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401 });
  let body: { id?: string; action?: string };
  try { body = JSON.parse(await readBoundedBody(request, 1024)); }
  catch { return Response.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (!body.id || !["cover", "up", "down"].includes(body.action ?? "")) {
    return Response.json({ error: "Acción no válida." }, { status: 400 });
  }
  const result = await db.rpc("manage_my_location_photo", { p_id: body.id, p_action: body.action });
  if (result.error) return Response.json({ error: "No pudimos actualizar la galería." }, { status: 409 });
  return Response.json({ ok: true });
}
