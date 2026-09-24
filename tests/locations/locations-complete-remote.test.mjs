import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { checked, testConfiguration, testSql, withTestUsers } from "../integration/test-project.mjs";

const config = testConfiguration();
const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const storedPaths = [];

function location(prefix, ownerId, suffix, status = "published") {
  return {
    owner_id: ownerId,
    title: `QA Location ${suffix}`,
    slug: `${prefix}-${suffix}`,
    city: "Ciudad QA",
    space_type: "Estudio",
    environment: "interior",
    status,
  };
}

async function reserve(user, locationId, key = randomUUID()) {
  return user.client.rpc("reserve_my_location_photo", {
    p_location_id: locationId,
    p_size: 4,
    p_mime: "image/jpeg",
    p_extension: "jpg",
    p_idempotency_key: key,
  });
}

async function send(user, slug, message = "Producción sintética de QA para consultar disponibilidad.", key = randomUUID()) {
  return user.client.rpc("send_location_contact_request", {
    p_slug: slug,
    p_message: message,
    p_idempotency_key: key,
  });
}

test("Supabase Test enforces Location photo lifecycle and isolated contact credits", async () =>
  withTestUsers(async ({ prefix, anon, owner, stranger, outsider }) => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const photoLocation = checked(await owner.client.from("locations").insert(location(prefix, owner.id, "photos", "draft")).select("id,slug").single());
    checked(await owner.client.rpc("save_my_location_contact_channels", { p_location_id: photoLocation.id, p_channels: { email: "location-qa@example.invalid", website: "https://example.invalid/legacy" } }));

    assert.ok((await owner.client.storage.from("location-photos").upload(`${owner.id}/${photoLocation.id}/${randomUUID()}/original.jpg`, jpeg, { contentType: "image/jpeg" })).error, "direct unreserved upload blocked");
    const retryKey = randomUUID();
    const retryReservation = checked(await reserve(owner, photoLocation.id, retryKey));
    assert.equal(checked(await reserve(owner, photoLocation.id, retryKey)).id, retryReservation.id, "reservation retry is idempotent");
    const reserved = checked(await reserve(owner, photoLocation.id));
    assert.ok((await outsider.client.storage.from("location-photos").upload(reserved.path, jpeg, { contentType: "image/jpeg" })).error, "foreign reserved path blocked");
    checked(await owner.client.storage.from("location-photos").upload(reserved.path, jpeg, { contentType: "image/jpeg", upsert: false }));
    storedPaths.push(reserved.path);
    assert.equal(checked(await admin.rpc("attest_location_photo", { p_id: reserved.id, p_owner: owner.id, p_valid: true, p_actual_size: 4, p_actual_mime: "image/jpeg" })), true);
    assert.equal(checked(await anon.rpc("get_public_location", { p_slug: photoLocation.slug })), null, "draft remains private");

    const pending = [];
    for (let index = 0; index < 17; index++) pending.push(checked(await reserve(owner, photoLocation.id)));
    const concurrent = await Promise.all([reserve(owner, photoLocation.id), reserve(owner, photoLocation.id)]);
    assert.equal(concurrent.filter((result) => !result.error).length, 1, "only one concurrent reservation gets slot 20");
    assert.equal(concurrent.filter((result) => result.error?.code === "LPH01").length, 1);
    assert.equal((await reserve(owner, photoLocation.id)).error?.code, "LPH01", "photo 21 rejected");
    assert.equal((await owner.client.rpc("reserve_my_location_photo", { p_location_id: photoLocation.id, p_size: 10_000_001, p_mime: "image/jpeg", p_extension: "jpg", p_idempotency_key: randomUUID() })).error?.code, "22023");
    assert.equal((await owner.client.rpc("reserve_my_location_photo", { p_location_id: photoLocation.id, p_size: 4, p_mime: "image/gif", p_extension: "gif", p_idempotency_key: randomUUID() })).error?.code, "22023");

    checked(await owner.client.from("locations").update({ status: "published" }).eq("id", photoLocation.id).select("id").single());
    const published = checked(await anon.rpc("get_public_location", { p_slug: photoLocation.slug }));
    assert.equal(published.photos.length, 1);
    assert.equal(published.photos[0].managed, true);
    assert.equal(published.contact, undefined);
    assert.equal(JSON.stringify(published).includes("location-qa@example.invalid"), false);
    assert.ok((await anon.storage.from("location-photos").download(reserved.path)).error, "bucket is not directly public");
    checked(await owner.client.from("locations").update({ status: "draft" }).eq("id", photoLocation.id).select("id").single());
    assert.equal(checked(await anon.rpc("get_public_location", { p_slug: photoLocation.slug })), null);
    const afterUnpublish = await owner.client.from("location_photos").select("id", { count: "exact", head: true }).eq("location_id", photoLocation.id);
    assert.equal(afterUnpublish.error, null);
    assert.equal(afterUnpublish.count, 20, "publishing and unpublishing do not change quota occupancy");

    const second = pending[0];
    checked(await owner.client.storage.from("location-photos").upload(second.path, jpeg, { contentType: "image/jpeg", upsert: false }));
    storedPaths.push(second.path);
    assert.equal(checked(await admin.rpc("attest_location_photo", { p_id: second.id, p_owner: owner.id, p_valid: true, p_actual_size: 4, p_actual_mime: "image/jpeg" })), true);
    checked(await owner.client.rpc("manage_my_location_photo", { p_id: second.id, p_action: "cover" }));
    let ready = checked(await owner.client.from("location_photos").select("id,is_cover,sort_order").eq("location_id", photoLocation.id).eq("lifecycle_status", "ready").order("sort_order"));
    assert.equal(ready.find((row) => row.id === second.id).is_cover, true);
    checked(await owner.client.rpc("manage_my_location_photo", { p_id: second.id, p_action: "up" }));
    ready = checked(await owner.client.from("location_photos").select("id,sort_order").eq("location_id", photoLocation.id).eq("lifecycle_status", "ready").order("sort_order"));
    assert.equal(ready[0].id, second.id);

    const begun = checked(await owner.client.rpc("begin_my_location_photo_delete", { p_id: second.id }));
    assert.equal(checked(await admin.rpc("attest_location_photo_deletion", { p_id: second.id, p_success: false })), false);
    assert.equal(checked(await owner.client.from("location_photos").select("lifecycle_status").eq("id", second.id).single()).lifecycle_status, "delete_failed");
    checked(await owner.client.rpc("begin_my_location_photo_delete", { p_id: second.id }));
    checked(await admin.storage.from("location-photos").remove([begun.path]));
    assert.equal(checked(await admin.rpc("attest_location_photo_deletion", { p_id: second.id, p_success: true })), true);

    const abandonedLocation = checked(await owner.client.from("locations").insert(location(prefix, owner.id, "abandoned", "draft")).select("id").single());
    const abandoned = checked(await reserve(owner, abandonedLocation.id));
    testSql(`update public.location_photos set expires_at=now()-interval '1 minute' where id='${abandoned.id}' and owner_id='${owner.id}'`);
    const cleanup = checked(await owner.client.rpc("claim_my_location_photo_cleanup", { p_location_id: abandonedLocation.id }));
    assert.equal(cleanup.length, 1);
    assert.equal(checked(await admin.rpc("attest_location_photo_deletion", { p_id: abandoned.id, p_success: true })), true);

    const bucket = testSql("select public,file_size_limit,allowed_mime_types from storage.buckets where id='location-photos'")[0];
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 10_000_000);
    assert.deepEqual([...bucket.allowed_mime_types].sort(), ["image/jpeg", "image/png", "image/webp"]);

    const profileWalletBefore = checked(await stranger.client.rpc("get_my_contact_wallet"));
    const wallet1 = checked(await stranger.client.rpc("get_my_location_credit_wallet"));
    const wallet2 = checked(await stranger.client.rpc("get_my_location_credit_wallet"));
    assert.equal(wallet1.available_credits, 5);
    assert.equal(wallet2.available_credits, 5);
    assert.equal(testSql(`select count(*)::int n from private.location_credit_ledger where user_id='${stranger.id}' and event='grant'`)[0].n, 1);
    assert.equal(testSql(`select count(*)::int n from public.professional_profiles where user_id='${stranger.id}'`)[0].n, 0, "requester needs no professional profile");

    const contactLocations = [];
    for (let index = 1; index <= 9; index++) {
      const item = checked(await owner.client.from("locations").insert(location(prefix, owner.id, `contact-${index}`)).select("id,slug").single());
      contactLocations.push(item);
      if (index !== 7) checked(await owner.client.rpc("save_my_location_contact_channels", { p_location_id: item.id, p_channels: { email: `location-${index}@example.invalid`, whatsapp: "+525500000001", instagram: "filmatta.qa" } }));
    }
    for (let index = 0; index < 4; index++) checked(await send(outsider, contactLocations[index].slug));
    const lastCreditRace = await Promise.all([
      send(outsider, contactLocations[4].slug),
      send(outsider, contactLocations[5].slug),
    ]);
    assert.equal(lastCreditRace.filter((result) => !result.error).length, 1, "two tabs cannot reserve the same last credit");
    assert.equal(lastCreditRace.filter((result) => result.error?.code === "LCC01").length, 1);
    assert.ok((await send(owner, contactLocations[0].slug)).error, "self contact blocked");
    const firstKey = randomUUID();
    const firstRequest = checked(await send(stranger, contactLocations[0].slug, undefined, firstKey));
    assert.equal(checked(await send(stranger, contactLocations[0].slug, undefined, firstKey)), firstRequest, "idempotent retry");
    assert.equal(checked(await send(stranger, contactLocations[0].slug)), firstRequest, "pending duplicate returns existing");
    const requestIds = [firstRequest];
    for (let index = 1; index < 5; index++) requestIds.push(checked(await send(stranger, contactLocations[index].slug)));
    assert.equal((await send(stranger, contactLocations[5].slug)).error?.code, "LCC01", "sixth pending impossible");

    assert.equal(checked(await owner.client.rpc("transition_location_contact_request", { p_id: requestIds[0], p_action: "accept" })), "accepted");
    assert.equal(checked(await owner.client.rpc("transition_location_contact_request", { p_id: requestIds[0], p_action: "accept" })), "accepted", "accept retry is idempotent");
    let wallet = checked(await stranger.client.rpc("get_my_location_credit_wallet"));
    assert.equal(wallet.consumed_credits, 1);
    assert.equal(wallet.reserved_credits, 4);
    assert.equal(wallet.available_credits, 0);
    const accepted = checked(await stranger.client.rpc("get_my_location_contact_request", { p_id: requestIds[0] }));
    assert.deepEqual(Object.keys(accepted.shared_contact_snapshot).sort(), ["email", "instagram", "whatsapp"]);
    assert.equal(JSON.stringify(accepted).includes(stranger.email), false);
    assert.equal(checked(await outsider.client.rpc("get_my_location_contact_request", { p_id: requestIds[0] })), null);
    assert.ok((await anon.from("location_contact_requests").select("shared_contact_snapshot")).error);

    assert.equal(checked(await owner.client.rpc("transition_location_contact_request", { p_id: requestIds[1], p_action: "reject" })), "rejected");
    assert.equal(checked(await stranger.client.rpc("transition_location_contact_request", { p_id: requestIds[2], p_action: "cancel" })), "cancelled");
    testSql(`update public.location_contact_requests set created_at=now()-interval '49 hours',expires_at=now()-interval '1 hour' where id='${requestIds[3]}'`);
    wallet = checked(await stranger.client.rpc("get_my_location_credit_wallet"));
    assert.equal(wallet.available_credits, 3);
    assert.equal(wallet.reserved_credits, 1);
    assert.equal(testSql(`select count(*)::int n from private.location_credit_ledger where request_id in ('${requestIds.slice(1,4).join("','")}') and event='release'`)[0].n, 3);

    const noChannelsBefore = checked(await stranger.client.rpc("get_my_location_credit_wallet")).available_credits;
    assert.equal((await send(stranger, contactLocations[6].slug)).error?.code, "LCN01");
    assert.equal(checked(await stranger.client.rpc("get_my_location_credit_wallet")).available_credits, noChannelsBefore);

    const expiring = checked(await send(stranger, contactLocations[7].slug));
    testSql(`update public.location_contact_requests set created_at=now()-interval '49 hours',expires_at=now()-interval '1 hour' where id='${expiring}'`);
    await Promise.all([
      owner.client.rpc("transition_location_contact_request", { p_id: expiring, p_action: "accept" }),
      stranger.client.rpc("refresh_my_location_requests"),
    ]);
    const expired = checked(await stranger.client.rpc("get_my_location_contact_request", { p_id: expiring }));
    assert.equal(expired.state, "expired");
    assert.equal(testSql(`select count(*)::int n from private.location_credit_ledger where request_id='${expiring}' and event='release'`)[0].n, 1);

    const acceptedAccess = checked(await stranger.client.rpc("get_my_location_contact_access", { p_slug: contactLocations[0].slug }));
    assert.equal(acceptedAccess.thread_state, "accepted");
    const otherAccess = checked(await stranger.client.rpc("get_my_location_contact_access", { p_slug: contactLocations[1].slug }));
    assert.notEqual(otherAccess.thread_state, "accepted", "another location stays locked");
    const profileWalletAfter = checked(await stranger.client.rpc("get_my_contact_wallet"));
    assert.deepEqual(profileWalletAfter, profileWalletBefore, "Profile wallet remains unchanged");

    checked(await owner.client.rpc("save_my_location_contact_channels", { p_location_id: contactLocations[8].id, p_channels: { email: "temporary@example.invalid" } }));
    const channelRemoved = checked(await send(stranger, contactLocations[8].slug));
    checked(await owner.client.rpc("save_my_location_contact_channels", { p_location_id: contactLocations[8].id, p_channels: {} }));
    assert.equal((await owner.client.rpc("transition_location_contact_request", { p_id: channelRemoved, p_action: "accept" })).error?.code, "LCN01");
    assert.equal(checked(await stranger.client.rpc("get_my_location_contact_request", { p_id: channelRemoved })).state, "pending");
    checked(await owner.client.from("locations").update({ status: "draft" }).eq("id", contactLocations[8].id).select("id").single());
    assert.equal(checked(await stranger.client.rpc("get_my_location_contact_request", { p_id: channelRemoved })).state, "cancelled");

    const notifications = checked(await owner.client.rpc("get_my_network_notifications", { p_page: 1 }));
    assert.ok(notifications.some((item) => item.type.startsWith("location_request_")));
    assert.equal(notifications.some((item) => JSON.stringify(item).includes("location-1@example.invalid")), false);
  }).finally(async () => {
    if (storedPaths.length) await admin.storage.from("location-photos").remove(storedPaths);
  }));
