import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import { deriveWriterSceneSources } from "../../lib/writer/script-assistant.ts";
import {
  WRITER_SETUP_PAYOFF_MODEL,
  WRITER_SETUP_PAYOFF_VERSION,
  validateWriterSetupPayoffOutput,
  writerSetupPayoffOutputSchema,
  writerSetupPayoffProviderInput,
  writerSetupPayoffSourceHash,
} from "../../lib/writer/setup-payoff.ts";

const ids = Array.from({ length: 18 }, (_, index) => `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`);

function fixture(): WriterDocument {
  return { type: "doc", content: [
    createBlock("sceneHeading", "INT. CASA - DÍA", ids[0]),
    createBlock("action", "Marta esconde una llave bajo el piano.", ids[1]),
    createBlock("sceneHeading", "EXT. PATIO - NOCHE", ids[2]),
    createBlock("dialogue", "Luis dice que jamás dispararía un arma.", ids[3]),
    createBlock("sceneHeading", "INT. VESTÍBULO - DÍA", ids[4]),
    createBlock("action", "El ascensor sólo funciona con una tarjeta.", ids[5]),
    createBlock("sceneHeading", "INT. SALA - NOCHE", ids[6]),
    createBlock("action", "Andrés encuentra la llave y abre el cajón.", ids[7]),
    createBlock("sceneHeading", "EXT. PUENTE - NOCHE", ids[8]),
    createBlock("action", "Luis dispara para cortar la cadena.", ids[9]),
    createBlock("sceneHeading", "INT. ARCHIVO - DÍA", ids[10]),
    createBlock("action", "Marta accede al archivo con la tarjeta.", ids[11]),
  ] };
}

function payload() {
  return {
    elements: [
      { candidateId: "setup-key", sceneId: ids[0], blockId: ids[1], type: "setup", category: "objeto", label: "Llave bajo el piano", excerpt: "Marta esconde una llave bajo el piano.", explanation: "La llave recibe atención explícita.", confidence: "high", disposition: "suggested" },
      { candidateId: "payoff-key", sceneId: ids[6], blockId: ids[7], type: "payoff", category: "uso", label: "Andrés encuentra la llave", excerpt: "Andrés encuentra la llave y abre el cajón.", explanation: "La llave introducida antes se utiliza.", confidence: "high", disposition: "suggested" },
      { candidateId: "setup-behavior", sceneId: ids[2], blockId: ids[3], type: "setup", category: "comportamiento", label: "Luis jamás dispararía", excerpt: "Luis dice que jamás dispararía un arma.", explanation: "La negativa establece una expectativa de comportamiento.", confidence: "medium", disposition: "suggested" },
      { candidateId: "payoff-behavior", sceneId: ids[8], blockId: ids[9], type: "payoff", category: "contradicción", label: "Luis dispara", excerpt: "Luis dispara para cortar la cadena.", explanation: "La acción contradice deliberadamente la expectativa.", confidence: "medium", disposition: "suggested" },
      { candidateId: "setup-card", sceneId: ids[4], blockId: ids[5], type: "setup", category: "regla del mundo", label: "Tarjeta del ascensor", excerpt: "El ascensor sólo funciona con una tarjeta.", explanation: "Se establece una condición de acceso.", confidence: "high", disposition: "suggested" },
      { candidateId: "payoff-card", sceneId: ids[10], blockId: ids[11], type: "payoff", category: "uso", label: "Acceso con tarjeta", excerpt: "Marta accede al archivo con la tarjeta.", explanation: "La regla permite una acción posterior.", confidence: "high", disposition: "suggested" },
    ],
    links: [
      { setupCandidateId: "setup-key", payoffCandidateId: "payoff-key", explanation: "La misma llave reaparece y se utiliza.", confidence: "high" },
      { setupCandidateId: "setup-behavior", payoffCandidateId: "payoff-behavior", explanation: "La conducta posterior transforma la promesa previa.", confidence: "medium" },
      { setupCandidateId: "setup-card", payoffCandidateId: "payoff-card", explanation: "La regla establecida habilita el acceso posterior.", confidence: "high" },
    ],
  };
}

test("Setup / Payoff validates object, world rule and behavior candidates without reducing them to props", () => {
  const result = validateWriterSetupPayoffOutput(payload(), deriveWriterSceneSources(fixture()));
  assert.equal(result.elements.length, 6);
  assert.deepEqual(new Set(result.elements.map((element) => element.category)), new Set(["objeto", "uso", "comportamiento", "contradicción", "regla del mundo"]));
  assert.equal(result.links.length, 3);
});

test("unresolved setup and orphan payoff are distinct, while invalid opposite dispositions fail", () => {
  const scenes = deriveWriterSceneSources(fixture());
  const value = payload();
  value.elements[0].disposition = "unresolved";
  value.elements[1].disposition = "orphan";
  assert.deepEqual(validateWriterSetupPayoffOutput(value, scenes).elements.slice(0, 2).map((item) => item.disposition), ["unresolved", "orphan"]);
  value.elements[0].disposition = "orphan";
  assert.throws(() => validateWriterSetupPayoffOutput(value, scenes), /invalid_status/u);
});

test("model output cannot reference unknown scenes, blocks, candidates or add narrative text fields", () => {
  const scenes = deriveWriterSceneSources(fixture());
  const unknown = payload();
  unknown.elements[0].blockId = "99999999-9999-4999-8999-999999999999";
  assert.throws(() => validateWriterSetupPayoffOutput(unknown, scenes), /invalid_evidence/u);
  const rewrite = { ...payload(), rewrite: "Marta encuentra la llave." };
  assert.throws(() => validateWriterSetupPayoffOutput(rewrite, scenes), /invalid_schema/u);
});

test("one setup can link to multiple payoffs and output schema stays strict", () => {
  const value = payload();
  value.links.push({ setupCandidateId: "setup-key", payoffCandidateId: "payoff-card", explanation: "La llave también habilita el archivo.", confidence: "low" });
  assert.equal(validateWriterSetupPayoffOutput(value, deriveWriterSceneSources(fixture())).links.length, 4);
  const schema = writerSetupPayoffOutputSchema();
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.elements.items.additionalProperties, false);
  assert.equal(schema.properties.links.items.additionalProperties, false);
});

test("full-script hash is stable and changes only when canonical narrative content changes", async () => {
  const document = fixture();
  const first = await writerSetupPayoffSourceHash(document);
  assert.equal(first, await writerSetupPayoffSourceHash(structuredClone(document)));
  const changed = structuredClone(document);
  changed.content[1].content = [{ type: "text", text: "Marta rompe la llave." }];
  assert.notEqual(first, await writerSetupPayoffSourceHash(changed));
  assert.match(first, /^[0-9a-f]{64}$/u);
});

test("provider contract is script-wide, bounded and uses the existing Terra model/version", () => {
  const source = writerSetupPayoffProviderInput(deriveWriterSceneSources(fixture()));
  assert.match(source, /llave bajo el piano/u);
  assert.equal(WRITER_SETUP_PAYOFF_MODEL, "gpt-5.6-terra");
  assert.equal(WRITER_SETUP_PAYOFF_VERSION, "setup-payoff-v1");
});
