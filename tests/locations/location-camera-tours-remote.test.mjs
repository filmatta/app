import assert from "node:assert/strict";
import { test } from "node:test";
import { checked, withTestUsers } from "../integration/test-project.mjs";

test("camera tour reservation is atomic, owner-scoped and provider-managed in Test", async () =>
  withTestUsers(async ({ prefix, owner, stranger }) => {
    const location = checked(await owner.client.from("locations").insert({
      owner_id: owner.id,
      title: "QA recorrido con cámara",
      slug: `${prefix}-camera-tour`,
      city: "Ciudad QA",
      space_type: "Casa",
      environment: "interior",
      rate_mode: "inquire",
      status: "draft",
    }).select("id,tour_generation,active_tour_attempt_id").single());

    const first = checked(await owner.client.rpc("reserve_my_location_tour", {
      p_location_id: location.id,
      p_blob_bytes: 1024,
      p_mime_type: "video/webm;codecs=vp8,opus",
    }));
    assert.equal(first.length, 1);
    assert.equal(first[0].can_create_upload, true);

    const retry = checked(await owner.client.rpc("reserve_my_location_tour", {
      p_location_id: location.id,
      p_blob_bytes: 2048,
      p_mime_type: "video/webm",
    }));
    assert.equal(retry[0].attempt_id, first[0].attempt_id);
    assert.equal(retry[0].can_create_upload, false);

    const foreignReserve = await stranger.client.rpc("reserve_my_location_tour", {
      p_location_id: location.id,
      p_blob_bytes: 1024,
      p_mime_type: "video/webm",
    });
    assert.equal(foreignReserve.error?.code, "42501");

    const ownerRows = checked(await owner.client.from("location_tour_attempts").select("id,status,generation").eq("location_id", location.id));
    assert.equal(ownerRows.length, 1);
    const hiddenRows = checked(await stranger.client.from("location_tour_attempts").select("id").eq("location_id", location.id));
    assert.equal(hiddenRows.length, 0);

    const forgedPointer = await owner.client.from("locations").update({ active_tour_attempt_id: first[0].attempt_id }).eq("id", location.id);
    assert.equal(forgedPointer.error?.code, "42501");
    const forgedExternal = await owner.client.from("locations").update({ tour_video_url: "https://vimeo.com/123456" }).eq("id", location.id);
    assert.equal(forgedExternal.error?.code, "42501");
    const directAttempt = await owner.client.from("location_tour_attempts").insert({
      location_id: location.id, owner_id: owner.id, generation: 99,
      declared_blob_bytes: 10, declared_mime_type: "video/webm",
    });
    assert.equal(directAttempt.error?.code, "42501");
    const forgedPromotion = await owner.client.rpc("promote_location_tour", {
      p_attempt_id: first[0].attempt_id, p_generation: 1, p_upload_id: "fakeUpload",
      p_asset_id: "fakeAsset", p_playback_id: "fakePlayback",
      p_environment_id: "development", p_environment_type: "development",
      p_duration_seconds: 10, p_aspect_ratio: "16:9", p_has_audio: true,
    });
    assert.equal(forgedPromotion.error?.code, "42501");

    const tooLarge = await owner.client.rpc("reserve_my_location_tour", {
      p_location_id: location.id, p_blob_bytes: 150_000_001, p_mime_type: "video/webm",
    });
    assert.equal(tooLarge.error?.code, "22023");

    assert.equal(checked(await owner.client.rpc("cancel_my_location_tour_reservation", { p_attempt_id: first[0].attempt_id })), true);
  }));
