import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const TEST_REF = "ezlycwkuzkwcnhrhiruv";
const SUPABASE_CLI = "C:/Users/atlun/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe";

test("assisted-import accounting and analysis are isolated in Supabase Test", async () => {
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
  const users = [];
  const prefix = `writer-assisted-${randomUUID()}`;
  try {
    for (const role of ["owner", "stranger"]) {
      const email = `${prefix}-${role}@example.invalid`;
      const password = `${randomBytes(24).toString("base64url")}aA1!`;
      const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true })).user;
      const signed = client(anonKey);
      checked(await signed.auth.signInWithPassword({ email, password }));
      users.push({ id: created.id, email, client: signed });
    }
    const [owner, stranger] = users;
    const operationId = randomUUID();
    const blockId = randomUUID();
    const document = {
      type: "doc",
      content: [{ type: "screenplayBlock", attrs: { id: blockId, kind: "action" }, content: [{ type: "text", text: "Una niña aparece." }] }],
    };
    const reserved = checked(await service.rpc("writer_reserve_assisted_import", {
      p_user_id: owner.id,
      p_operation_id: operationId,
      p_source_hash: "a".repeat(64),
      p_options_hash: "b".repeat(64),
      p_source_format: "fdx",
      p_title: "QA asistida",
      p_source_words: 3,
      p_source_tokens: 5,
      p_source_bytes: 20,
      p_model: "gpt-5.6-luna",
    }));
    assert.equal(reserved.reused, false);
    const finalized = checked(await service.rpc("writer_finalize_assisted_import", {
      p_user_id: owner.id,
      p_operation_id: operationId,
      p_title: "QA asistida",
      p_document: document,
      p_schema_version: 1,
      p_analysis_version: "writer-import-ai-v1",
      p_model: null,
      p_identities: [{ key: "ROLE:PREAMBLE:NIÑA", name: "NIÑA", source: "ai", detected: true }],
      p_evidence: [],
      p_observations: [],
    }));
    assert.ok(finalized.id);

    const ownerAnalysis = checked(await owner.client.from("writer_import_analyses").select("script_id,identities"));
    assert.equal(ownerAnalysis.length, 1);
    assert.equal(checked(await stranger.client.from("writer_import_analyses").select("script_id")).length, 0);
    const forbiddenLedger = await owner.client.from("writer_assisted_imports").select("id");
    assert.ok(forbiddenLedger.error);
    const forbiddenRpc = await owner.client.rpc("writer_reserve_assisted_import", {
      p_user_id: owner.id, p_operation_id: randomUUID(), p_source_hash: "c".repeat(64),
      p_options_hash: "d".repeat(64), p_source_format: "pasted", p_title: "No",
      p_source_words: 1, p_source_tokens: 1, p_source_bytes: 1, p_model: "gpt-5.6-luna",
    });
    assert.ok(forbiddenRpc.error);

    checked(await service.rpc("writer_save_import_decision", {
      p_user_id: owner.id,
      p_script_id: finalized.id,
      p_fingerprint: "qa-fingerprint",
      p_block_id: blockId,
      p_decision: "confirmed",
      p_identity_key: "NINA-7",
      p_identity_name: "NIÑA 7",
    }));
    assert.equal(checked(await owner.client.from("writer_import_analysis_decisions").select("fingerprint")).length, 1);
    assert.equal(checked(await stranger.client.from("writer_import_analysis_decisions").select("fingerprint")).length, 0);
  } finally {
    for (const user of users) {
      assert.ok(user.email.startsWith(prefix));
      assert.equal((await service.auth.admin.deleteUser(user.id)).error, null);
    }
  }
});

function checked(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
