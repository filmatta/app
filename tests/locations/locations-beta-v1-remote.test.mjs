import assert from "node:assert/strict";
import { test } from "node:test";
import { checked, testSql, withTestUsers } from "../integration/test-project.mjs";

test("Locations Beta V1 persists and enforces owner and protected public projection in Test", async () =>
  withTestUsers(async ({ prefix, anon, owner, stranger }) => {
    const historicalTourUrl = "https://www.youtube.com/watch?v=abcdefghijk";
    const replacementTourUrl = "https://vimeo.com/123456";
    const rejectedExternal = await owner.client.from("locations").insert({
      owner_id: owner.id,
      title: "QA · Recorrido externo rechazado",
      slug: `${prefix}-external-tour-rejected`,
      city: "Ciudad QA",
      space_type: "Estudio",
      environment: "interior",
      tour_video_url: replacementTourUrl,
      status: "draft",
    }).select("id").single();
    assert.equal(rejectedExternal.error?.code, "42501");

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
      operational_notes: "Visita técnica y depósito a acordar.",
      status: "draft",
    }).select("id,slug").single());

    assert.match(draft.id, /^[0-9a-f-]{36}$/i);
    assert.match(owner.id, /^[0-9a-f-]{36}$/i);
    const seededHistoricalTour = testSql(`
      update public.locations
      set tour_video_url='${historicalTourUrl}'
      where id='${draft.id}' and owner_id='${owner.id}'
      returning tour_video_url;
    `);
    assert.deepEqual(seededHistoricalTour, [{ tour_video_url: historicalTourUrl }]);
    const retainedHistoricalTour = checked(await owner.client.from("locations")
      .update({ title: "QA · Locación Beta privada actualizada", tour_video_url: historicalTourUrl })
      .eq("id", draft.id).select("tour_video_url").single());
    assert.equal(retainedHistoricalTour.tour_video_url, historicalTourUrl);

    const forged = await stranger.client.from("locations").update({ title: "Cambio ajeno" }).eq("id", draft.id).select("id");
    assert.equal(forged.error, null);
    assert.equal(forged.data.length, 0);
    assert.equal(checked(await anon.rpc("get_public_location", { p_slug: draft.slug })), null);

    checked(await owner.client.rpc("save_my_location_contact_channels", {
      p_location_id: draft.id,
      p_channels: { email: "qa-location@example.invalid" },
    }));

    checked(await owner.client.from("locations").update({ status: "published" }).eq("id", draft.id).select("id").single());
    const hidden = checked(await anon.rpc("get_public_location", { p_slug: draft.slug }));
    assert.equal(hidden.contact, undefined);
    assert.equal(hidden.contact_available, true);
    assert.equal(hidden.owner_id, undefined);
    assert.equal(hidden.characteristics.surface_m2, 125.5);
    assert.deepEqual(hidden.shooting_conditions, { day_shoots: "yes", pyrotechnics: "consult" });
    assert.equal(hidden.photos.length, 0);

    const direct = await anon.from("locations").select("owner_id").eq("id", draft.id);
    assert.ok(direct.error);
    const directPhotos = await anon.from("location_photos").select("storage_path").eq("location_id", draft.id);
    assert.ok(directPhotos.error);

    const visible = checked(await anon.rpc("get_public_location", { p_slug: draft.slug }));
    assert.equal(visible.contact, undefined);
    assert.equal(JSON.stringify(visible).includes("qa-location@example.invalid"), false);
    assert.equal(visible.tour_video_url, historicalTourUrl);

    const rejectedReplacement = await owner.client.from("locations")
      .update({ tour_video_url: replacementTourUrl }).eq("id", draft.id).select("id").single();
    assert.equal(rejectedReplacement.error?.code, "42501");
    const preserved = checked(await anon.rpc("get_public_location", { p_slug: draft.slug }));
    assert.equal(preserved.tour_video_url, historicalTourUrl);
  }));
