import {
  AssistedImportError,
  assistedImportAccountStatus,
  executeAssistedImport,
} from "@/lib/writer/assisted-import-server";
import { isRecord, validUuid, writerApiSession, writerJson } from "@/lib/writer/api";
import type { WriterImportFormat } from "@/lib/writer/import";
import type { WriterDocxParagraph } from "@/lib/writer/docx-import";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// JSON escaping adds envelope bytes on top of the separately enforced 2 MiB source limit.
const MAX_REQUEST_BYTES = 4_300_000;

export async function GET() {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const status = await assistedImportAccountStatus(session.user.id, { appMetadata: session.user.app_metadata });
  return writerJson(status);
}

export async function POST(request: Request) {
  const session = await writerApiSession();
  if (!session) return writerJson({ error: "Inicia sesión.", code: "unauthorized" }, 401);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) return writerJson({ error: "El origen supera el límite de 2 MiB.", code: "too_large" }, 413);
  let value: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) {
      return writerJson({ error: "La solicitud es demasiado grande.", code: "too_large" }, 413);
    }
    value = JSON.parse(raw);
  } catch {
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  if (!isRecord(value) || !validUuid(value.operationId) || typeof value.title !== "string"
    || typeof value.sourceText !== "string" || !isFormat(value.format)
    || (value.fileName !== undefined && typeof value.fileName !== "string")
    || !validSourceParagraphs(value.sourceParagraphs, value.format, value.sourceText)) {
    return writerJson({ error: "Solicitud inválida.", code: "invalid" }, 400);
  }
  try {
    const result = await executeAssistedImport(session.user.id, {
      operationId: value.operationId,
      title: value.title,
      format: value.format,
      sourceText: value.sourceText,
      fileName: value.fileName,
      sourceParagraphs: value.sourceParagraphs as WriterDocxParagraph[] | undefined,
      signal: request.signal,
    }, { appMetadata: session.user.app_metadata });
    return writerJson(result, 201);
  } catch (cause) {
    const error = cause instanceof AssistedImportError
      ? cause
      : new AssistedImportError("server_error", "No se pudo completar la importación asistida.", 500);
    return writerJson({ error: error.message, code: error.code }, error.status);
  }
}

function isFormat(value: unknown): value is WriterImportFormat {
  return value === "pasted" || value === "txt" || value === "fdx" || value === "docx";
}

function validSourceParagraphs(value: unknown, format: WriterImportFormat, sourceText: string) {
  if (value === undefined) return format !== "docx";
  if (format !== "docx" || !Array.isArray(value) || value.length < 1 || value.length > 10_000) return false;
  const valid = value.every((paragraph) => isRecord(paragraph)
    && typeof paragraph.text === "string" && paragraph.text.length <= 100_000
    && (paragraph.style === null || (typeof paragraph.style === "string" && paragraph.style.length <= 160)));
  return valid && value.map((paragraph) => (paragraph as WriterDocxParagraph).text).join("\n") === sourceText;
}
