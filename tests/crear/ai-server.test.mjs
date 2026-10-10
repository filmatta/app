import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";

const session = { id: "11111111-1111-4111-8111-111111111111", title: "Prueba", premise: null };
const message = { id: "22222222-2222-4222-8222-222222222222", role: "user", content: "Un barco encuentra una isla.", parentMessageId: null };

test("Crear sends a private Responses request and parses structured blocks", async () => {
  let request;
  class OpenAIMock {
    responses = {
      create: async (body) => {
        request = body;
        return {
          status: "completed",
          output_text: JSON.stringify({
            blocks: ["¿Quién conoce la isla?", "Podría haber una decisión difícil para la tripulación."],
            suggestions: [{ type: "world", title: "La isla", content: "La isla sólo aparece al amanecer." }],
          }),
          usage: { input_tokens: 20, output_tokens: 32 },
        };
      },
    };
  }
  const { generateCrearReply } = load("lib/crear/ai-server.ts", {
    openai: OpenAIMock,
    "@/lib/writer/provider-diagnostics": { classifyWriterProviderFailure: () => ({}) },
    "./server": { isCrearItemType: (value) => ["premise", "character", "world", "theme", "pending"].includes(value) },
  }, { OPENAI_API_KEY: "test-only-key" });

  const result = await generateCrearReply({ userId: "test", operationId: message.id, session, messages: [message], items: [] });
  assert.equal(request.model, "gpt-5.6-terra");
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(result.blocks.length, 2);
  assert.equal(result.suggestions[0].type, "world");
  assert.equal(result.usage.inputTokens, 20);
});
