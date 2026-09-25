"use client";

import Link from "next/link";

export default function WriterCompatibilityError({ title, rawDocument }: { title: string; rawDocument: unknown }) {
  function downloadOriginal() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({
      format: "filmatta-writer-unreadable-backup",
      title,
      document: rawDocument,
    }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "guion-respaldo-original.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return (
    <main className="writer-compatibility-error">
      <p className="writer-eyebrow">Guardado automático detenido</p>
      <h1>No podemos abrir esta versión del documento.</h1>
      <p>El contenido original no fue modificado. Descárgalo antes de continuar.</p>
      <div>
        <button className="writer-primary-button" type="button" onClick={downloadOriginal}>Descargar original</button>
        <Link href="/writer">Volver a Mis guiones</Link>
      </div>
    </main>
  );
}
