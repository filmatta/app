import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const photos = readFileSync("supabase/migrations/20260928020000_location_photos_beta.sql", "utf8");
const contacts = readFileSync("supabase/migrations/20260928030000_location_contact_credits.sql", "utf8");
const publicPage = readFileSync("app/locaciones/[slug]/page.tsx", "utf8");
const modal = readFileSync("components/locations/LocationContactPanel.tsx", "utf8");
const uploader = readFileSync("components/locations/LocationPhotoManager.tsx", "utf8");

test("location photo quota is atomic and storage authorization is reservation-bound", () => {
  assert.match(photos, /where id=p_location_id and owner_id=actor for update/i);
  assert.match(photos, /photo_count>=20/);
  assert.match(photos, /p\.storage_path=name[\s\S]*lifecycle_status='uploading'[\s\S]*expires_at>clock_timestamp/i);
  assert.match(photos, /file_size_limit,allowed_mime_types/);
  assert.match(photos, /false,10000000,array\['image\/jpeg','image\/png','image\/webp'\]/);
  assert.match(photos, /grant execute on function public\.attest_location_photo[\s\S]*to service_role/i);
  assert.doesNotMatch(photos, /grant execute on function public\.attest_location_photo[^;]+authenticated/i);
});

test("location channels moved private and never return in public projection", () => {
  assert.match(contacts, /create table private\.location_contact_channels/);
  assert.match(contacts, /insert into private\.location_contact_channels[\s\S]*from public\.location_public_contacts/);
  assert.match(contacts, /drop table public\.location_public_contacts/);
  const projection = contacts.slice(contacts.lastIndexOf("create or replace function public.get_public_location"));
  assert.match(projection, /contact_available/);
  assert.doesNotMatch(projection, /jsonb_build_object\('email'/);
  assert.doesNotMatch(publicPage, /mailto:|wa\.me|tel:/);
});

test("Location credits remain isolated and transitions keep reserve-consume-release semantics", () => {
  assert.match(contacts, /create table private\.location_credit_accounts/);
  assert.match(contacts, /initial_credits smallint not null default 5/);
  assert.match(contacts, /event in \('grant','reserve','consume','release'\)/);
  assert.match(contacts, /values\(actor,result,'reserve',-1\)/);
  assert.match(contacts, /values\(r\.requester_id,r\.id,'consume',0\)/);
  assert.match(contacts, /private\.release_location_credit/);
  assert.doesNotMatch(contacts, /contact_credit_reservations|profile_contact_relationships/);
});

test("modal and uploader expose no side-effect before explicit submit", () => {
  assert.match(modal, /showModal\(\)/);
  assert.match(modal, /Se reservará 1 crédito de Locaciones/);
  assert.match(modal, /Saldo disponible:/);
  assert.match(modal, /type="submit"/);
  assert.match(uploader, /validateLocationPhotoSignature/);
  assert.match(uploader, /x-upsert/);
  assert.match(uploader, /Reintentar/);
});
