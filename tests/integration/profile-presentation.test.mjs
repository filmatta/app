import assert from "node:assert/strict";
import { test } from "node:test";
import { withTestUsers, checked, testSql, TEST_REF } from "./test-project.mjs";
test(
  "Test: presentation migration, owner/stranger/anon, publication, filters and legacy compatibility",
  { skip: process.env.FILMATTA_RUN_REMOTE_TESTS !== TEST_REF },
  async () =>
    withTestUsers(async ({ owner, stranger, anon, prefix }) => {
      const city = "QA " + prefix.slice(-8);
      const presentation = {
        portrait_url: "https://example.com/qa.jpg",
        stage_name: "QA Artist",
        work_area: "Zona Poniente",
        rate_range: "MXN 3000",
        book: [{ url: "https://example.com/book.jpg", caption: "QA" }],
        credits: [{ title: "QA Film", role: "Actuación", year: "2026" }],
      };
      const args = {
        p_disciplines: ["Actuación", "Dirección"],
        p_city: city,
        p_bio: "Synthetic QA profile.",
        p_availability: "available",
        p_skills: ["Inglés"],
        p_equipment: [],
        p_portfolio_items: [
          { kind: "reel", title: "QA Reel", url: "https://vimeo.com/76979871" },
        ],
        p_is_public: false,
        p_contact_policy: "members_only",
        p_presentation: presentation,
      };
      const save = (client = owner.client, patch = {}) =>
        client.rpc("save_my_professional_portfolio", { ...args, ...patch });
      const detail = (client, slug) =>
        client.rpc("get_public_professional_portfolio", { p_slug: slug });
      const list = (client, patch = {}) =>
        client.rpc("list_public_professional_portfolios", {
          p_city: city,
          ...patch,
        });
      const slug = checked(await save());
      assert.deepEqual(checked(await detail(anon, slug)), []);
      assert.deepEqual(checked(await detail(stranger.client, slug)), []);
      assert.deepEqual(checked(await list(anon)), []);
      const own = checked(
        await owner.client
          .from("professional_profiles")
          .select("*")
          .eq("user_id", owner.id)
          .single(),
      );
      assert.deepEqual(own.presentation, presentation);
      assert.deepEqual(
        checked(
          await stranger.client
            .from("professional_profiles")
            .select("*")
            .eq("user_id", owner.id),
        ),
        [],
      );
      assert.ok((await anon.from("professional_profiles").select("*")).error);
      assert.ok((await save(anon)).error);
      assert.ok(
        (
          await stranger.client
            .from("professional_profiles")
            .update({ is_public: true })
            .eq("user_id", owner.id)
        ).error,
      );
      assert.ok(
        (
          await owner.client
            .from("professional_profiles")
            .update({ presentation })
            .eq("user_id", owner.id)
        ).error,
      );
      checked(await save(owner.client, { p_is_public: true }));
      const pub = checked(await detail(anon, slug))[0];
      const publicPresentation = { ...presentation, reel_cover_media_id: null };
      assert.deepEqual(pub.presentation, publicPresentation);
      assert.equal(pub.user_id, undefined);
      assert.doesNotMatch(
        JSON.stringify(pub),
        /PrivateSurname|@example.invalid|raw_user_meta_data|email|phone/,
      );
      assert.deepEqual(
        checked(await list(anon, { p_talent: true })).map((x) => x.slug),
        [slug],
      );
      assert.equal(
        checked(await list(anon, { p_discipline: "Modelaje" })).length,
        0,
      );
      assert.equal(
        checked(await list(anon, { p_availability: "unavailable" })).length,
        0,
      );
      assert.equal(
        checked(await list(anon, { p_city: "absent-" + prefix })).length,
        0,
      );
      assert.equal(checked(await list(anon, { p_page: 2 })).length, 0);
      assert.equal(checked(await list(anon))[0].presentation.rate_range, "");
      for (const patch of [
        { private_email: "forbidden" },
        { portrait_url: "javascript:alert(1)" },
        { book: [{ url: "https://example.com/x", caption: "", hidden: "no" }] },
      ]) {
        assert.ok(
          (
            await save(owner.client, {
              p_is_public: false,
              p_presentation: { ...presentation, ...patch },
            })
          ).error,
        );
      }
      assert.equal(checked(await detail(anon, slug))[0].is_public, true);
      const legacy = Object.fromEntries(
        Object.entries(args).filter(([key]) => key !== "p_presentation"),
      );
      assert.equal(
        checked(
          await owner.client.rpc("save_my_professional_profile", {
            ...legacy,
            p_is_public: true,
          }),
        ),
        slug,
      );
      assert.deepEqual(
        checked(await detail(anon, slug))[0].presentation,
        publicPresentation,
      );
      assert.equal(
        checked(
          await anon.rpc("get_public_professional_profile", { p_slug: slug }),
        )[0].slug,
        slug,
      );
      assert.equal(
        checked(
          await anon.rpc("list_public_professional_profiles", { p_city: city }),
        )[0].slug,
        slug,
      );
      checked(
        await save(stranger.client, {
          p_disciplines: ["Edición"],
          p_is_public: true,
        }),
      );
      assert.equal(checked(await list(anon)).length, 2);
      assert.deepEqual(
        checked(await list(anon, { p_talent: true })).map((x) => x.slug),
        [slug],
      );
      checked(await save(owner.client, { p_is_public: false }));
      assert.deepEqual(checked(await detail(anon, slug)), []);
      assert.equal(checked(await list(anon, { p_talent: true })).length, 0);
      const schema = testSql(
        "select relrowsecurity from pg_class where oid='public.professional_profiles'::regclass;",
      );
      assert.equal(schema[0].relrowsecurity, true);
    }),
);
