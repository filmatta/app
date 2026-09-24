import { createClient } from "@/lib/supabase/server";
import { retryLocationTourCleanup, syncLocationTourUpload } from "@/lib/locations/mux-tours";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  let result = await db.from("location_tour_attempts").select("id,location_id,status,recorded_at,duration_seconds,mux_upload_id")
    .eq("id", id).maybeSingle();
  if (result.error || !result.data) return Response.json({ error: "Recorrido no encontrado." }, { status: 404 });
  if (["uploading", "processing"].includes(result.data.status) && result.data.mux_upload_id) {
    await syncLocationTourUpload(result.data.mux_upload_id).catch(() => undefined);
    result = await db.from("location_tour_attempts").select("id,location_id,status,recorded_at,duration_seconds,mux_upload_id")
      .eq("id", id).maybeSingle();
  }
  await retryLocationTourCleanup(result.data?.location_id ?? "").catch(() => undefined);
  return Response.json({
    id,
    status: result.data?.status ?? "errored",
    recordedAt: result.data?.recorded_at ?? null,
    durationSeconds: result.data?.duration_seconds ?? null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
