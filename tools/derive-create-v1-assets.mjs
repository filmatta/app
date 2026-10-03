import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const sourceDir = path.resolve("docs/create-v1/source");
const publicDir = path.resolve("public/create-v1");
const derivedDir = path.resolve("docs/create-v1/derived");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(derivedDir, { recursive: true });

const assets = [
  {
    source: "writer-source.png",
    output: "writer-product.webp",
    extract: { left: 0, top: 0, width: 1600, height: 760 },
    resize: { width: 1440 },
  },
  {
    source: "writer-source.png",
    output: "writer-detail.webp",
    extract: { left: 210, top: 65, width: 1040, height: 650 },
    resize: { width: 1040 },
  },
  {
    source: "writer-source.png",
    output: "writer-review.webp",
    extract: { left: 1180, top: 55, width: 420, height: 700 },
    resize: { width: 420 },
  },
  {
    source: "shotlist-source.png",
    output: "shotlist-product.webp",
    extract: { left: 0, top: 0, width: 1600, height: 1000 },
    resize: { width: 1440 },
  },
  {
    source: "shotlist-source.png",
    output: "shotlist-grid.webp",
    extract: { left: 220, top: 100, width: 1040, height: 560 },
    resize: { width: 1040 },
  },
  {
    source: "shotlist-source.png",
    output: "shotlist-inspector.webp",
    extract: { left: 1210, top: 70, width: 390, height: 900 },
    resize: { width: 390 },
  },
];

for (const asset of assets) {
  const buffer = await sharp(path.join(sourceDir, asset.source))
    .extract(asset.extract)
    .resize(asset.resize)
    .webp({ quality: 84, effort: 5 })
    .toBuffer();

  for (const directory of [publicDir, derivedDir]) {
    fs.writeFileSync(path.join(directory, asset.output), buffer);
  }
}
