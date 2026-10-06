import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createBlock, type WriterDocument } from "../../lib/writer/document.ts";
import {
  buildWriterIdeasSourceContext,
  validateWriterIdeasOutput,
  writerIdeasProviderInput,
} from "../../lib/writer/ideas.ts";

function handoffDocument(): WriterDocument {
  return {
    type: "doc",
    content: [
      createBlock("sceneHeading", "INT. RADIO - NOCHE"),
      ...Array.from({ length: 40 }, (_, index) => createBlock("action", `Evidencia narrativa ${index + 1}.`)),
      createBlock("action", "La evidencia decisiva está al final de la escena."),
      createBlock("sceneHeading", "EXT. AZOTEA - AMANECER"),
      createBlock("action", "Mara apaga la radio y mira la ciudad."),
    ],
  };
}

test("Ideas sends the complete requested source and keeps the user question separate", () => {
  const document = handoffDocument();
  const firstSceneId = document.content[0]!.attrs.id;
  const source = buildWriterIdeasSourceContext(document, "scene", firstSceneId);
  assert.equal(source.scenes.length, 1);
  assert.equal(source.scenes[0]!.blocks.length, 42);
  assert.equal(source.scenes[0]!.blocks.at(-1)?.text, "La evidencia decisiva está al final de la escena.");
  const serialized = writerIdeasProviderInput({
    request: { scope: "scene", sceneId: firstSceneId, question: "¿Cómo tensionar el silencio?", category: "Subtexto" },
    sourceRevision: 17,
    source,
    narrativeContext: { acceptedDecision: "Mara no responde" },
  });
  assert.match(serialized, /¿Cómo tensionar el silencio\?/u);
  assert.match(serialized, /La evidencia decisiva está al final de la escena\./u);
  assert.match(serialized, /Mara no responde/u);
});

test("Ideas rejects invented and oversized provider results", () => {
  const document = handoffDocument();
  const source = buildWriterIdeasSourceContext(document, "scene", document.content[0]!.attrs.id);
  const validReference = source.references.find((reference) => reference.blockKind === "action")!.id;
  const makeIdea = (index: number, referenceId = validReference) => ({
    id: `idea-${index}`,
    title: `Dirección ${index}`,
    direction: "Explorar una consecuencia narrativa sin escribir el guion por el usuario.",
    consequence: "La decisión cambia la lectura de la escena.",
    category: "Conflicto",
    basis: "new_direction",
    referenceIds: [referenceId],
  });
  assert.equal(validateWriterIdeasOutput({ ideas: [makeIdea(1), makeIdea(2), makeIdea(3)] }, source).length, 3);
  assert.throws(() => validateWriterIdeasOutput({ ideas: [makeIdea(1, "block:inventado"), makeIdea(2), makeIdea(3)] }, source), /invalid_reference/u);
  assert.throws(() => validateWriterIdeasOutput({ ideas: Array.from({ length: 6 }, (_, index) => makeIdea(index)) }, source), /invalid_schema/u);
});

test("Ideas is embedded, explicit and provider-backed without a deterministic fallback", () => {
  const tools = readFileSync(new URL("../../components/writer/WriterErgonomicTools.tsx", import.meta.url), "utf8");
  const timeline = readFileSync(new URL("../../components/writer/WriterTimeline.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/writer/scripts/[id]/ideas/route.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../../lib/writer/ideas-server.ts", import.meta.url), "utf8");
  assert.match(timeline, /"timeline" \| "pulse" \| "ideas"/u);
  assert.match(timeline, /timeline-ideas-view/u);
  assert.match(tools, /Generar ideas/u);
  assert.doesNotMatch(tools, /role="dialog"[^>]*aria-label="Ideas"/u);
  assert.match(route, /executeWriterIdeas/u);
  assert.match(server, /store:\s*false/u);
  assert.match(server, /writer_smart_tool_operations/u);
  assert.match(server, /chunks:\s*Math\.min\(source\.scenes\.length, MAX_PERSISTED_CHUNKS\)/u);
  assert.match(server, /\.range\(from, from \+ SPENDING_PAGE_SIZE - 1\)/u);
  assert.doesNotMatch(`${route}\n${server}`, /createMockWriterIdeas|mocked:\s*true/u);
});

test("Ideas authenticates before parsing, scopes the saved script by owner and keeps screenplay text out of logs", () => {
  const route = readFileSync(new URL("../../app/api/writer/scripts/[id]/ideas/route.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../../lib/writer/ideas-server.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("writerApiSession()") < route.indexOf("readWriterJson(request)"));
  assert.match(server, /\.eq\("id", request\.scriptId\)\.eq\("owner_id", userId\)/u);
  assert.match(server, /Idempotency-Key/u);
  const logger = server.slice(server.indexOf("function logOperation"));
  assert.doesNotMatch(logger, /providerInput|question|screenplay|document/u);
});

test("Writer uses one non-focusing centered navigation contract", () => {
  const workspace = readFileSync(new URL("../../components/writer/WriterWorkspace.tsx", import.meta.url), "utf8");
  const contractStart = workspace.indexOf("const navigateToWriterReference");
  const contractEnd = workspace.indexOf("const navigateBack", contractStart);
  const contract = workspace.slice(contractStart, contractEnd);
  assert.match(contract, /revealWriterBlock\(target\.position\)/u);
  assert.doesNotMatch(contract, /scrollIntoView|\.focus\(/u);
  assert.match(workspace, /paper\.clientHeight - targetRect\.height\) \/ 2/u);
  assert.match(workspace, /El fragmento cambió; mostrando la escena\./u);
  assert.match(workspace, /writerSceneAtSelectionHead\(state\)/u);
});

test("Pensarlo juntos keeps idea context separate and Guide reveals the new response start", () => {
  const workspace = readFileSync(new URL("../../components/writer/WriterWorkspace.tsx", import.meta.url), "utf8");
  const guide = readFileSync(new URL("../../components/writer/WriterGuidedWriting.tsx", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../../lib/writer/guided-writing.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../../lib/writer/guided-writing-client.ts", import.meta.url), "utf8");
  assert.match(workspace, /setGuidedIdeaContext/u);
  assert.doesNotMatch(workspace, /setGuidedIdeaQuestion/u);
  assert.match(guide, /¿Qué quieres explorar de esta idea\?/u);
  assert.match(guide, /Ver nueva respuesta/u);
  assert.match(provider, /selectedIdea/u);
  assert.match(provider, /currentQuestion:\s*question/u);
  assert.match(client, /ideaContext\.sceneId/u);
});

test("Assistant reopen preserves its section and Hitos controls are explicit", () => {
  const workspace = readFileSync(new URL("../../components/writer/WriterWorkspace.tsx", import.meta.url), "utf8");
  const pulse = readFileSync(new URL("../../components/writer/WriterNarrativePulse.tsx", import.meta.url), "utf8");
  const openerStart = workspace.indexOf("function openObservations");
  const openerEnd = workspace.indexOf("function", openerStart + 20);
  if (openerStart >= 0) assert.doesNotMatch(workspace.slice(openerStart, openerEnd), /setObservationsSection\("review"\)/u);
  assert.match(pulse, /Añadir hito/u);
  assert.match(pulse, /name="plus"/u);
  assert.match(pulse, /aria-hidden="true"/u);
});
