import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const GENERATED_ENTRY = /^pdf-worker-[a-f0-9]{64}\.js$/u;

export async function buildWriterPdfWorker(options = {}) {
  const projectRoot = options.projectRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDirectory = options.outputDirectory ?? path.join(
    projectRoot,
    "public",
    "writer-assets",
    "pdf-worker",
  );
  const result = await build({
    absWorkingDir: projectRoot,
    entryPoints: ["lib/writer/pdf.worker.ts"],
    bundle: true,
    charset: "utf8",
    define: { "process.env.NODE_ENV": '"production"' },
    format: "iife",
    legalComments: "eof",
    minify: true,
    platform: "browser",
    target: ["es2022"],
    treeShaking: true,
    write: false,
  });
  if (result.outputFiles.length !== 1) {
    throw new Error(`Expected one Writer PDF worker output, received ${result.outputFiles.length}.`);
  }

  const contents = result.outputFiles[0].contents;
  const sha256 = createHash("sha256").update(contents).digest("hex");
  const filename = `pdf-worker-${sha256}.js`;
  const publicPath = `/writer-assets/pdf-worker/${filename}`;
  const manifest = `${JSON.stringify({
    schemaVersion: 1,
    path: publicPath,
    sha256,
    bytes: contents.byteLength,
  }, null, 2)}\n`;

  await mkdir(outputDirectory, { recursive: true });
  for (const existingName of await readdir(outputDirectory)) {
    if (GENERATED_ENTRY.test(existingName) && existingName !== filename) {
      await unlink(path.join(outputDirectory, existingName));
    }
  }
  const outputPath = path.join(outputDirectory, filename);
  const existing = await readFile(outputPath).catch(() => null);
  if (!existing || !existing.equals(contents)) {
    await writeFile(outputPath, contents);
  }
  await writeFile(path.join(outputDirectory, "manifest.json"), manifest, "utf8");

  return { bytes: contents.byteLength, filename, outputPath, publicPath, sha256 };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const built = await buildWriterPdfWorker();
  console.log(`Writer PDF worker ${built.filename} (${built.bytes} bytes)`);
}
