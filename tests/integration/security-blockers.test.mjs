import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { totp } from "../totp.mjs";
import { createClient } from "@supabase/supabase-js";
import { withTestUsers, testConfiguration, testSql } from "./test-project.mjs";

test("Test only: real JWT MFA, RLS/Storage and distributed publication quotas", async () => {
  await withTestUsers(async ({ owner, stranger, admin, prefix }) => {
    const config = testConfiguration();
    const setup = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const courseIds = [];
    const storagePaths = [];
    const key = `security-qa:${randomUUID()}`;
    try {
      for (const user of [owner, admin]) {
        for (const level of ["aal1", "aal2"]) {
          if (level === "aal1") {
            assert.equal((await user.client.auth.updateUser({ password: randomBytes(24).toString("base64url") + "aA1!" })).error, null);
          }
          if (level === "aal2") {
            const enrolled = await user.client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Security QA" });
            assert.equal(enrolled.error, null, "Test MFA enrollment failed");
            const verified = await user.client.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret) });
            assert.equal(verified.error, null, "Test TOTP verification failed");
          }
          const assurance = await user.client.auth.mfa.getAuthenticatorAssuranceLevel();
          assert.equal(assurance.data.currentLevel, level);
          const allowed = user === admin && level === "aal2";
          const course = await user.client.from("courses").insert({ title: "Security QA", slug: `${prefix}-${user.kind}-${level}`, status: "draft" }).select("id").single();
          if (course.data?.id) courseIds.push(course.data.id);
          assert.equal(course.error === null, allowed, `${user.kind}/${level} course RLS`);
          const objectPath = `security-qa/${prefix}-${user.kind}-${level}.png`;
          const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=", "base64");
          const uploaded = await user.client.storage.from("course-covers").upload(objectPath, png, { contentType: "image/png" });
          if (!uploaded.error) storagePaths.push(objectPath);
          assert.equal(uploaded.error === null, allowed, `${user.kind}/${level} Storage RLS`);
        }
      }
      const calls = await Promise.all(Array.from({ length: 6 }, () => setup.rpc("consume_auth_rate_limit", { p_key: key, p_limit: 3, p_seconds: 60 })));
      assert.ok(calls.every(r => !r.error), "Rate counter RPC failed");
      assert.equal(calls.filter(r => r.data).length, 3, "Concurrent budget must be atomic");
      assert.ok((await owner.client.rpc("consume_auth_rate_limit", { p_key: key, p_limit: 1000, p_seconds: 60 })).error, "User cannot choose a quota");

      const payload = { title: "Security QA service", category: "other", description: "Temporary isolated security quota validation listing.", work_mode: "remote" };
      let firstId;
      for (let i = 0; i < 20; i++) {
        const result = await owner.client.rpc("save_my_service", { p_id: null, p_data: payload, p_status: "published" });
        assert.equal(result.error, null, "Configured publication budget should allow twenty");
        firstId ??= result.data;
      }
      for (let i = 0; i < 3; i++) assert.equal((await owner.client.rpc("save_my_service", { p_id: firstId, p_data: payload, p_status: "published" })).error, null, "Retry cannot count twice");
      const denied = await owner.client.rpc("save_my_service", { p_id: null, p_data: payload, p_status: "published" });
      assert.match(denied.error?.message ?? "", /PUBLICATION_LIMIT_REACHED/);
      const direct = await owner.client.from("service_listings").insert({ ...payload, slug: `${prefix}-direct`, status: "published" });
      assert.match(direct.error?.message ?? "", /PUBLICATION_LIMIT_REACHED/);
      assert.equal((await stranger.client.rpc("save_my_service", { p_id: null, p_data: payload, p_status: "published" })).error, null, "A cannot exhaust B's quota");
    } finally {
      if (storagePaths.length) assert.equal((await setup.storage.from("course-covers").remove(storagePaths)).error, null);
      for (const id of courseIds) {
        assert.match(id, /^[0-9a-f-]{36}$/);
        testSql(`delete from public.courses where id='${id}' and slug like '${prefix}-%';`);
      }
      testSql(`delete from private.auth_rate_buckets where key='${key}';`);
    }
  });
});

