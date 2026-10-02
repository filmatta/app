import { blockText, type WriterDocument } from "./document.ts";
import type { WriterSearchResult, WriterSearchScope } from "./search.ts";

export const WRITER_IDEA_CATEGORIES = [
  "Conflicto",
  "Giro",
  "Personaje",
  "Subtexto",
  "Visual",
  "Obstáculo",
  "Revelación",
] as const;

export type WriterIdeaCategory = (typeof WRITER_IDEA_CATEGORIES)[number];

export type WriterIdea = {
  id: string;
  title: string;
  direction: string;
  consequence: string;
  category: WriterIdeaCategory;
  references: WriterSearchResult[];
};

export type WriterIdeasRequest = {
  scope: WriterSearchScope;
  sceneId: string | null;
  question: string;
  category: WriterIdeaCategory | null;
};

/**
 * Deterministic QA contract. It deliberately proposes conceptual directions only:
 * no dialogue, screenplay blocks or prose ready to paste into the document.
 */
export function createMockWriterIdeas(document: WriterDocument, request: WriterIdeasRequest): WriterIdea[] {
  const references = writerIdeaReferences(document, request.scope, request.sceneId);
  const focus = request.question.trim() || "la decisión central";
  const preferred = request.category;
  const templates: Array<Omit<WriterIdea, "id" | "references">> = [
    {
      title: "Elevar el costo de la decisión",
      category: "Conflicto",
      direction: `Haz que explorar “${focus.slice(0, 90)}” obligue al personaje a elegir entre dos valores incompatibles.`,
      consequence: "La escena gana tensión por la elección, no por añadir diálogo explicativo.",
    },
    {
      title: "Cambiar quién controla la información",
      category: "Giro",
      direction: "Desplaza una pieza de información útil hacia quien tiene más que perder si la revela.",
      consequence: "La revelación pasa a ser una decisión moral y altera el poder de la escena.",
    },
    {
      title: "Hacer visible el subtexto",
      category: "Subtexto",
      direction: "Introduce una acción concreta que contradiga lo que el personaje afirma querer.",
      consequence: "El conflicto interno se vuelve legible sin explicarlo ni escribir nuevas líneas por el usuario.",
    },
    {
      title: "Convertir el entorno en obstáculo",
      category: "Visual",
      direction: "Usa una regla, objeto o limitación ya presente en la escena para impedir la salida más obvia.",
      consequence: "La resolución depende de la puesta en escena y no sólo de información verbal.",
    },
    {
      title: "Reformular la expectativa",
      category: "Revelación",
      direction: "Haz que una consecuencia aparente confirme la expectativa inmediata, pero cambie lo que significa para el personaje.",
      consequence: "La escena puede cerrar una pregunta y abrir otra sin generar material de guion automáticamente.",
    },
  ];
  const ordered = preferred
    ? [...templates.filter((idea) => idea.category === preferred), ...templates.filter((idea) => idea.category !== preferred)]
    : templates;
  return ordered.slice(0, 5).map((idea, index) => ({
    ...idea,
    id: `idea-${index + 1}`,
    references: index < 2 ? references.slice(0, 1) : [],
  }));
}

export function isWriterIdeaCategory(value: unknown): value is WriterIdeaCategory {
  return typeof value === "string" && (WRITER_IDEA_CATEGORIES as readonly string[]).includes(value);
}

function writerIdeaReferences(document: WriterDocument, scope: WriterSearchScope, targetSceneId: string | null) {
  let sceneId: string | null = null;
  let sceneNumber = 0;
  let sceneHeading = "Antes de la primera escena";
  const references: WriterSearchResult[] = [];
  for (const block of document.content) {
    const text = blockText(block).trim();
    if (block.attrs.kind === "sceneHeading") {
      sceneId = block.attrs.id;
      sceneNumber += 1;
      sceneHeading = text || "Escena sin encabezado";
    }
    if (!text || (scope === "scene" && sceneId !== targetSceneId)) continue;
    if (block.attrs.kind !== "action" && block.attrs.kind !== "dialogue") continue;
    references.push({
      id: `idea-ref:${block.attrs.id}`,
      sceneId,
      sceneNumber: sceneId ? sceneNumber : null,
      sceneHeading,
      blockId: block.attrs.id,
      blockKind: block.attrs.kind,
      start: 0,
      end: Math.min(text.length, 1),
      text,
      snippet: text.slice(0, 220),
      reason: "Referencia de contexto",
    });
    if (references.length >= 3) break;
  }
  return references;
}
