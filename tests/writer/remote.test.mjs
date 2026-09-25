import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const TEST_REF = "ezlycwkuzkwcnhrhiruv";
const SUPABASE_CLI = "C:/Users/atlun/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe";

test("Writer RPCs enforce ownership, revision, idempotency and the atomic quota in Supabase Test", async () => {
  assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF, "Explicit Test opt-in required.");
  const keys = JSON.parse(execFileSync(SUPABASE_CLI, [
    "projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const anonKey = keys.find((key) => key.name === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
  assert.ok(anonKey && serviceKey);
  const url = `https://${TEST_REF}.supabase.co`;
  const client = (key) => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const service = client(serviceKey);
  const anonymous = client(anonKey);
  const users = [];
  const prefix = `writer-${randomUUID()}`;
  try {
    for (const role of ["owner", "stranger"]) {
      const email = `${prefix}-${role}@example.invalid`;
      const password = `${randomBytes(24).toString("base64url")}aA1!`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null);
      const signedClient = client(anonKey);
      const signed = await signedClient.auth.signInWithPassword({ email, password });
      assert.equal(signed.error, null);
      users.push({ id: created.data.user.id, email, client: signedClient });
    }
    const [owner, stranger] = users;
    const document = makeDocument();

    const direct = await owner.client.from("writer_scripts").insert({
      owner_id: owner.id, title: "Bypass", document, schema_version: 1,
    });
    assert.ok(direct.error, "Authenticated clients must not insert directly.");

    const createOperation = randomUUID();
    const first = checked(await owner.client.rpc("writer_create_script", {
      p_operation_id: createOperation,
      p_title: "Primero",
      p_document: document,
      p_schema_version: 1,
    }))[0];
    const firstRetry = checked(await owner.client.rpc("writer_create_script", {
      p_operation_id: createOperation,
      p_title: "Primero",
      p_document: document,
      p_schema_version: 1,
    }))[0];
    assert.equal(firstRetry.id, first.id);
    const reused = await owner.client.rpc("writer_create_script", {
      p_operation_id: createOperation,
      p_title: "Contenido distinto",
      p_document: document,
      p_schema_version: 1,
    });
    assert.match(reused.error?.message ?? "", /WRITER_OPERATION_REUSED/);

    const duplicated = checked(await owner.client.rpc("writer_duplicate_script", {
      p_source_id: first.id,
      p_operation_id: randomUUID(),
      p_title: "Primero — copia",
    }))[0];
    assert.notEqual(duplicated.id, first.id);
    assert.notEqual(duplicated.document.content[0].attrs.id, first.document.content[0].attrs.id);

    const concurrent = await Promise.all([
      owner.client.rpc("writer_create_script", {
        p_operation_id: randomUUID(), p_title: "Tercero A", p_document: document, p_schema_version: 1,
      }),
      owner.client.rpc("writer_create_script", {
        p_operation_id: randomUUID(), p_title: "Tercero B", p_document: document, p_schema_version: 1,
      }),
    ]);
    assert.equal(concurrent.filter((result) => !result.error).length, 1);
    assert.equal(concurrent.filter((result) => /WRITER_QUOTA_REACHED/.test(result.error?.message ?? "")).length, 1);

    const ownerRows = checked(await owner.client.from("writer_scripts").select("id,title,revision"));
    assert.equal(ownerRows.length, 3);
    assert.equal(checked(await stranger.client.from("writer_scripts").select("id")).length, 0);
    const anonRead = await anonymous.from("writer_scripts").select("id");
    assert.ok(anonRead.error || anonRead.data?.length === 0);

    const strangerSave = await stranger.client.rpc("writer_save_script", {
      p_script_id: first.id,
      p_expected_revision: 1,
      p_operation_id: randomUUID(),
      p_title: "Ataque",
      p_document: document,
      p_schema_version: 1,
    });
    assert.match(strangerSave.error?.message ?? "", /WRITER_NOT_FOUND/);

    const saveOperation = randomUUID();
    const changedDocument = makeDocument("Texto guardado con áéíóú");
    const saved = checked(await owner.client.rpc("writer_save_script", {
      p_script_id: first.id,
      p_expected_revision: 1,
      p_operation_id: saveOperation,
      p_title: "Primero editado",
      p_document: changedDocument,
      p_schema_version: 1,
    }))[0];
    assert.equal(Number(saved.revision), 2);
    const saveRetry = checked(await owner.client.rpc("writer_save_script", {
      p_script_id: first.id,
      p_expected_revision: 1,
      p_operation_id: saveOperation,
      p_title: "Primero editado",
      p_document: changedDocument,
      p_schema_version: 1,
    }))[0];
    assert.equal(Number(saveRetry.revision), 2);
    const stale = await owner.client.rpc("writer_save_script", {
      p_script_id: first.id,
      p_expected_revision: 1,
      p_operation_id: randomUUID(),
      p_title: "Stale",
      p_document: document,
      p_schema_version: 1,
    });
    assert.match(stale.error?.message ?? "", /WRITER_REVISION_CONFLICT/);

    const deleted = checked(await owner.client.rpc("writer_delete_script", {
      p_script_id: first.id,
      p_expected_revision: 2,
    }));
    assert.equal(deleted, true);
    const lateSave = await owner.client.rpc("writer_save_script", {
      p_script_id: first.id,
      p_expected_revision: 2,
      p_operation_id: randomUUID(),
      p_title: "No revivir",
      p_document: changedDocument,
      p_schema_version: 1,
    });
    assert.match(lateSave.error?.message ?? "", /WRITER_NOT_FOUND/);
    assert.equal(checked(await owner.client.from("writer_scripts").select("id").eq("id", first.id)).length, 0);
  } finally {
    for (const user of users) {
      assert.ok(user.email.startsWith(prefix));
      const removed = await service.auth.admin.deleteUser(user.id);
      assert.equal(removed.error, null);
    }
  }
});

function checked(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}

function makeDocument(action = "Acción") {
  return {
    type: "doc",
    content: [
      {
        type: "screenplayBlock",
        attrs: { id: randomUUID(), kind: "sceneHeading" },
        content: [{ type: "text", text: "INT. PRUEBA — DÍA" }],
      },
      {
        type: "screenplayBlock",
        attrs: { id: randomUUID(), kind: "action" },
        content: [{ type: "text", text: action }],
      },
    ],
  };
}
