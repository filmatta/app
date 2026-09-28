import type { WriterSnapshot } from "./document";
import type { WriterPdfOptions } from "./pdf";

const WRITER_PDF_WORKER_MANIFEST = "/writer-assets/pdf-worker/manifest.json";
const WRITER_PDF_WORKER_ENTRY = /^\/writer-assets\/pdf-worker\/pdf-worker-([a-f0-9]{64})\.js$/u;

type WriterPdfWorkerManifest = {
  schemaVersion: 1;
  path: string;
  sha256: string;
};

export async function generateWriterPdfBlob(
  snapshot: WriterSnapshot,
  options: WriterPdfOptions,
  signal?: AbortSignal,
) {
  if (signal?.aborted) {
    throw new DOMException("La generación fue cancelada.", "AbortError");
  }
  const worker = await createWriterPdfWorker(signal);
  const fontBaseUrl = `${window.location.origin}/fonts/cousine`;
  const fallbackFontBaseUrl = `${window.location.origin}/fonts/noto-sans-math`;
  return new Promise<Blob>((resolve, reject) => {
    const abort = () => {
      worker.terminate();
      reject(new DOMException("La generación fue cancelada.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      reject(new Error("No se pudo iniciar el generador PDF local."));
    };
    worker.onmessage = (event: MessageEvent<
      | { ok: true; buffer: ArrayBuffer }
      | { ok: false; message: string }
    >) => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (event.data.ok) {
        resolve(new Blob([event.data.buffer], { type: "application/pdf" }));
      } else {
        reject(new Error(event.data.message));
      }
    };
    worker.postMessage({ snapshot, options, fontBaseUrl, fallbackFontBaseUrl });
  });
}

async function createWriterPdfWorker(signal?: AbortSignal) {
  const response = await fetch(WRITER_PDF_WORKER_MANIFEST, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error("No se pudo localizar el generador PDF local.");
  }
  const manifest: unknown = await response.json();
  if (!isWriterPdfWorkerManifest(manifest)) {
    throw new Error("La versión del generador PDF local no es válida.");
  }
  const match = WRITER_PDF_WORKER_ENTRY.exec(manifest.path);
  if (!match || match[1] !== manifest.sha256) {
    throw new Error("La identidad del generador PDF local no es válida.");
  }
  const workerUrl = new URL(manifest.path, window.location.origin);
  if (workerUrl.origin !== window.location.origin || workerUrl.pathname !== manifest.path) {
    throw new Error("El generador PDF local debe pertenecer a FILMATTA.");
  }
  return new Worker(workerUrl, { name: "filmatta-writer-pdf", type: "classic" });
}

function isWriterPdfWorkerManifest(value: unknown): value is WriterPdfWorkerManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WriterPdfWorkerManifest>;
  return candidate.schemaVersion === 1 &&
    typeof candidate.path === "string" &&
    typeof candidate.sha256 === "string";
}
