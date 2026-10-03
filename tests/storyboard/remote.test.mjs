import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { testConfiguration } from "../integration/test-project.mjs";

const empty = { schemaVersion: 1, frame: { width: 1600, height: 900 }, reference: null, objects: [] };
const drawing = { schemaVersion: 1, frame: { width: 1600, height: 900 }, reference: null, objects: [{ id: "77777777-7777-4777-8777-777777777777", type: "stroke", color: "#ffffff", opacity: 1, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 8, points: [{ x: 10, y: 10 }, { x: 120, y: 80 }] }] };

test("Supabase Test persists editable panels and enforces A/B isolation", { timeout: 240_000 }, async () => {
  const config = testConfiguration();
  const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await withStoryboardUsers(config, admin, async ({ owner, stranger }) => {
    const createdList = await owner.client.rpc("writer_create_shotlist", { p_script_id: null, p_title: "QA Storyboard manual", p_operation_id: crypto.randomUUID() });
    assert.equal(createdList.error, null);
    const shotlistId = createdList.data;
    const group = await owner.client.from("writer_shotlist_groups").select("id").eq("shotlist_id", shotlistId).single();
    assert.equal(group.error, null);
    const createdShot = await owner.client.rpc("writer_add_shot", { p_shotlist_id: shotlistId, p_group_id: group.data.id, p_operation_id: crypto.randomUUID(), p_origin: "manual" });
    assert.equal(createdShot.error, null);
    const shotId = createdShot.data;

    const operationId = crypto.randomUUID();
    const createArgs = {
      p_actor_id: owner.id, p_shotlist_id: shotlistId, p_shot_id: shotId, p_operation_id: operationId,
      p_document: empty, p_schema_version: 1, p_base_asset_id: null, p_visual_note: null,
      p_logical_width: 1600, p_logical_height: 900, p_content_kind: "empty", p_content_hash: "a".repeat(64),
      p_source_shot_revision: 1, p_source_context_hash: "b".repeat(64),
    };
    const first = await admin.rpc("storyboard_create_panel", createArgs);
    const duplicate = await admin.rpc("storyboard_create_panel", createArgs);
    assert.equal(first.error, null);
    assert.equal(duplicate.error, null);
    assert.equal(first.data[0].panel_id, duplicate.data[0].panel_id);
    const panelId = first.data[0].panel_id;
    const initialRevisionId = first.data[0].revision_id;

    const ownerRead = await owner.client.from("storyboard_panels").select("id,current_revision_id").eq("id", panelId).single();
    assert.equal(ownerRead.error, null);
    const strangerRead = await stranger.client.from("storyboard_panels").select("id").eq("id", panelId);
    assert.equal(strangerRead.error, null);
    assert.equal(strangerRead.data.length, 0);
    const directMutation = await owner.client.rpc("storyboard_create_panel", createArgs);
    assert.notEqual(directMutation.error, null, "Authenticated browsers must not call server-only mutation RPCs.");

    const saveArgs = {
      p_actor_id: owner.id, p_panel_id: panelId, p_expected_revision_id: initialRevisionId, p_operation_id: crypto.randomUUID(),
      p_document: drawing, p_schema_version: 1, p_base_asset_id: null, p_visual_note: "Mano entra a cuadro",
      p_logical_width: 1600, p_logical_height: 900, p_content_kind: "drawing", p_content_hash: "c".repeat(64),
      p_source_shot_revision: 1, p_source_context_hash: "b".repeat(64),
    };
    const saved = await admin.rpc("storyboard_save_panel_revision", saveArgs);
    assert.equal(saved.error, null);
    assert.equal(saved.data[0].revision_number, 2);
    const savedAgain = await admin.rpc("storyboard_save_panel_revision", saveArgs);
    assert.equal(savedAgain.error, null);
    assert.equal(savedAgain.data[0].revision_id, saved.data[0].revision_id);
    const stale = await admin.rpc("storyboard_save_panel_revision", { ...saveArgs, p_operation_id: crypto.randomUUID(), p_content_hash: "d".repeat(64) });
    assert.ok(stale.error, `Expected a stale-write conflict, received: ${JSON.stringify(stale)}`);
    assert.ok(
      stale.error.code === "40001" || stale.error.message.includes("STORYBOARD_REVISION_CONFLICT"),
      `Unexpected stale-write error: ${JSON.stringify(stale.error)}`,
    );

    const approval = await admin.rpc("storyboard_approve_panel", { p_actor_id: owner.id, p_panel_id: panelId, p_revision_id: saved.data[0].revision_id });
    assert.equal(approval.error, null);
    const crossApproval = await admin.rpc("storyboard_approve_panel", { p_actor_id: stranger.id, p_panel_id: panelId, p_revision_id: saved.data[0].revision_id });
    assert.equal(crossApproval.error?.message.includes("STORYBOARD_PANEL_NOT_FOUND"), true);

    const foreignAsset = await admin.from("writer_production_assets").insert({ owner_id: stranger.id, storage_path: `${stranger.id}/qa/foreign.webp`, mime_type: "image/webp", size_bytes: 8, width: 1, height: 1 }).select("id").single();
    assert.equal(foreignAsset.error, null);
    const foreignReference = await admin.rpc("storyboard_save_panel_revision", {
      ...saveArgs,
      p_expected_revision_id: saved.data[0].revision_id,
      p_operation_id: crypto.randomUUID(),
      p_base_asset_id: foreignAsset.data.id,
      p_content_hash: "e".repeat(64),
    });
    assert.equal(foreignReference.error?.message.includes("STORYBOARD_ASSET_NOT_FOUND"), true);

    const legacyDelete = await owner.client.rpc("writer_delete_shots", { p_shotlist_id: shotlistId, p_shot_ids: [shotId] });
    assert.equal(legacyDelete.error?.message.includes("SHOTLIST_STORYBOARD_DEPENDENCY"), true);
    const explicitDelete = await admin.rpc("storyboard_delete_shots_with_panels", { p_actor_id: owner.id, p_shotlist_id: shotlistId, p_shot_ids: [shotId] });
    assert.equal(explicitDelete.error, null);
    assert.deepEqual(explicitDelete.data, { shots: 1, panels: 1, approvals: 1 });
  });
});

async function withStoryboardUsers(config, admin, run) {
  const users = [];
  const prefix = `storyboard-${randomUUID()}`;
  try {
    for (const kind of ["owner", "stranger"]) {
      const email = `${prefix}-${kind}@example.invalid`;
      const password = randomBytes(24).toString("base64url") + "aA1!";
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Storyboard ${kind}` } });
      assert.equal(created.error, null);
      const client = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const signed = await client.auth.signInWithPassword({ email, password });
      assert.equal(signed.error, null);
      users.push({ id: created.data.user.id, email, client });
    }
    await run({ owner: users[0], stranger: users[1] });
  } finally {
    await Promise.all(users.map(async (user) => {
      assert.ok(user.email.startsWith(prefix + "-"));
      const removed = await admin.auth.admin.deleteUser(user.id);
      assert.equal(removed.error, null);
    }));
  }
}
