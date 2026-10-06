import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const tempDirectory = path.join(root, "tmp", "pdfs");
const outputDirectory = path.join(root, "output", "pdf");
const bundlePath = path.join(tempDirectory, "shotlist-pdf-example.mjs");

await mkdir(tempDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  absWorkingDir: root,
  stdin: {
    resolveDir: root,
    sourcefile: "shotlist-pdf-example-entry.tsx",
    loader: "tsx",
    contents: `
      import React from "react";
      import { renderToFile } from "@react-pdf/renderer";
      import { ShotlistPdfDocument } from "./lib/shotlist/pdf";

      const shotlistId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const descriptions = [
        "Mara cruza el umbral con el transmisor pegado al pecho mientras la lluvia rebota contra las ventanas. La cámara conserva el eje y permite leer la reacción completa.",
        "El técnico comprueba niveles, intercambia una mirada con Mara y vuelve al monitor. Mantener detalle suficiente para continuidad de manos y utilería.",
        "La señal cae. Todos quedan inmóviles durante un segundo antes de que la alarma roja recorra la cabina y obligue a cambiar el ritmo de la escena.",
      ];
      const groupTitles = ["INT. RADIO K-17 / CABINA - NOCHE", "EXT. AZOTEA DEL EDIFICIO - NOCHE", "INT. PASILLO DE SERVICIO - AMANECER"];
      const groups = groupTitles.map((title, groupIndex) => {
        const groupId = \`bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb\${groupIndex}\`;
        return {
          id: groupId, shotlistId, sourceSceneId: null, sourceSceneTitle: null, title,
          position: groupIndex, sourceStatus: "manual", revision: 1,
          shots: Array.from({ length: 18 }, (_, shotIndex) => ({
            id: \`\${groupIndex + 1}ccccccc-cccc-4ccc-8ccc-\${String(shotIndex + 1).padStart(12, "0")}\`,
            shotlistId, groupId, sourceBlockId: null, origin: "manual",
            shotType: ["Plano general", "Plano medio", "Primer plano"][shotIndex % 3],
            composition: shotIndex % 2 ? "Dos tercios / aire a mirada" : "Centrada con profundidad",
            subject: ["Mara entra en cuadro", "El técnico revisa la consola", "La alarma cambia a rojo"][shotIndex % 3],
            angle: shotIndex % 4 === 0 ? "Picado" : "A nivel",
            movement: shotIndex % 3 === 0 ? "Travelling lateral" : "Fijo",
            support: shotIndex % 3 === 0 ? "Dolly" : "Trípode",
            lens: ["24 mm", "50 mm", "85 mm"][shotIndex % 3], setup: String.fromCharCode(65 + (shotIndex % 4)),
            durationSeconds: 4 + (shotIndex % 7), status: shotIndex % 4 === 0 ? "ready" : "pending",
            description: descriptions[shotIndex % descriptions.length],
            intention: null,
            notes: shotIndex % 5 === 0 ? "Confirmar reflejos en monitor, continuidad del cable rojo y espacio para el operador. Esta observación debe envolver sin recortarse." : "",
            assetId: null, position: shotIndex, sourceRevision: null, revision: 1,
          })),
        };
      });
      const shotlist = { id: shotlistId, scriptId: null, title: "LA FRECUENCIA - Shotlist Beta UX", sourceRevision: null, revision: 1, groups };
      const columns = ["number", "scene", "location", "interiorExterior", "shotType", "subject", "description", "lens", "movement", "setup", "durationSeconds", "status", "notes"];
      await renderToFile(<ShotlistPdfDocument shotlist={shotlist} columns={columns} paper="A3" />, ${JSON.stringify(path.join(outputDirectory, "filmatta-shotlist-beta-ux-example.pdf"))});
    `,
  },
  outfile: bundlePath,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [{
    name: "server-only-stub",
    setup(plugin) {
      plugin.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
      plugin.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export {};", loader: "js" }));
    },
  }],
});

await import(`${pathToFileURL(bundlePath).href}?${Date.now()}`);
console.log(path.join(outputDirectory, "filmatta-shotlist-beta-ux-example.pdf"));
