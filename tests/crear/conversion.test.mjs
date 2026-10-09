import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";

const projectId = "33333333-3333-4333-8333-333333333333";
const writerId = "44444444-4444-4444-8444-444444444444";
const sessionId = "55555555-5555-4555-8555-555555555555";
const ownerId = "11111111-1111-4111-8111-111111111111";

const { buildCreativeBriefDocument, convertCrearSession } = load("lib/crear/server.ts", {
  "@/lib/writer/document": {
    WRITER_SCHEMA_VERSION: 1,
    createBlock: (kind, text = "", id = "66666666-6666-4666-8666-666666666666") => ({ type: "screenplayBlock", attrs: { id, kind }, content: text ? [{ type: "text", text }] : [] }),
    createEmptyWriterDocument: () => ({ type: "doc", content: [{ type: "screenplayBlock", attrs: { id: "77777777-7777-4777-8777-777777777777", kind: "sceneHeading" } }] }),
  },
});

function detail(converted = false) {
  const stamp = new Date().toISOString();
  const item = (type, state, content) => ({ id: crypto.randomUUID(), sessionId, type, state, content, title: null, sourceMessageId: null, createdAt: stamp, updatedAt: stamp });
  return {
    session: { id: sessionId, title: "ARCA", premise: "Una flota aislada intenta sobrevivir.", projectId: converted ? projectId : null, writerId: converted ? writerId : null, createdAt: stamp, updatedAt: stamp },
    messages: [],
    reactions: [],
    items: [
      item("character", "active", "Una tripulante descifra la señal."),
      item("world", "canon", "Las Arcas no saben de las demás."),
      item("world", "maybe", "Una nave podría mentir sobre su origen."),
      item("premise", "maybe", "La señal fue enviada por la propia Arca desde el futuro."),
      item("theme", "discarded", "El destino estaba predeterminado."),
      item("pending", "active", "Decidir si existe una señal."),
    ],
  };
}

test("conversion creates a real Writer brief from active decisions and keeps Maybe as notes", async () => {
  let document;
  let linked;
  let rpcCount = 0;
  const db = {
    rpc: async (name, args) => {
      if (name === "create_recover_writer_conversion_v1") return { data: [], error: null };
      assert.equal(name, "writer_create_script");
      rpcCount += 1;
      document = args.p_document;
      return { data: { id: writerId }, error: null };
    },
    from: (table) => {
      if (table === "writer_scripts") return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { project_id: projectId }, error: null }) }) }) }),
      };
      if (table === "create_sessions") return {
        update: (value) => { linked = value; return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: sessionId }, error: null }) }) }) }) }; },
      };
      if (table === "create_signals") return {
        insert: async () => ({ error: null }),
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }),
      };
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const result = await convertCrearSession(db, ownerId, detail());
  assert.equal(result.projectId, projectId);
  assert.equal(result.writerId, writerId);
  assert.equal(linked.project_id, projectId);
  assert.equal(linked.converted_writer_id, writerId);
  assert.equal(rpcCount, 1);
  assert.equal(document.type, "doc");
  assert.equal(document.content[0].attrs.kind, "authorNote");
  const brief = document.content[0].content[0].text;
  assert.match(brief, /PREMISA[\s\S]*Una flota aislada/);
  assert.match(brief, /PERSONAJES[\s\S]*Una tripulante descifra/);
  assert.match(brief, /MUNDO[\s\S]*Las Arcas no saben/);
  assert.match(brief, /MAYBE[\s\S]*Una nave podría mentir/);
  assert.doesNotMatch(brief, /El destino estaba predeterminado/);
  assert.doesNotMatch(brief, /Decidir si existe una señal/);
  assert.doesNotMatch(brief, /La señal fue enviada por la propia Arca desde el futuro/);
  assert.equal((brief.match(/Una nave podría mentir/g) ?? []).length, 1);

  const retry = await convertCrearSession(db, ownerId, detail(true));
  assert.equal(retry.projectId, projectId);
  assert.equal(retry.writerId, writerId);
  assert.equal(rpcCount, 1);
});

test("creative brief block ids are deterministic for safe Writer retries", () => {
  const first = buildCreativeBriefDocument(detail());
  const second = buildCreativeBriefDocument(detail());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const ids = first.content.map((block) => block.attrs.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));

  const edited = detail();
  edited.session.premise = "La tripulación ya conoce la señal.";
  assert.deepEqual(
    buildCreativeBriefDocument(edited).content.map((block) => block.attrs.id),
    ids,
  );
});

test("conversion recovers a committed Writer operation before rebuilding edited content", async () => {
  let rpcCalls = 0;
  const db = {
    rpc: async (name) => {
      rpcCalls += 1;
      assert.equal(name, "create_recover_writer_conversion_v1");
      return { data: [{ project_id: projectId, writer_id: writerId }], error: null };
    },
    from: (table) => {
      assert.equal(table, "create_signals");
      return {
        insert: async () => ({ error: null }),
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }),
      };
    },
  };
  const edited = detail();
  edited.session.premise = "Contenido editado después de que Writer se creó.";
  const result = await convertCrearSession(db, ownerId, edited);
  assert.equal(result.projectId, projectId);
  assert.equal(result.writerId, writerId);
  assert.equal(rpcCalls, 1);
});

test("conversion rejects a session without active or Canon creative content", async () => {
  const empty = detail();
  empty.session.premise = null;
  empty.items = empty.items.filter((item) => item.state === "maybe");
  await assert.rejects(
    convertCrearSession({ rpc: async () => ({ data: [], error: null }) }, ownerId, empty),
    /Guarda al menos una idea activa/,
  );
});

test("conversion explains the existing Writer quota", async () => {
  const db = {
    rpc: async (name) => name === "create_recover_writer_conversion_v1"
      ? { data: [], error: null }
      : { data: null, error: { message: "WRITER_QUOTA_REACHED" } },
  };
  await assert.rejects(
    convertCrearSession(db, ownerId, detail()),
    /máximo actual de 3 documentos en Writer/,
  );
});
