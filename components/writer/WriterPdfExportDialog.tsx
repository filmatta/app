"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { WriterSnapshot } from "@/lib/writer/document";
import {
  captureWriterPdfSnapshot,
  defaultWriterPdfOptions,
  validateWriterPdfInput,
  type WriterPdfOptions,
} from "@/lib/writer/pdf";
import { writerFileStem } from "@/lib/writer/export";

type GenerationState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "generating" }
  | { status: "ready"; url: string; filename: string }
  | { status: "error"; message: string };

export default function WriterPdfExportDialog({
  initialTitle,
  getSnapshot,
  returnFocusRef,
  onClose,
}: {
  initialTitle: string;
  getSnapshot: () => WriterSnapshot;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<WriterPdfOptions>(() => defaultWriterPdfOptions(initialTitle));
  const [generation, setGeneration] = useState<GenerationState>({ status: "idle" });
  const operationRef = useRef(0);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const busy = generation.status === "preparing" || generation.status === "generating";

  useLayoutEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => () => {
    operationRef.current += 1;
    abortRef.current?.abort();
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
  }, []);

  function updateOption<Key extends keyof WriterPdfOptions>(key: Key, value: WriterPdfOptions[Key]) {
    setOptions((current) => ({ ...current, [key]: value }));
    if (generation.status === "ready" || generation.status === "error") {
      releaseReadyUrl();
      setGeneration({ status: "idle" });
    }
  }

  async function generatePdf() {
    if (busyRef.current) return;
    busyRef.current = true;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    releaseReadyUrl();
    setGeneration({ status: "preparing" });
    let abortController: AbortController | null = null;

    try {
      const snapshot = captureWriterPdfSnapshot(getSnapshot(), options.title);
      const exportOptions = { ...options, title: snapshot.title };
      validateWriterPdfInput(snapshot, exportOptions);
      await nextPaint();
      if (operationRef.current !== operation) return;
      setGeneration({ status: "generating" });
      await nextPaint();
      const { generateWriterPdfBlob } = await import("@/lib/writer/pdf-client");
      if (operationRef.current !== operation) return;
      abortController = new AbortController();
      abortRef.current = abortController;
      const blob = await generateWriterPdfBlob(snapshot, exportOptions, abortController.signal);
      if (operationRef.current !== operation) return;
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setGeneration({
        status: "ready",
        url,
        filename: `${writerFileStem(snapshot.title)}.pdf`,
      });
    } catch (error) {
      if (operationRef.current !== operation) return;
      setGeneration({
        status: "error",
        message: error instanceof Error ? error.message : "No se pudo generar el PDF.",
      });
    } finally {
      if (abortRef.current === abortController) abortRef.current = null;
      if (operationRef.current === operation) busyRef.current = false;
    }
  }

  function cancelGeneration() {
    operationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    setGeneration({ status: "idle" });
  }

  function closeDialog() {
    const shouldRestoreFocus = document.activeElement instanceof HTMLElement &&
      panelRef.current?.contains(document.activeElement);
    operationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    releaseReadyUrl();
    onClose();
    if (shouldRestoreFocus) {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        const returnTarget = returnFocusRef.current;
        if (returnTarget?.isConnected &&
          (!(active instanceof HTMLElement) || active === document.body || !active.isConnected)) {
          returnTarget.focus({ preventScroll: true });
        }
      });
    }
  }

  function releaseReadyUrl() {
    if (!blobUrlRef.current) return;
    URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = null;
  }

  return (
    <div className="writer-pdf-panel-shell">
      <section
        ref={panelRef}
        className="writer-modal writer-pdf-modal"
        role="dialog"
        aria-labelledby="writer-pdf-title"
        aria-describedby="writer-pdf-snapshot-note"
      >
        <div className="writer-pdf-heading">
          <div>
            <p className="writer-eyebrow">Salida de lectura</p>
            <h2 id="writer-pdf-title">Generar PDF de guion</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={closeDialog} disabled={busy} aria-label="Cerrar exportación PDF">Cerrar</button>
        </div>

        <div className="writer-pdf-options">
          <label className="writer-pdf-check">
            <input
              type="checkbox"
              checked={options.includeCover}
              onChange={(event) => updateOption("includeCover", event.target.checked)}
              disabled={busy}
            />
            Incluir portada
          </label>

          <label>
            Título
            <input
              value={options.title}
              onChange={(event) => updateOption("title", event.target.value)}
              maxLength={160}
              disabled={busy}
            />
          </label>

          <div className="writer-pdf-row">
            <label>
              Autor / autores <span>opcional</span>
              <input
                value={options.authors}
                onChange={(event) => updateOption("authors", event.target.value)}
                maxLength={240}
                disabled={busy || !options.includeCover}
              />
            </label>
            <label>
              Versión o fecha <span>opcional</span>
              <input
                value={options.version}
                onChange={(event) => updateOption("version", event.target.value)}
                maxLength={160}
                disabled={busy || !options.includeCover}
              />
            </label>
          </div>

          <label>
            Contacto <span>opcional; sólo lo que escribas aquí</span>
            <textarea
              value={options.contact}
              onChange={(event) => updateOption("contact", event.target.value)}
              maxLength={500}
              rows={3}
              disabled={busy || !options.includeCover}
            />
          </label>

          <label>
            Tamaño de papel
            <select
              value={options.paperSize}
              onChange={(event) => updateOption("paperSize", event.target.value as WriterPdfOptions["paperSize"])}
              disabled={busy}
            >
              <option value="LETTER">Carta / US Letter</option>
              <option value="A4">A4</option>
            </select>
          </label>
        </div>

        <div className="writer-pdf-notice">
          <p id="writer-pdf-snapshot-note">El PDF usa una copia del guion tal como esté al pulsar Generar. Puedes seguir escribiendo después; esa exportación no se recalcula.</p>
          <p>Las notas del autor se excluyen del PDF y del FDX. Permanecen completas en el respaldo JSON.</p>
          <p>Los datos de portada sólo viven en este panel durante la sesión; FILMATTA no toma información de tu cuenta o perfil.</p>
        </div>

        <div className="writer-pdf-status" role="status" aria-live="polite">
          {generation.status === "preparing" && "Preparando documento…"}
          {generation.status === "generating" && "Generando PDF…"}
          {generation.status === "ready" && "PDF listo. Corresponde al snapshot capturado al iniciar esta generación."}
          {generation.status === "error" && generation.message}
        </div>

        <div className="writer-pdf-actions">
          {busy ? (
            <button type="button" onClick={cancelGeneration}>Cancelar generación</button>
          ) : (
            <button className="writer-primary-button" type="button" onClick={generatePdf}>Generar PDF</button>
          )}
          {generation.status === "ready" && (
            <a className="writer-primary-button" href={generation.url} download={generation.filename}>Descargar PDF</a>
          )}
        </div>
      </section>
    </div>
  );
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
