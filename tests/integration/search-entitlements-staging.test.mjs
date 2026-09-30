import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  TEST_REF,
  checked,
  testConfiguration,
  testSql,
} from "./test-project.mjs";

test("Profiles Search and Entitlements coexist in Supabase Test", async () => {
  assert.equal(process.env.FILMATTA_RUN_REMOTE_TESTS, TEST_REF);
  const config = testConfiguration();
  const client = (key) =>
    createClient(config.NEXT_PUBLIC_SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  const admin = client(config.SUPABASE_SERVICE_ROLE_KEY);
  const anon = client(config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const run = randomUUID().replaceAll("-", "");
  const token = `zafiro${run.slice(0, 10)}`;
  const city = `Ciudad QA ${run.slice(0, 8)}`;
  const skill = `Skill QA ${run.slice(0, 8)}`;
  const discipline = `Disciplina QA ${run.slice(0, 8)}`;
  const users = [];

  try {
    for (let index = 0; index < 12; index += 1) {
      const email = `search-entitlements-${run}-${index}@example.invalid`;
      const password = `${randomBytes(24).toString("base64url")}aA1!`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name:
            index === 11
              ? `${token} Draft`
              : `${token} Public ${index}`,
        },
      });
      assert.equal(created.error, null, "Synthetic Test user creation failed");
      const normal = client(config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
      const signedIn = await normal.auth.signInWithPassword({ email, password });
      assert.equal(signedIn.error, null, "Synthetic Test sign-in failed");
      users.push({
        id: created.data.user.id,
        email,
        password,
        index,
        client: normal,
      });
    }

    const profiles = [];
    for (const user of users) {
      const saved = await user.client.rpc("save_my_professional_profile", {
        p_disciplines: [discipline],
        p_city: city,
        p_bio: "Fixture temporal de integración Search + Entitlements.",
        p_availability: "available",
        p_skills: [skill],
        p_equipment: [],
        p_portfolio_items: [],
        p_is_public: user.index !== 11,
        p_contact_policy: "closed",
      });
      assert.equal(saved.error, null, "Authorized profile RPC failed");
      const profile = await user.client
        .from("professional_profiles")
        .select("user_id,slug,display_name,is_public")
        .eq("user_id", user.id)
        .single();
      assert.equal(profile.error, null, "Synthetic profile could not be read");
      profiles.push(profile.data);
    }

    const search = async (overrides = {}) =>
      checked(
        await anon.rpc("search_public_professional_profiles", {
          p_query: "",
          p_page: 1,
          p_discipline: "",
          p_city: "",
          p_availability: "",
          p_skill: "",
          ...overrides,
        }),
      );
    const expectedPublicSlug = profiles[0].slug;

    for (const filters of [
      { p_query: token },
      { p_discipline: discipline },
      { p_city: city },
      { p_availability: "available", p_query: token },
      { p_skill: skill },
      {
        p_query: token,
        p_discipline: discipline,
        p_city: city,
        p_availability: "available",
        p_skill: skill,
      },
    ]) {
      const rows = await search(filters);
      assert.ok(
        rows.some((row) => row.slug === expectedPublicSlug),
        `Expected public fixture for ${JSON.stringify(filters)}`,
      );
      assert.ok(rows.every((row) => row.slug !== profiles[11].slug));
    }

    const firstPage = await search();
    const secondPage = await search({ p_page: 2 });
    assert.equal(firstPage.length, 25, "First page includes the pagination sentinel");
    assert.ok(secondPage.length >= 2, "Second page returns remaining public profiles");
    assert.ok(Number(firstPage[0].total_count) >= 27);

    const directDraft = await anon
      .from("professional_profiles")
      .select("slug")
      .eq("slug", profiles[11].slug);
    assert.ok(
      directDraft.error,
      "Anonymous users cannot bypass the public RPC to read the base table",
    );

    const anonymousContext = checked(
      await anon.rpc("get_my_entitlement_context"),
    )[0];
    assert.equal(anonymousContext.effective_plan, "free");
    assert.equal(anonymousContext.access_source, "baseline");

    const target = users[0];
    const grantor = users[1];
    const targetClient = target.client;

    const forgedGrant = await targetClient.from("admin_plan_grants").insert({
      user_id: target.id,
      plan: "pro_plus",
      granted_by: target.id,
      source: "test",
      status: "active",
    });
    assert.ok(forgedGrant.error, "Authenticated users cannot self-assign plans");

    for (const plan of ["free", "starter", "plus", "pro", "pro_plus"]) {
      const revokedAt = new Date().toISOString();
      const revoke = await admin
        .from("admin_plan_grants")
        .update({ revoked_at: revokedAt, status: "revoked" })
        .eq("user_id", target.id)
        .eq("status", "active");
      assert.equal(revoke.error, null);

      const inserted = await admin.from("admin_plan_grants").insert({
        user_id: target.id,
        plan,
        granted_by: grantor.id,
        source: "test",
        status: "active",
        reason: `Integration QA ${run}`,
      });
      assert.equal(inserted.error, null);

      const context = checked(
        await targetClient.rpc("get_my_entitlement_context"),
      )[0];
      assert.equal(context.effective_plan, plan);
      assert.equal(context.grant_plan, plan);
      assert.equal(context.access_source, "test");
    }

    const finalRevoke = await admin
      .from("admin_plan_grants")
      .update({ revoked_at: new Date().toISOString(), status: "revoked" })
      .eq("user_id", target.id)
      .eq("status", "active");
    assert.equal(finalRevoke.error, null);

    const expired = await admin.from("admin_plan_grants").insert({
      user_id: target.id,
      plan: "pro_plus",
      granted_by: grantor.id,
      source: "test",
      status: "active",
      starts_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      reason: `Expired integration QA ${run}`,
    });
    assert.equal(expired.error, null);
    const expiredContext = checked(
      await targetClient.rpc("get_my_entitlement_context"),
    )[0];
    assert.equal(expiredContext.effective_plan, "free");
    assert.equal(expiredContext.access_source, "baseline");
  } finally {
    if (users.length > 0) {
      const ids = users.map((user) => user.id);
      const idList = ids.map((id) => `'${id}'::uuid`).join(",");
      testSql(`
        delete from public.admin_plan_grants
        where (user_id = any(array[${idList}]::uuid[])
          or granted_by = any(array[${idList}]::uuid[]))
          and exists (
            select 1 from auth.users
            where id = admin_plan_grants.user_id
              and email like 'search-entitlements-${run}-%@example.invalid'
          );
      `);
      for (const user of users.reverse()) {
        const removed = await admin.auth.admin.deleteUser(user.id);
        assert.equal(removed.error, null, "Synthetic Test user cleanup failed");
      }
    }
  }
});
