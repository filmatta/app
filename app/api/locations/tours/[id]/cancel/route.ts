import { createClient } from "@/lib/supabase/server";
import { cancelLocationTourUpload } from "@/lib/locations/mux-tours";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!portfolioRequestOrigin(request)) return Response.json({ error: "Origen no válido." }, { status: 403 });
  const { id } = await params;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return Response.json({ error: "Inicia sesión." }, { status: 401 });
  const { data: row, error } = await db.from("location_tour_attempts").select("*").eq("id", id).maybeSingle();
  if (error || !row) return Response.json({ error: "Recorrido no encontrado." }, { status: 404 });
  if (row.status === "authorizing") {
    const cancelled = await db.rpc("cancel_my_location_tour_reservation", { p_attempt_id: id });
    return cancelled.error ? Response.json({ error: "No pudimos cancelar la reserva." }, { status: 409 }) : Response.json({ cancelled: true });
  }
  if (!["uploading", "processing"].includes(row.status)) return Response.json({ cancelled: true });
  try {
    await cancelLocationTourUpload(row);
    return Response.json({ cancelled: true });
  } catch {
    return Response.json({ error: "La cancelación quedó pendiente de reconciliación." }, { status: 503 });
  }
}
