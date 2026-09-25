import { createBlock, type WriterBlock, type WriterInlineNode, type WriterSnapshot } from "../../lib/writer/document.ts";

function idFor(index: number) {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
}

function block(
  index: number,
  kind: WriterBlock["attrs"]["kind"],
  content: WriterInlineNode[],
) {
  const value = createBlock(kind, "", idFor(index));
  value.content = content;
  return value;
}

function text(value: string): WriterInlineNode {
  return { type: "text", text: value };
}

export function shortWriterOutputFixture(): WriterSnapshot {
  const action = Array.from({ length: 32 }, (_, index) =>
    `La cámara avanza ${index + 1} y conserva cada detalle.`).join(" ");
  const dialogue = Array.from({ length: 92 }, (_, index) =>
    `palabra${index + 1}`).join(" ");
  return {
    title: "La señal — Prueba ñáéíóúü",
    schemaVersion: 1,
    document: {
      type: "doc",
      content: [
        block(1, "sceneHeading", [text("INT. CAFÉ & BAR — DÍA")]),
        block(2, "action", [
          { type: "text", text: "¿Lista? " },
          { type: "text", text: "La luz roja", marks: [{ type: "bold" }] },
          { type: "text", text: " parpadea; alguien dice “acción”." },
          { type: "hardBreak" },
          { type: "text", text: action, marks: [{ type: "italic" }] },
        ]),
        block(3, "character", [text("ANA")]),
        block(4, "parenthetical", [text("(sin perder la calma)")]),
        block(5, "dialogue", [text(dialogue)]),
        block(6, "transition", [{ type: "text", text: "CORTE A:", marks: [{ type: "underline" }] }]),
        block(7, "authorNote", [text("Nota privada: no debe aparecer en PDF ni FDX 🎬")]),
      ],
    },
  };
}

export function longWriterOutputFixture(): WriterSnapshot {
  const content: WriterBlock[] = [];
  let id = 100;
  let words = 0;
  let scene = 1;
  while (words < 20_000) {
    content.push(block(id++, "sceneHeading", [text(`EXT. LOCACIÓN ${scene} — NOCHE`)]));
    const actionWords = Array.from({ length: 170 }, (_, index) => `acción${scene}_${index + 1}`);
    words += actionWords.length;
    content.push(block(id++, "action", [text(actionWords.join(" "))]));
    content.push(block(id++, "character", [text(scene % 2 ? "ANA" : "MATEO") ]));
    content.push(block(id++, "parenthetical", [text(scene % 2 ? "(en voz baja)" : "(con urgencia)")]));
    const dialogueWords = Array.from({ length: 130 }, (_, index) => `diálogo${scene}_${index + 1}`);
    words += dialogueWords.length;
    content.push(block(id++, "dialogue", [text(dialogueWords.join(" "))]));
    if (scene % 9 === 0) content.push(block(id++, "authorNote", [text(`Nota privada ${scene} 🎬`)]));
    scene += 1;
  }
  return {
    title: "Fixture largo de integridad — 20.000 palabras",
    schemaVersion: 1,
    document: { type: "doc", content },
  };
}
