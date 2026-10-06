import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { validUuid, writerApiSession } from "@/lib/writer/api";
import { loadWriterShotlist } from "@/lib/writer/production-server";
import { ShotlistPdfDocument } from "@/lib/shotlist/pdf";
import { SHOTLIST_COLUMNS, type ShotlistColumnKey } from "@/lib/shotlist/ux";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return new Response("Inicia sesión.", { status: 401 });
  const { id } = await params;
  if (!validUuid(id)) return new Response("Solicitud inválida.", { status: 400 });
  let value: unknown;
  try { value = await request.json(); } catch { return new Response("Solicitud inválida.", { status: 400 }); }
  const body = record(value) ? value : {};
  const allowed = new Set(SHOTLIST_COLUMNS.map((column) => column.key));
  const columns = Array.isArray(body.columns)
    ? body.columns.filter((column): column is ShotlistColumnKey => typeof column === "string" && allowed.has(column as ShotlistColumnKey)).slice(0, 18)
    : [];
  const shotIds = Array.isArray(body.shotIds) && body.shotIds.length <= 5_000 && body.shotIds.every(validUuid)
    ? new Set(body.shotIds as string[])
    : null;
  if (!columns.length || (Array.isArray(body.shotIds) && !shotIds)) return new Response("Solicitud inválida.", { status: 400 });
  try {
    const { shotlist } = await loadWriterShotlist(session.supabase, session.user.id, id);
    const exportShotlist = shotIds ? {
      ...shotlist,
      groups: shotlist.groups.flatMap((group) => {
        const shots = group.shots.filter((shot) => shotIds.has(shot.id));
        return shots.length ? [{ ...group, shots }] : [];
      }),
    } : shotlist;
    const document = createElement(ShotlistPdfDocument, { shotlist: exportShotlist, columns, paper: body.paper === "A4" ? "A4" : "A3" }) as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(document);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="shotlist-${id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("No pudimos exportar la Shotlist.", { status: 404 });
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
