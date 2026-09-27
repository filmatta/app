import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildWriterPdfWorker } from "../../tools/build-writer-pdf-worker.mjs";

test("builds a deterministic, content-addressed PDF-only worker entry", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "filmatta-writer-pdf-"));
  try {
    const outputDirectory = path.join(temporaryRoot, "writer-assets", "pdf-worker");
    const first = await buildWriterPdfWorker({ projectRoot: process.cwd(), outputDirectory });
    const firstSource = await readFile(first.outputPath, "utf8");
    const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
    const second = await buildWriterPdfWorker({ projectRoot: process.cwd(), outputDirectory });

    assert.equal(second.sha256, first.sha256);
    assert.equal(second.filename, first.filename);
    assert.match(first.filename, /^pdf-worker-[a-f0-9]{64}\.js$/u);
    assert.deepEqual(manifest, {
      schemaVersion: 1,
      path: first.publicPath,
      sha256: first.sha256,
      bytes: first.bytes,
    });
    assert.match(firstSource, /No se pudo renderizar el PDF\./u);
    assert.doesNotMatch(firstSource, /turbopack-worker|#params|searchParams|new\s+Function|eval\s*\(/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("production client accepts only the generated PDF worker identity", async () => {
  const source = await readFile("lib/writer/pdf-client.ts", "utf8");
  assert.match(source, /\/writer-assets\/pdf-worker\/manifest\.json/u);
  assert.match(source, /pdf-worker-\(\[a-f0-9\]\{64\}\)\\\.js/u);
  assert.match(source, /new Worker\(workerUrl/u);
  assert.doesNotMatch(source, /new URL\("\.\/pdf\.worker\.ts"/u);
  assert.doesNotMatch(source, /turbopack-worker|#params|searchParams/u);
});
