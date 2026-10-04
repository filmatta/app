import { isRecord, readWriterJson, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import {
  executeWriterProviderDiagnostic,
  isWriterProviderDiagnosticKind,
  WriterProviderDiagnosticError,
} from "@/lib/writer/provider-connectivity-diagnostic-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const { id } = await context.params;
  const body = await readWriterJson(request);
  if (!validUuid(id) || !body.ok || !isRecord(body.value) || !isWriterProviderDiagnosticKind(body.value.kind)) {
    return body.ok ? writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400) : body.response;
  }
  try {
    return writerJson(await executeWriterProviderDiagnostic(session.user.id, id, body.value.kind, {
      readDb: session.supabase,
    }));
  } catch (cause) {
    if (cause instanceof WriterProviderDiagnosticError) {
      return writerJson({ error: cause.message, code: cause.code }, cause.status);
    }
    return writerJson({ error: "No pudimos completar el diagnóstico.", code: "server_error" }, 500);
  }
}
