import assert from "node:assert/strict";
import test from "node:test";
import { withTestUsers, checked } from "./test-project.mjs";

test("real Test Auth/PostgREST: public Profiles and Opportunities owner lifecycle", async () => {
  await withTestUsers(async ({ prefix, anon, owner, stranger, admin }) => {
    const profileData = {
      p_disciplines: ["Actuación"],
      p_city: prefix,
      p_bio: "Perfil de integración desechable",
      p_availability: "available",
      p_skills: [],
      p_equipment: [],
      p_portfolio_items: [],
      p_is_public: true,
      p_contact_policy: "members_only",
    };
    const slug = checked(
      await owner.client.rpc("save_my_professional_profile", profileData),
    );
    const privateSlug = checked(
      await stranger.client.rpc("save_my_professional_profile", {
        ...profileData,
        p_is_public: false,
      }),
    );
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    const filter = {
      p_page: 1,
      p_city: prefix,
      p_discipline: "Actuación",
      p_availability: "available",
      p_talent: true,
    };
    for (const viewer of [anon, owner.client, stranger.client, admin.client]) {
      const rows = checked(
        await viewer.rpc("list_public_professional_profiles", filter),
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].slug, slug);
      assert.deepEqual(
        Object.keys(rows[0]).sort(),
        [
          "slug",
          "display_name",
          "disciplines",
          "city",
          "bio",
          "availability",
          "updated_at",
        ].sort(),
      );
      assert.ok(!JSON.stringify(rows).includes(owner.email));
      assert.ok(!JSON.stringify(rows).includes(owner.fullName));
      assert.equal(
        checked(
          await viewer.rpc("list_public_professional_profiles", {
            ...filter,
            p_discipline: "Modelaje",
          }),
        ).length,
        0,
      );
    }
    assert.equal(
      checked(
        await anon.rpc("get_public_professional_profile", { p_slug: slug }),
      ).length,
      1,
    );
    assert.equal(
      checked(
        await anon.rpc("get_public_professional_profile", {
          p_slug: privateSlug,
        }),
      ).length,
      0,
    );
    assert.equal(
      checked(
        await stranger.client
          .from("professional_profiles")
          .select("slug")
          .eq("user_id", owner.id),
      ).length,
      0,
    );
    assert.ok(
      (await anon.from("professional_profiles").select("user_id")).error,
    );
    assert.ok(
      (
        await stranger.client
          .from("professional_profiles")
          .update({ bio: "cross-owner" })
          .eq("user_id", owner.id)
      ).error,
    );
    assert.ok(
      (await anon.rpc("save_my_professional_profile", profileData)).error,
    );

    const brief = {
      title: `Test ${prefix}`,
      category: "crew",
      description: "Convocatoria temporal para verificar permisos reales.",
      city: prefix,
      work_mode: "remote",
      compensation_type: "paid",
      compensation_min: 1000,
      compensation_max: 2000,
      compensation_currency: "MXN",
    };
    const args = {
      p_id: null,
      p_data: { ...brief, owner_id: stranger.id },
      p_project_title: `Test ${prefix}`,
      p_status: "draft",
    };
    assert.ok((await anon.rpc("save_my_opportunity", args)).error);
    const id = checked(await owner.client.rpc("save_my_opportunity", args));
    const row = checked(
      await owner.client
        .from("opportunities")
        .select("id,owner_id,slug,project_id,status")
        .eq("id", id)
        .single(),
    );
    assert.equal(row.owner_id, owner.id);
    assert.equal(row.status, "draft");
    for (const viewer of [anon, stranger.client])
      assert.equal(
        checked(await viewer.from("opportunities").select("id").eq("id", id))
          .length,
        0,
      );
    assert.equal(
      checked(
        await admin.client.from("opportunities").select("id").eq("id", id),
      ).length,
      1,
    );
    assert.ok(
      (
        await stranger.client.rpc("save_my_opportunity", {
          ...args,
          p_id: id,
          p_status: "published",
        })
      ).error,
    );
    assert.equal(
      checked(
        await stranger.client
          .from("opportunities")
          .update({ title: "cross-owner" })
          .eq("id", id)
          .select("id"),
      ).length,
      0,
    );
    assert.ok(
      (
        await stranger.client
          .from("opportunities")
          .insert({
            owner_id: owner.id,
            project_id: row.project_id,
            title: "Forged owner",
            slug: `forged-${prefix}`,
            category: "crew",
          })
      ).error,
    );
    checked(
      await owner.client.rpc("save_my_opportunity", {
        ...args,
        p_id: id,
        p_data: { ...brief, title: "Edited integration opportunity" },
        p_status: "published",
      }),
    );
    const published = checked(
      await anon
        .from("opportunities")
        .select("id,slug,title,projects!inner(id,title,slug)")
        .eq("id", id)
        .eq("status", "published")
        .eq("projects.status", "published"),
    );
    assert.equal(published.length, 1);
    assert.equal(published[0].slug, row.slug);
    assert.equal(published[0].title, "Edited integration opportunity");
    assert.ok(published[0].projects.id);
    for (const status of ["closed", "published", "archived"]) {
      checked(
        await owner.client.rpc("save_my_opportunity", {
          ...args,
          p_id: id,
          p_status: status,
        }),
      );
      assert.equal(
        checked(await anon.from("opportunities").select("id").eq("id", id))
          .length,
        status === "published" ? 1 : 0,
      );
    }
    assert.ok(
      (
        await owner.client.rpc("save_my_opportunity", {
          ...args,
          p_data: { ...brief, compensation_min: -1 },
        })
      ).error,
    );
    checked(
      await owner.client.rpc("save_my_professional_profile", {
        ...profileData,
        p_is_public: false,
      }),
    );
    assert.equal(
      checked(await anon.rpc("list_public_professional_profiles", filter))
        .length,
      0,
    );
    console.log(
      "Verified Profiles public/private projection, filters, slugs and Opportunities CRUD/status/ownership using real Test Auth + PostgREST.",
    );
  });
});
