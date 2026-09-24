import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createValidatedMuxContext } from "@/lib/mux/server";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";
import { readBoundedBody } from "@/lib/security/bounded-body";
import {
  cancelLocationTourUpload,
  locationTourPassthrough,
  parseLocationTourPassthrough,
  retryLocationTourCleanup,
} from "@/lib/locations/mux-tours";
import { LOCATION_TOUR_MAX_BLOB_BYTES } from "@/lib/locations/tour-limits";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = portfolioRequestOrigin(request);
  if (!origin) return Response.json({ error: "Origen no válido." }, { status: 403 });
  const db = await createClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  let body: { locationId?: unknown; size?: unknown; type?: unknown };
  try { body = JSON.parse(await readBoundedBody(request, 4096)); }
  catch { return Response.json({ error: "Solicitud no válida." }, { status: 400 }); }
  if (
    typeof body.locationId !== "string" || typeof body.size !== "number" ||
    !Number.isSafeInteger(body.size) || body.size < 1 || body.size > LOCATION_TOUR_MAX_BLOB_BYTES ||
    typeof body.type !== "string" || !/^video\/(webm|mp4)(;|$)/i.test(body.type)
  ) return Response.json({ error: "La grabación no cumple los límites de esta prueba." }, { status: 400 });

  const reserved = await db.rpc("reserve_my_location_tour", {
    p_location_id: body.locationId,
    p_blob_bytes: body.size,
    p_mime_type: body.type,
  });
  const reservation = Array.isArray(reserved.data) ? reserved.data[0] : null;
  if (reserved.error || !reservation?.attempt_id) {
    return Response.json({ error: "No pudimos reservar la subida para esta locación." }, { status: reserved.error?.code === "42501" ? 403 : 400 });
  }
  const attemptId = String(reservation.attempt_id);
  const { data: attempt, error: attemptError } = await db.from("location_tour_attempts")
    .select("id,location_id,owner_id,generation,status,mux_upload_id,mux_asset_id,mux_playback_id,mux_environment_id,mux_environment_type")
    .eq("id", attemptId).single();
  if (attemptError || !attempt) return Response.json({ error: "No pudimos comprobar la reserva." }, { status: 503 });

  try {
    await retryLocationTourCleanup(body.locationId);
    const context = await createValidatedMuxContext();
    if (!reservation.can_create_upload) {
      if (attempt.mux_upload_id && attempt.mux_environment_id === context.environment.id && attempt.mux_environment_type === context.environment.type) {
        const upload = await context.mux.video.uploads.retrieve(attempt.mux_upload_id);
        const association = parseLocationTourPassthrough(upload.new_asset_settings?.passthrough);
        if (association?.attemptId === attempt.id && upload.status === "waiting" && upload.url?.startsWith("https://")) {
          return Response.json({ id: attempt.id, uploadUrl: upload.url }, { headers: { "Cache-Control": "no-store" } });
        }
      }
      return Response.json({ id: attempt.id, status: attempt.status, error: "Ya existe una subida en curso para esta locación." }, { status: 409 });
    }

    const passthrough = locationTourPassthrough(attempt.location_id, attempt.id, attempt.generation);
    const upload = await context.mux.video.uploads.create({
      cors_origin: origin,
      timeout: 3600,
      new_asset_settings: {
        playback_policies: ["signed"],
        video_quality: "basic",
        passthrough,
        meta: { external_id: attempt.id, creator_id: auth.user.id, title: "Recorrido de locación" },
        test: context.environment.type !== "production",
      },
    });
    const bound = await db.rpc("bind_my_location_tour_upload", {
      p_attempt_id: attempt.id,
      p_upload_id: upload.id,
      p_environment_id: context.environment.id,
      p_environment_type: context.environment.type,
    });
    if (bound.error || bound.data !== true || !upload.url?.startsWith("https://")) {
      const associated = await createAdminClient().from("location_tour_attempts").update({
        status: "uploading", mux_upload_id: upload.id,
        mux_environment_id: context.environment.id, mux_environment_type: context.environment.type,
        terminal_reason: "binding-recovery",
      }).eq("id", attempt.id).eq("generation", attempt.generation).eq("status", "authorizing");
      if (!associated.error) await cancelLocationTourUpload({ ...attempt, status: "uploading", mux_upload_id: upload.id, mux_environment_id: context.environment.id, mux_environment_type: context.environment.type });
      else await context.mux.video.uploads.cancel(upload.id).catch(() => undefined);
      return Response.json({ error: "No pudimos asociar una subida segura. Inténtalo de nuevo." }, { status: 503 });
    }
    return Response.json({ id: attempt.id, uploadUrl: upload.url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    try { await db.rpc("fail_my_location_tour_reservation", { p_attempt_id: attempt.id }); } catch { /* best-effort terminal mark */ }
    return Response.json({ error: "El servicio de video no está disponible. Tu grabación sigue en esta página para reintentar." }, { status: 503 });
  }
}
