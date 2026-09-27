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
  | { ok: true; buffer: ArrayBuffer }
  | { ok: false; message: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WriterPdfWorkerRequest>) => void) | null;
  postMessage: (message: WriterPdfWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = async (event) => {
  try {
    const { snapshot, options, fontBaseUrl } = event.data;
    const blob = await pdf(createWriterPdfDocument(snapshot, options, fontBaseUrl)).toBlob();
    const buffer = await blob.arrayBuffer();
    workerScope.postMessage({ ok: true, buffer }, [buffer]);
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : "No se pudo renderizar el PDF.",
    });
  }
};

export {};
