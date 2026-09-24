import assert from "node:assert/strict";
import { test } from "node:test";
import { checked, withTestUsers } from "../integration/test-project.mjs";

test("Locations Beta V1 persists and enforces owner, public projection and explicit contact in Test", async () =>
  withTestUsers(async ({ prefix, anon, owner, stranger }) => {
    const draft = checked(await owner.client.from("locations").insert({
      owner_id: owner.id,
      title: "QA · Locación Beta privada",
      slug: `${prefix}-location-draft`,
      city: "Ciudad QA",
      area: "Zona aproximada",
      space_type: "Estudio",
      environment: "interior",
      characteristics: { surface_m2: 125.5, wifi: true },
      shooting_conditions: { day_shoots: "yes", pyrotechnics: "consult" },
      tour_video_url: "https://www.youtube.com/watch?v=abcdefghijk",
      operational_notes: "Visita técnica y depósito a acordar.",
      status: "draft",
    }).select("id,slug").single());

    const forged = await stranger.client.from("locations").update({ title: "Cambio ajeno" }).eq("id", draft.id).select("id");
    assert.equal(forged.error, null);
    assert.equal(forged.data.length, 0);
    assert.equal(checked(await anon.rpc("get_public_location", { p_slug: draft.slug })), null);

    checked(await owner.client.from("location_public_contacts").insert({
      location_id: draft.id,
      owner_id: owner.id,
      email: "qa-location@example.invalid",
      is_public: false,
    }));
    checked(await owner.client.from("location_photos").insert({
      location_id: draft.id,
      owner_id: owner.id,
      image_url: "https://example.invalid/location.jpg",
      alt_text: "Imagen sintética de QA",
      status: "published",
      sort_order: 0,
    }));

    checked(await owner.client.from("locations").update({ status: "published" }).eq("id", draft.id).select("id").single());
    const hidden = checked(await anon.rpc("get_public_location", { p_slug: draft.slug }));
    assert.equal(hidden.contact, null);
    assert.equal(hidden.owner_id, undefined);
    assert.equal(hidden.characteristics.surface_m2, 125.5);
    assert.deepEqual(hidden.shooting_conditions, { day_shoots: "yes", pyrotechnics: "consult" });
    assert.equal(hidden.photos.length, 1);

    const direct = await anon.from("locations").select("owner_id").eq("id", draft.id);
    assert.ok(direct.error);
    const directPhotos = await anon.from("location_photos").select("storage_path").eq("location_id", draft.id);
    assert.ok(directPhotos.error);

    checked(await owner.client.from("location_public_contacts").update({ is_public: true }).eq("location_id", draft.id).select("location_id").single());
    const visible = checked(await anon.rpc("get_public_location", { p_slug: draft.slug }));
    assert.equal(visible.contact.email, "qa-location@example.invalid");

    checked(await owner.client.from("locations").update({ tour_video_url: "https://vimeo.com/123456" }).eq("id", draft.id).select("id").single());
    const replaced = checked(await anon.rpc("get_public_location", { p_slug: draft.slug }));
    assert.equal(replaced.tour_video_url, "https://vimeo.com/123456");
  }));
