import { validUuid, writerApiSession } from "@/lib/writer/api";
import { writerShotlistCsv } from "@/lib/writer/production";
import { loadWriterShotlist } from "@/lib/writer/production-server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return new Response("Inicia sesión.", { status: 401 });
  const { id } = await params;
  if (!validUuid(id)) return new Response("Solicitud inválida.", { status: 400 });
  try {
    const { shotlist } = await loadWriterShotlist(session.supabase, session.user.id, id);
    return new Response(writerShotlistCsv(shotlist), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="shotlist-${id.slice(0, 8)}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Shotlist no encontrada.", { status: 404 });
  }
}
