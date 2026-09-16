import test from "node:test";
import assert from "node:assert/strict";
import { withTestUsers, checked } from "./test-project.mjs";
test("real Test Services lifecycle and private inquiries enforce RLS and column grants", async () =>
  withTestUsers(async ({ prefix, anon, owner, stranger, admin, outsider }) => {
    const values = {
      title: `Servicio ${prefix}`,
      category: "sound",
      description:
        "Sonido directo para una producción audiovisual de prueba aislada.",
      city: prefix,
      work_mode: "on_site",
      indicative_price: 1500.25,
      currency: "MXN",
      portfolio_links: [
        { label: "Muestra de trabajo", url: "https://example.com/work" },
      ],
    };
    const args = { p_id: null, p_data: values, p_status: "draft" };
    assert.ok((await anon.rpc("save_my_service", args)).error);
    const id = checked(await owner.client.rpc("save_my_service", args));
    const row = checked(
      await owner.client
        .from("service_listings")
        .select("id,slug,owner_user_id")
        .eq("id", id)
        .single(),
    );
    assert.equal(row.owner_user_id, owner.id);
    assert.equal(
      checked(
        await anon.from("service_listings").select("id,slug").eq("id", id),
      ).length,
      0,
    );
    assert.ok(
      (await anon.from("service_listings").select("owner_user_id")).error,
    );
    assert.ok(
      (
        await stranger.client.rpc("save_my_service", {
          ...args,
          p_id: id,
          p_status: "published",
        })
      ).error,
    );
    assert.equal(
      checked(
        await stranger.client
          .from("service_listings")
          .update({ title: "Forged change" })
          .eq("id", id)
          .select("id"),
      ).length,
      0,
    );
    checked(
      await owner.client.rpc("save_my_service", {
        ...args,
        p_id: id,
        p_status: "published",
      }),
    );
    const publicRows = checked(
      await anon
        .from("service_listings")
        .select("id,slug,title,city,category,indicative_price")
        .eq("category", "sound")
        .eq("city", prefix)
        .order("published_at", { ascending: false })
        .order("id")
        .range(0, 24),
    );
    assert.equal(publicRows.length, 1);
    assert.equal(publicRows[0].slug, row.slug);
    const profile = {
      p_disciplines: ["Sonido"],
      p_city: prefix,
      p_bio: "Integración real Test",
      p_availability: "available",
      p_skills: [],
      p_equipment: [],
      p_portfolio_items: [],
      p_is_public: true,
      p_contact_policy: "members_only",
    };
    assert.ok(
      (
        await stranger.client.rpc("send_service_inquiry", {
          p_slug: row.slug,
          p_message: "Consulta privada de integración sobre este servicio.",
        })
      ).error,
    );
    checked(await stranger.client.rpc("save_my_professional_profile", profile));
    const inquiry = checked(
      await stranger.client.rpc("send_service_inquiry", {
        p_slug: row.slug,
        p_message: "Consulta privada de integración sobre este servicio.",
      }),
    );
    assert.ok((await anon.from("catalog_inquiries").select("message")).error);
    assert.equal(checked(await outsider.client.from('catalog_inquiries').select('id,message').eq('id',inquiry)).length,0);
    assert.equal(checked(await outsider.client.rpc('list_my_catalog_inquiries',{p_page:1})).length,0);
    assert.equal(
      checked(
        await stranger.client
          .from("catalog_inquiries")
          .update({ status: "accepted" })
          .eq("id", inquiry)
          .select("id"),
      ).length,
      0,
    );
    assert.ok(
      (
        await owner.client
          .from("catalog_inquiries")
          .update({ sender_id: owner.id })
          .eq("id", inquiry)
      ).error,
    );
    checked(
      await owner.client
        .from("catalog_inquiries")
        .update({ status: "accepted" })
        .eq("id", inquiry),
    );
    assert.equal(
      checked(
        await stranger.client.rpc("list_my_catalog_inquiries", { p_page: 1 }),
      )[0].status,
      "accepted",
    );
    assert.ok(
      (
        await stranger.client.rpc("send_service_inquiry", {
          p_slug: row.slug,
          p_message: "No se permite duplicar esta consulta privada.",
        })
      ).error,
    );
    checked(
      await owner.client.rpc("save_my_service", {
        ...args,
        p_id: id,
        p_status: "draft",
      }),
    );
    assert.equal(
      checked(await anon.from("service_listings").select("id").eq("id", id))
        .length,
      0,
    );
    assert.equal(
      checked(
        await stranger.client.rpc("list_my_catalog_inquiries", { p_page: 1 }),
      )[0].target_href,
      null,
    );
    assert.equal(
      checked(
        await admin.client.from("service_listings").select("id").eq("id", id),
      ).length,
      1,
    );
    checked(
      await owner.client.rpc("save_my_service", {
        ...args,
        p_id: id,
        p_status: "archived",
      }),
    );
    assert.ok(
      (
        await owner.client.rpc("save_my_service", {
          ...args,
          p_data: {
            ...values,
            portfolio_links: [{ label: "Unsafe", url: "javascript:alert(1)" }],
          },
        })
      ).error,
    );
  }));
