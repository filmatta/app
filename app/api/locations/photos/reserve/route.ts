import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readBoundedBody } from "@/lib/security/bounded-body";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";
import { validateLocationPhotoDeclaration } from "@/lib/locations/media";
import { cleanupLocationPhotoRows } from "@/lib/locations/photo-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!portfolioRequestOrigin(request)) return Response.json({ error: "Origen no válido." }, { status: 403 });
  const db = await createClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  let body: { locationId?: string; idempotencyKey?: string; file?: { name?: string; size?: number; type?: string } };
  try {
    body = JSON.parse(await readBoundedBody(request, 4096));
  } catch {
    return Response.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  const file = body.file;
  if (!body.locationId || !body.idempotencyKey || !file || typeof file.name !== "string" || typeof file.size !== "number" || typeof file.type !== "string") {
    return Response.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  const declarationError = validateLocationPhotoDeclaration(file as { name: string; size: number; type: string });
  if (declarationError) return Response.json({ error: declarationError }, { status: 400 });
  const admin = createAdminClient();
  const cleanup = await cleanupLocationPhotoRows(db, admin, body.locationId);
  if (cleanup.error) return Response.json({ error: "No pudimos revisar las subidas pendientes." }, { status: 409 });
  const extension = file.name.split(".").pop()!.toLowerCase();
  const reserved = await db.rpc("reserve_my_location_photo", {
    p_location_id: body.locationId,
    p_size: file.size,
    p_mime: file.type,
    p_extension: extension,
    p_idempotency_key: body.idempotencyKey,
  });
  if (reserved.error || !reserved.data) {
    if (reserved.error?.code === "LPH01") return Response.json({ error: "Esta locación ya ocupa sus 20 espacios de fotografía." }, { status: 409 });
    return Response.json({ error: "No pudimos reservar espacio para esta foto." }, { status: 409 });
  }
  return Response.json(reserved.data, { headers: { "Cache-Control": "no-store" } });
}
