import { pdf } from "@react-pdf/renderer";
import { createWriterPdfDocument } from "./pdf-renderer";
import type { WriterSnapshot } from "./document";
import type { WriterPdfOptions } from "./pdf";

type WriterPdfWorkerRequest = {
  snapshot: WriterSnapshot;
  options: WriterPdfOptions;
  fontBaseUrl: string;
};

type WriterPdfWorkerResponse =
  | { diagnostic: WriterPdfWorkerDiagnostic }
  | { ok: true; buffer: ArrayBuffer }
  | { ok: false; message: string };

type WriterPdfWorkerDiagnostic =
  | {
      type: "securitypolicyviolation";
      workerUrl: string;
      originalPolicy: string;
      effectiveDirective: string;
      disposition: string;
      sourceFile: string;
      lineNumber: number;
      columnNumber: number;
    }
  | {
      type: "error";
      workerUrl: string;
      name: string;
      message: string;
      stack: string;
    };

type SecurityPolicyViolationLike = Event & {
  originalPolicy?: string;
  effectiveDirective?: string;
  disposition?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WriterPdfWorkerRequest>) => void) | null;
  postMessage: (message: WriterPdfWorkerResponse, transfer?: Transferable[]) => void;
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  location: Location;
};

function sanitizeText(value: string | undefined, limit: number) {
  return (value ?? "").slice(0, limit);
}

function sanitizeUrl(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value, workerScope.location.origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return url.protocol;
    return `${url.origin}${url.pathname}`;
  } catch {
    return "unparseable-url";
  }
}

function sanitizeStack(value: string | undefined) {
  return sanitizeText(value, 3_000).replace(/https?:\/\/[^\s)]+/g, (url) => sanitizeUrl(url));
}

const workerUrl = sanitizeUrl(workerScope.location.href);

workerScope.addEventListener("securitypolicyviolation", (event) => {
  const violation = event as SecurityPolicyViolationLike;
  workerScope.postMessage({
    diagnostic: {
      type: "securitypolicyviolation",
      workerUrl,
      originalPolicy: sanitizeText(violation.originalPolicy, 4_000),
      effectiveDirective: sanitizeText(violation.effectiveDirective, 256),
      disposition: sanitizeText(violation.disposition, 64),
      sourceFile: sanitizeUrl(violation.sourceFile),
      lineNumber: Number.isFinite(violation.lineNumber) ? Number(violation.lineNumber) : 0,
      columnNumber: Number.isFinite(violation.columnNumber) ? Number(violation.columnNumber) : 0,
    },
  });
});

workerScope.onmessage = async (event) => {
  try {
    const { snapshot, options, fontBaseUrl } = event.data;
    const blob = await pdf(createWriterPdfDocument(snapshot, options, fontBaseUrl)).toBlob();
    const buffer = await blob.arrayBuffer();
    workerScope.postMessage({ ok: true, buffer }, [buffer]);
  } catch (error) {
    workerScope.postMessage({
      diagnostic: {
        type: "error",
        workerUrl,
        name: error instanceof Error ? sanitizeText(error.name, 128) : "UnknownError",
        message: error instanceof Error ? sanitizeText(error.message, 1_000) : "No se pudo renderizar el PDF.",
        stack: error instanceof Error ? sanitizeStack(error.stack) : "",
      },
    });
    workerScope.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo renderizar el PDF.",
    });
  }
};

export {};
