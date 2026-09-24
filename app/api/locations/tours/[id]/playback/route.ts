import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { presentVideo } from "@/lib/mux/playback";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: tour, error } = await admin.from("location_tour_attempts")
    .select("id,location_id,owner_id,status,mux_playback_id,mux_environment_id,mux_environment_type")
    .eq("id", id).maybeSingle();
  if (error || !tour || tour.status !== "ready" || !tour.mux_playback_id) {
    return Response.json({ error: "Recorrido no disponible." }, { status: 404 });
  }
  const { data: location, error: locationError } = await admin.from("locations")
    .select("owner_id,status,active_tour_attempt_id").eq("id", tour.location_id).maybeSingle();
  if (locationError || !location || location.active_tour_attempt_id !== tour.id) {
    return Response.json({ error: "Recorrido no disponible." }, { status: 404 });
  }
  if (location.status !== "published") {
    const db = await createClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user || auth.user.id !== location.owner_id) {
      return Response.json({ error: "Recorrido no disponible." }, { status: 404 });
    }
  }
  try {
    const video = await presentVideo({
      status: "ready",
      playback_policy: "signed",
      mux_playback_id: tour.mux_playback_id,
      mux_environment_id: tour.mux_environment_id,
      mux_environment_type: tour.mux_environment_type,
    });
    if (video.status !== "ready" || !video.playbackId || !video.tokens?.playback) {
      return Response.json({ error: video.message ?? "Playback protegido no disponible." }, { status: 503 });
    }
    return Response.json(video, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return Response.json({ error: "No pudimos autorizar la reproducción." }, { status: 503 });
  }
}
