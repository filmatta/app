import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { renderToFile } from "@react-pdf/renderer";
import { createWriterBackup, createBasicFdx } from "../lib/writer/export.ts";
import { createWriterPdfDocument } from "../lib/writer/pdf-renderer.ts";
import { defaultWriterPdfOptions, layoutWriterPdf } from "../lib/writer/pdf.ts";
import { longWriterOutputFixture, shortWriterOutputFixture } from "../tests/writer/fixtures.ts";

const target = process.argv[2] ?? "short";
const outputDir = path.resolve(process.argv[3] ?? "output/pdf");
fs.mkdirSync(outputDir, { recursive: true });

const fixture = target === "long" ? longWriterOutputFixture() : shortWriterOutputFixture();
const options = {
  ...defaultWriterPdfOptions(fixture.title),
  includeCover: target === "long",
  authors: target === "long" ? "Autora sintética de QA" : "",
  version: target === "long" ? "Versión de revisión · 25 septiembre 2026" : "",
  contact: target === "long" ? "Contacto escrito expresamente para esta muestra\nqa@example.invalid" : "",
  paperSize: target === "long" ? "A4" as const : "LETTER" as const,
};
const layout = layoutWriterPdf(fixture, options);
const stem = target === "long" ? "filmatta-writer-muestra-larga" : "filmatta-writer-muestra-corta";
const pdfPath = path.join(outputDir, `${stem}.pdf`);
const started = performance.now();
await renderToFile(
  createWriterPdfDocument(
    fixture,
    options,
    path.resolve("public/fonts/cousine").replaceAll("\\", "/"),
  ),
  pdfPath,
);
const durationMs = Math.round(performance.now() - started);
fs.writeFileSync(path.join(outputDir, `${stem}.fdx`), createBasicFdx(fixture), "utf8");
fs.writeFileSync(path.join(outputDir, `${stem}.json`), createWriterBackup(fixture), "utf8");
console.log(JSON.stringify({
  target,
  pdfPath,
  sourceWords: fixture.document.content
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "text")
    .flatMap((item) => item.text.trim().split(/\s+/u).filter(Boolean)).length,
  bodyPages: layout.pages.length,
  totalPages: layout.pages.length + (options.includeCover ? 1 : 0),
  generatedMarkers: layout.generatedMarkers,
  excludedAuthorNotes: layout.excludedAuthorNotes,
  durationMs,
}, null, 2));
