import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const TEST_REF = "ezlycwkuzkwcnhrhiruv";
const SUPABASE_CLI = "C:/Users/atlun/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe";

test("an imported canonical document follows the existing create/save contracts in Supabase Test", async () => {
  assert.equal(process.env.FILMATTA_RUN_WRITER_USABILITY_REMOTE, TEST_REF, "Explicit Supabase Test opt-in required.");
  const keys = JSON.parse(execFileSync(SUPABASE_CLI, [
    "projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const anonKey = keys.find((key) => key.name === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
  assert.ok(anonKey && serviceKey);

  const url = `https://${TEST_REF}.supabase.co`;
  const makeClient = (key) => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const service = makeClient(serviceKey);
  const email = `writer-usability-${randomUUID()}@example.invalid`;
  const password = `${randomBytes(24).toString("base64url")}aA1!`;
  let userId = null;

  try {
    const createdUser = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(createdUser.error, null);
    userId = createdUser.data.user.id;

    const owner = makeClient(anonKey);
    const signedIn = await owner.auth.signInWithPassword({ email, password });
    assert.equal(signedIn.error, null);

    const initialDocument = makeImportedDocument("La puerta permanece cerrada.");
    const created = checked(await owner.rpc("writer_create_script", {
      p_operation_id: randomUUID(),
      p_title: "QA sintético — importación",
      p_document: initialDocument,
      p_schema_version: 1,
    }))[0];
    assert.equal(Number(created.revision), 1);
    assert.equal(created.document.content.length, initialDocument.content.length);

    const savedDocument = makeImportedDocument("La puerta se abre después del guardado.");
    const saved = checked(await owner.rpc("writer_save_script", {
      p_script_id: created.id,
      p_expected_revision: 1,
      p_operation_id: randomUUID(),
      p_title: "QA sintético — importación",
      p_document: savedDocument,
      p_schema_version: 1,
    }))[0];
    assert.equal(Number(saved.revision), 2);

    const rows = checked(await owner.from("writer_scripts")
      .select("id,revision,document")
      .eq("id", created.id));
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].revision), 2);
    assert.equal(rows[0].document.content[1].content[0].text, "La puerta se abre después del guardado.");
  } finally {
    if (userId) {
      const removed = await service.auth.admin.deleteUser(userId);
      assert.equal(removed.error, null);
    }
  }
});

function checked(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}

function makeImportedDocument(actionText) {
  const block = (kind, text) => ({
    type: "screenplayBlock",
    attrs: { id: randomUUID(), kind },
    content: text ? [{ type: "text", text }] : undefined,
  });
  return {
    type: "doc",
    content: [
      block("sceneHeading", "INT. ESTUDIO — DÍA"),
      block("action", actionText),
      block("character", "CAROLINA"),
      block("parenthetical", "(en voz baja)"),
      block("dialogue", "¿Lo escuchaste?"),
      block("transition", "CORTE A:"),
      block("authorNote", "Nota sintética no exportable"),
    ],
  };
}
