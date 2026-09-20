import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
async function as(role, id = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}
const metadata = {
  category: "work",
  title: "Film",
  role: "DP",
  year: "2026",
  description: "Short",
  media_type: "video",
  source: "external",
  url: "https://www.youtube.com/watch?v=abcdefghijk",
  featured: false,
};
const save = (value = metadata, id = null) =>
  db.query("select save_my_profile_media($1,$2) id", [id, value]);
const manage = (id, action, target = null) =>
  db.query("select manage_my_profile_media($1,$2,$3)", [id, action, target]);
const reserve = (size = 1000, mime = "video/mp4", ext = "mp4") =>
  db.query("select reserve_my_profile_upload($1,$2,$3,$4) id", [
    { ...metadata, source: "mux" },
    size,
    mime,
    ext,
  ]);
let slug, one, two;
before(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert on storage.objects to anon,authenticated;`);
  for (const file of [
    "20260910120000_create_professional_profiles.sql",
    "20260916010000_public_profile_catalog.sql",
    "20260920010000_profile_presentation.sql",
    "20260921010000_profile_media.sql",
    "20260923010000_profile_upload_lifecycle.sql",
  ])
    await db.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
  await db.query("insert into auth.users values ($1,$3),($2,$4)", [
    owner,
    other,
    { full_name: "Owner Private" },
    { full_name: "Other Private" },
  ]);
  await as("authenticated", owner);
  slug = (
    await db.query(
      "select save_my_professional_profile(array['Actuación'],'City','Bio','available','{}','{}','[]',false,'members_only') slug",
    )
  ).rows[0].slug;
});
after(() => db.close());
test("owner CRUD; import is idempotent; originals preserved", async () => {
  await as("authenticated", owner);
  one = (await save()).rows[0].id;
  two = (await save({ ...metadata, title: "Second" })).rows[0].id;
  await db.exec(
    "select initialize_my_profile_media();select initialize_my_profile_media()",
  );
  assert.equal((await db.query("select * from profile_media")).rows.length, 2);
  await save({ ...metadata, title: "Updated" }, one);
  assert.equal(
    (await db.query("select title from profile_media where id=$1", [one]))
      .rows[0].title,
    "Updated",
  );
  await assert.rejects(
    db.query("update profile_media set title='Bypass'"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("delete from profile_media"),
    /permission denied/,
  );
});
test("non-owner and anon cannot read drafts, write, reorder, feature or archive another profile", async () => {
  await as("authenticated", other);
  assert.equal((await db.query("select * from profile_media")).rows.length, 0);
  assert.equal(
    (await db.query("select get_profile_media($1) value", [slug])).rows[0]
      .value,
    null,
  );
  for (const action of ["up", "down", "feature", "archive", "show"])
    await assert.rejects(manage(one, action));
  await assert.rejects(save(metadata, one));
  await as("anon");
  await assert.rejects(save());
  await assert.rejects(reserve());
  await assert.rejects(
    db.query("select * from profile_media"),
    /permission denied/,
  );
  assert.equal(
    (await db.query("select get_profile_media_resource($1) value", [one]))
      .rows[0].value,
    null,
  );
});
test("order swaps persist; one featured; hiding and archive remove public projections", async () => {
  await as("authenticated", owner);
  await manage(two, "up");
  assert.equal(
    (await db.query("select id from profile_media order by sort_order,id"))
      .rows[0].id,
    two,
  );
  await manage(one, "feature");
  await manage(two, "feature");
  assert.equal(
    (await db.query("select id from profile_media where featured")).rows[0].id,
    two,
  );
  await as("postgres");
  await db.query(
    "update professional_profiles set is_public=true where user_id=$1",
    [owner],
  );
  await as("anon");
  const published = (
    await db.query("select get_profile_media($1) value", [slug])
  ).rows[0].value;
  assert.equal(published.length, 2);
  assert.doesNotMatch(
    JSON.stringify(published),
    /owner_id|expected_size|mux_asset|Private/,
  );
  await as("authenticated", owner);
  await manage(one, "hide");
  await manage(two, "archive");
  await as("anon");
  assert.equal(
    (await db.query("select get_profile_media($1) value", [slug])).rows[0].value
      .length,
    0,
  );
  for (const rpc of [
    "get_public_professional_profile",
    "get_public_professional_portfolio",
  ])
    assert.deepEqual(
      (await db.query(`select portfolio_items from ${rpc}($1)`, [slug])).rows[0]
        .portfolio_items,
      [],
    );
  await as("authenticated", owner);
  await manage(two, "restore");
  assert.equal(
    (await db.query("select visibility from profile_media where id=$1", [two]))
      .rows[0].visibility,
    "hidden",
  );
});
test("upload declared-size bounds, quota and pending caps are enforced inside SQL", async () => {
  await as("authenticated", owner);
  for (const n of [-1, 0, 5_000_000_001]) await assert.rejects(reserve(n));
  await assert.rejects(reserve(100, "image/svg+xml", "svg"));
  await reserve(5_000_000_000);
  await reserve();
  await assert.rejects(reserve(), /Pending/);
  await as("postgres");
  await db.exec("update profile_media set status='errored' where source='mux'");
  for (let i = 0; i < 8; i++) {
    await as("authenticated", owner);
    await reserve();
    await as("postgres");
    await db.exec(
      "update profile_media set status='errored' where source='mux'",
    );
  }
  await as("authenticated", owner);
  await assert.rejects(reserve(), /Daily/);
});
test("storage write paths are owner-scoped, immutable and public reads require ready+published", async () => {
  await as("authenticated", owner);
  const image = {
    ...metadata,
    category: "book",
    media_type: "image",
    source: "storage",
  };
  await assert.rejects(
    db.query("select reserve_my_profile_upload($1,20000001,$2,$3)", [
      image,
      "image/jpeg",
      "jpg",
    ]),
  );
  const id = (
    await db.query("select reserve_my_profile_upload($1,20000000,$2,$3) id", [
      image,
      "image/jpeg",
      "jpg",
    ])
  ).rows[0].id;
  const path = `${owner}/${id}/original.jpg`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('profile-media',$1)",
    [path],
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('profile-media','forged/image.jpg')",
    ),
    /row-level security/,
  );
  await as("authenticated", other);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await as("postgres");
  await db.query("update profile_media set status='ready' where id=$1", [id]);
  await as("anon");
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    1,
  );
  await as("postgres");
  await db.query(
    "update professional_profiles set is_public=false where user_id=$1",
    [owner],
  );
  await as("anon");
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
});
