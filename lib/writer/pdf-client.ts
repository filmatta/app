import type { WriterSnapshot } from "./document";
import type { WriterPdfOptions } from "./pdf";

export async function generateWriterPdfBlob(
  snapshot: WriterSnapshot,
  options: WriterPdfOptions,
  signal?: AbortSignal,
) {
  if (signal?.aborted) {
    throw new DOMException("La generación fue cancelada.", "AbortError");
  }
  const worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
  const fontBaseUrl = `${window.location.origin}/fonts/cousine`;
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
    worker.postMessage({ snapshot, options, fontBaseUrl });
  });
}
