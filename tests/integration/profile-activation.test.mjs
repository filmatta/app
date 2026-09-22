// Auth/RLS integration, opt-in Test only. Credentials remain in memory; fixtures always removed.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_CLI,
  TEST_REF,
  testSql,
} from "../../tools/portfolio-test-context.mjs";
test(
  "profile activation persists steps with real Auth and owner-only RLS",
  { skip: process.env.FILMATTA_RUN_REMOTE_TESTS !== TEST_REF },
  async () => {
    let keys;
    try {
      keys = JSON.parse(
        execFileSync(
          SUPABASE_CLI,
          [
            "projects",
            "api-keys",
            "--project-ref",
            TEST_REF,
            "--reveal",
            "--output",
            "json",
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      );
    } catch {
      throw Error("Cannot obtain Test credentials");
    }
    const anonKey = keys.find((k) => k.name === "anon").api_key,
      serviceKey = keys.find((k) => k.name === "service_role").api_key;
    assert.equal(
      JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url")).ref,
      TEST_REF,
    );
    const client = (key) =>
      createClient(`https://${TEST_REF}.supabase.co`, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const admin = client(serviceKey),
      owner = client(anonKey),
      other = client(anonKey),
      anon = client(anonKey),
      ids = [];
    const ok = (r) =>
      assert.equal(r.error, null, r.error?.code ?? "request failed");
    const save = async (step, patch) => {
      const r = await owner.rpc("save_my_profile_onboarding", {
        p_step: step,
        p_patch: patch,
      });
      ok(r);
    };
    try {
      for (const db of [owner, other]) {
        const email = `activation-${randomUUID()}@example.invalid`,
          password = `QA-${randomUUID()}!`;
        const r = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Activación QA" },
        });
        ok(r);
        ids.push(r.data.user.id);
        ok(await db.auth.signInWithPassword({ email, password }));
      }
      assert.ok(
        (
          await anon.rpc("save_my_profile_onboarding", {
            p_step: 1,
            p_patch: { name: "Anon" },
          })
        ).error,
      );
      assert.ok(
        (
          await owner.rpc("save_my_profile_onboarding", {
            p_step: 6,
            p_patch: {},
          })
        ).error,
      );
      await save(1, { name: "Activación · QA", alias: "Alternativo" });
      let settings = await owner
        .from("profile_private_settings")
        .select("*")
        .eq("owner_id", ids[0])
        .single();
      ok(settings);
      assert.equal(settings.data.onboarding_step, 2);
      assert.equal(settings.data.onboarding_identity.name, "Activación · QA");
      assert.equal(
        (
          await other
            .from("profile_private_settings")
            .select("owner_id")
            .eq("owner_id", ids[0])
        ).data.length,
        0,
      );
      assert.ok(
        (
          await other
            .from("profile_private_settings")
            .update({ onboarding_step: 7 })
            .eq("owner_id", ids[0])
        ).error,
      );
      await save(2, { disciplines: ["Actuación", "Dirección"] });
      let pr = await owner
        .from("professional_profiles")
        .select("*")
        .eq("user_id", ids[0])
        .single();
      ok(pr);
      const slug = pr.data.slug;
      assert.equal(pr.data.is_public, false);
      assert.equal(
        (await anon.rpc("get_public_professional_portfolio", { p_slug: slug }))
          .data.length,
        0,
      );
      await save(3, { city: "Guadalajara", work_area: "Poniente" });
      await save(4, {});
      await save(5, { availability: "limited" });
      await save(6, { night: "consult", travel: "accept" });
      settings = await owner
        .from("profile_private_settings")
        .select("*")
        .eq("owner_id", ids[0])
        .single();
      assert.ok(settings.data.onboarding_completed_at);
      assert.equal(settings.data.publish_project_preferences, false);
      assert.equal(settings.data.onboarding_step, 7);
      await save(4, { bio: "Experiencia en cortometrajes." });
      await save(4, {});
      pr = await owner
        .from("professional_profiles")
        .select("*")
        .eq("user_id", ids[0])
        .single();
      assert.equal(pr.data.bio, "Experiencia en cortometrajes.");
      assert.deepEqual(pr.data.disciplines, ["Actuación", "Dirección"]);
      assert.equal(pr.data.city, "Guadalajara");
      assert.ok(
        (
          await owner.rpc("save_my_profile_onboarding", {
            p_step: 1,
            p_patch: { name: "Spoof", user_id: ids[1] },
          })
        ).error,
      );
      assert.ok(
        (
          await owner.rpc("save_my_profile_onboarding", {
            p_step: 7,
            p_patch: { publish: false },
          })
        ).error,
      );
      await save(7, { publish: true });
      assert.equal(
        (await anon.rpc("get_public_professional_portfolio", { p_slug: slug }))
          .data.length,
        1,
      );
      assert.ok(
        (
          await other
            .from("professional_profiles")
            .update({ bio: "spoof" })
            .eq("user_id", ids[0])
        ).error,
      );
      ok(await owner.rpc("finish_my_profile_tour"));
      const first = (
        await owner
          .from("profile_private_settings")
          .select("profile_tour_completed_at")
          .eq("owner_id", ids[0])
          .single()
      ).data.profile_tour_completed_at;
      ok(await owner.rpc("finish_my_profile_tour"));
      assert.equal(
        (
          await owner
            .from("profile_private_settings")
            .select("profile_tour_completed_at")
            .eq("owner_id", ids[0])
            .single()
        ).data.profile_tour_completed_at,
        first,
      );
    } finally {
      for (const id of ids) {
        ok(await admin.auth.admin.deleteUser(id));
      }
      const counts = testSql(
        `select (select count(*) from public.professional_profiles where user_id=any(array[${ids.map((id) => "'" + id + "'::uuid").join(",")}]::uuid[])) + (select count(*) from public.profile_private_settings where owner_id=any(array[${ids.map((id) => "'" + id + "'::uuid").join(",")}]::uuid[])) as residues`,
      );
      assert.equal(Number(counts[0].residues), 0);
    }
  },
);
