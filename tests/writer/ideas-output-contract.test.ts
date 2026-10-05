import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  buildWriterIdeasSourceContext,
  extractWriterIdeasProviderPayload,
  validateWriterIdeasOutput,
  WriterIdeasOutputError,
  writerIdeasOutputSchema,
  writerIdeasProviderInput,
} from "../../lib/writer/ideas.ts";

function fixture() {
  const document: WriterDocument = {
    type: "doc",
    content: [
      createBlock("sceneHeading", "INT. CABINA DE RADIO - NOCHE", "10000000-0000-4000-8000-000000000001"),
      createBlock("action", "Mara encuentra una cinta sin etiqueta.", "20000000-0000-4000-8000-000000000001"),
      createBlock("action", "Tomás insiste en que no la reproduzca.", "20000000-0000-4000-8000-000000000002"),
    ],
  };
  const source = buildWriterIdeasSourceContext(document, "scene", document.content[0]!.attrs.id);
  return { document, source };
}

function idea(index: number, referenceIds: unknown[] = []) {
  return {
    id: `idea-${index}`,
    title: `Dirección ${index}`,
    direction: `Explorar una consecuencia narrativa distinta ${index}.`,
    consequence: `La escena cambia de lectura ${index}.`,
    category: "Conflicto",
    basis: "new_direction",
    referenceIds,
  };
}

function response(ideas: unknown[]) {
  return {
    id: "resp_synthetic",
    status: "completed",
    output_text: JSON.stringify({ ideas }),
    usage: { input_tokens: 120, output_tokens: 80 },
  };
}

function issue(action: () => unknown) {
  assert.throws(action, (cause) => cause instanceof WriterIdeasOutputError);
  try { action(); } catch (cause) { return cause as WriterIdeasOutputError; }
  throw new Error("expected WriterIdeasOutputError");
}

test("the Responses envelope feeds the real validator for three and five ideas", () => {
  const { source } = fixture();
  for (const count of [3, 5]) {
    const payload = extractWriterIdeasProviderPayload(response(Array.from({ length: count }, (_, index) => idea(index + 1))));
    assert.equal(validateWriterIdeasOutput(payload, source).length, count);
  }
  const schema = writerIdeasOutputSchema();
  assert.equal(schema.properties.ideas.minItems, 3);
  assert.equal(schema.properties.ideas.maxItems, 5);
});

test("quantity, required fields and optional empty references share one contract", () => {
  const { source } = fixture();
  assert.equal(validateWriterIdeasOutput({ ideas: [idea(1), idea(2), idea(3)] }, source)[0]!.references.length, 0);
  assert.equal(issue(() => validateWriterIdeasOutput({ ideas: [idea(1), idea(2)] }, source)).code, "idea_count");
  assert.equal(issue(() => validateWriterIdeasOutput({ ideas: Array.from({ length: 6 }, (_, index) => idea(index)) }, source)).code, "idea_count");
  assert.equal(issue(() => validateWriterIdeasOutput({ ideas: [idea(1, null as unknown as unknown[]), idea(2), idea(3)] }, source)).code, "item_shape");
  assert.equal(issue(() => validateWriterIdeasOutput({ ideas: [{ ...idea(1), title: "" }, idea(2), idea(3)] }, source)).code, "text");
});

test("canonical and exact source aliases resolve without accepting foreign references", () => {
  const { source } = fixture();
  const action = source.references.find((reference) => reference.blockKind === "action")!;
  const canonical = validateWriterIdeasOutput({ ideas: [idea(1, [action.id]), idea(2), idea(3)] }, source);
  assert.equal(canonical[0]!.references[0]!.id, action.id);

  const blockAlias = validateWriterIdeasOutput({ ideas: [idea(1, [action.blockId]), idea(2), idea(3)] }, source);
  assert.equal(blockAlias[0]!.references[0]!.id, action.id);

  const sceneAlias = validateWriterIdeasOutput({ ideas: [idea(1, [action.sceneId]), idea(2), idea(3)] }, source);
  assert.equal(sceneAlias[0]!.references[0]!.id, `scene:${action.sceneId}`);

  const unknown = issue(() => validateWriterIdeasOutput({ ideas: [idea(1, ["20000000-0000-4000-8000-999999999999"]), idea(2), idea(3)] }, source));
  assert.equal(unknown.code, "reference_unknown");
  assert.equal(unknown.fieldPath, "ideas[0].referenceIds[0]");
});

test("the provider reference catalog exposes one unambiguous identifier", () => {
  const { source } = fixture();
  const input = JSON.parse(writerIdeasProviderInput({
    request: { scope: "scene", sceneId: source.sceneId, question: "", category: null },
    sourceRevision: 4,
    source,
  })) as { referenceCatalog: Array<Record<string, unknown>> };
  assert.ok(input.referenceCatalog.length > 0);
  for (const reference of input.referenceCatalog) {
    assert.deepEqual(Object.keys(reference).sort(), ["label", "referenceId"]);
  }
});

test("incomplete, refused and malformed Responses remain distinct from local validation", () => {
  assert.equal(issue(() => extractWriterIdeasProviderPayload({ status: "incomplete", output_text: "" })).code, "response_incomplete");
  assert.equal(issue(() => extractWriterIdeasProviderPayload({
    status: "completed",
    output_text: "",
    output: [{ type: "message", content: [{ type: "refusal", refusal: "synthetic" }] }],
  })).code, "response_refusal");
  assert.equal(issue(() => extractWriterIdeasProviderPayload({ status: "completed", output_text: "{" })).code, "response_json");
});

test("usage in a completed Responses envelope remains available when local validation rejects", () => {
  const { source } = fixture();
  const envelope = response([idea(1, ["foreign"]), idea(2), idea(3)]);
  const payload = extractWriterIdeasProviderPayload(envelope);
  assert.equal(issue(() => validateWriterIdeasOutput(payload, source)).code, "reference_unknown");
  assert.deepEqual(envelope.usage, { input_tokens: 120, output_tokens: 80 });
});

test("the existing Ideas panel keeps one explicit operation and renders only valid references", () => {
  const panel = readFileSync(new URL("../../components/writer/WriterErgonomicTools.tsx", import.meta.url), "utf8");
  const timeline = readFileSync(new URL("../../components/writer/WriterTimeline.tsx", import.meta.url), "utf8");
  const panelStart = panel.indexOf("export function WriterIdeasPanel");
  const panelEnd = panel.indexOf("export function WriterVersionsPanel", panelStart);
  const ideasPanel = panel.slice(panelStart, panelEnd);
  assert.match(ideasPanel, /if \(busy \|\| \(scope === "scene" && !activeSceneId\)\) return/u);
  assert.match(ideasPanel, /setIdeas\(Array\.isArray\(data\.ideas\) \? data\.ideas : \[\]\)/u);
  assert.match(ideasPanel, /idea\.references\.map/u);
  assert.match(ideasPanel, /setMessage\(next\)/u);
  assert.doesNotMatch(ideasPanel, /useEffect\([^)]*generate/u);
  assert.doesNotMatch(ideasPanel, /setQuestion\(""\)|setIdeas\(\[\]\)[\s\S]*catch/u);
  assert.match(timeline, /timeline-ideas-view" hidden=\{panelView !== "ideas"\}/u);
});

test("sanitized validation diagnostics contain structure but no generated content", () => {
  const server = readFileSync(new URL("../../lib/writer/ideas-server.ts", import.meta.url), "utf8");
  const logger = server.slice(server.indexOf("function logIdeasValidationFailure"));
  for (const field of ["operationId", "contractVersion", "code", "fieldPath", "expected", "receivedType", "count", "length"]) {
    assert.match(logger, new RegExp(`\\b${field}\\b`, "u"));
  }
  assert.doesNotMatch(logger, /providerInput|output_text|screenplay|question|direction|consequence/u);
});
