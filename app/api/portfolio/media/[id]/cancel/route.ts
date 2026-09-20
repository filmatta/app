import { createClient } from "@/lib/supabase/server";
import { cancelPortfolioUpload } from "@/lib/profiles/mux-media";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!portfolioRequestOrigin(request)) return new Response(null, { status: 403 });
  const db = await createClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return new Response(null, { status: 401 });
  const { id } = await params;
  const { data: row } = await db.from("profile_media").select("*").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!row) return new Response(null, { status: 404 });
  if (row.source !== "mux" || !row.mux_upload_id)
    return Response.json({ error: "La imagen recibida se conserva. Puedes terminar su verificación o archivarla desde el editor." }, { status: 409 });
  try {
    const state = await cancelPortfolioUpload(row);
    return Response.json({ state }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "No pudimos confirmar la cancelación. El intento se conserva para comprobar su estado." }, { status: 503 });
  }
}
