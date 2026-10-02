import "server-only";

import OpenAI from "openai";
import {
  WRITER_AUTO_FORMAT_MODEL,
  WRITER_AUTO_FORMAT_REASONING,
  classifyWriterAutoFormatCandidatesWithProvider,
  writerAutoFormatAiAvailable as deploymentAllowsWriterAutoFormatAi,
  type WriterAutoFormatProvider,
} from "./auto-format-classifier";
import type { WriterAutoFormatCandidate } from "./smart-format";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["classifications"],
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["blockId", "kind", "characterName"],
        properties: {
          blockId: { type: "string" },
          kind: { type: "string", enum: ["sceneHeading", "action", "character", "dialogue", "parenthetical", "transition", "authorNote"] },
          characterName: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `Clasifica exclusivamente los bloques ambiguos de un guion.
Devuelve una clasificación para cada blockId recibido, una sola vez y en el mismo orden.
No reescribas, corrijas, resumas ni completes el texto. No inventes contenido.
Usa sólo estos tipos: sceneHeading, action, character, dialogue, parenthetical, transition, authorNote.
Usa el contexto cercano sólo para distinguir personajes, diálogo y acción.
characterName es el nombre del personaje sólo cuando el bloque sea character o dialogue; en los demás casos usa null.`;

export function writerAutoFormatAiAvailable() {
  return deploymentAllowsWriterAutoFormatAi(process.env);
}

export function classifyWriterAutoFormatCandidates(
  candidates: readonly WriterAutoFormatCandidate[],
  input: { operationId: string; signal?: AbortSignal },
) {
  return classifyWriterAutoFormatCandidatesWithProvider(candidates, input, openAiProvider);
}

async function openAiProvider(input: Parameters<WriterAutoFormatProvider>[0]): ReturnType<WriterAutoFormatProvider> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 45_000 });
  const started = Date.now();
  const response = await client.responses.create({
    model: WRITER_AUTO_FORMAT_MODEL,
    reasoning: { effort: WRITER_AUTO_FORMAT_REASONING },
    store: false,
    max_output_tokens: input.maxOutputTokens,
    instructions: INSTRUCTIONS,
    input: JSON.stringify({ candidates: input.candidates }),
    text: { format: { type: "json_schema", name: "writer_auto_format_classification", strict: true, schema: OUTPUT_SCHEMA } },
  }, {
    headers: { "Idempotency-Key": `writer-auto-format-${input.operationId}` },
    signal: input.signal,
  });
  if (response.status !== "completed" || !response.output_text) throw new Error("El clasificador no devolvió un resultado utilizable.");
  let result: unknown;
  try { result = JSON.parse(response.output_text); }
  catch { throw new Error("El clasificador devolvió una respuesta inválida."); }
  return { result, usage: readUsage(response.usage), latencyMs: Date.now() - started, requestId: readRequestId(response) };
}

function readRequestId(value: unknown) {
  return isRecord(value) && typeof value._request_id === "string" ? value._request_id : undefined;
}

function readUsage(value: unknown) {
  if (!isRecord(value)) return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const inputDetails = isRecord(value.input_tokens_details) ? value.input_tokens_details : {};
  const outputDetails = isRecord(value.output_tokens_details) ? value.output_tokens_details : {};
  return {
    inputTokens: positiveInteger(value.input_tokens),
    cachedInputTokens: positiveInteger(inputDetails.cached_tokens),
    outputTokens: positiveInteger(value.output_tokens),
    reasoningTokens: positiveInteger(outputDetails.reasoning_tokens),
  };
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
