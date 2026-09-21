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
    "20260923020000_profile_reel_selection.sql",
    "20260923030000_profile_identity_images_rates.sql",
    "20260923040000_private_profile_contact_bio.sql",
    "20260923050000_profile_preferences_credits.sql",
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

test("reel selection uses attested exact duration, serial replacement, owner-only and preserves long works", async () => {
  await as("authenticated", owner);
  await assert.rejects(save({...metadata, category: "reel"}), /duration/);
  for (const duration of [179.9, 180, 180.01, null]) {
    await as("postgres");
    const id=(await db.query("insert into profile_media(owner_id,category,title,media_type,source,status,duration_seconds) values($1,'work','Duration test','video','mux','ready',$2) returning id", [owner,duration])).rows[0].id;
    await as("authenticated", other); await assert.rejects(manage(id,"reel"));
    await as("authenticated", owner);
    if(duration !== null && duration <= 180) {
      await manage(id,"reel");
      assert.equal((await db.query("select count(*)::int n from profile_media where category='reel'")).rows[0].n,1);
      assert.equal((await db.query("select id from profile_media where category='reel'")).rows[0].id,id);
    } else {
      const before=(await db.query("select id from profile_media where category='reel'")).rows[0].id;
      await assert.rejects(manage(id,"reel"),/duration/);
      assert.equal((await db.query("select status from profile_media where id=$1",[id])).rows[0].status,"ready");
      assert.equal((await db.query("select id from profile_media where category='reel'")).rows[0].id,before);
    }
  }
});

test("identity references require owner validated derivatives; originals and unreferenced candidates remain private", async () => {
 await as("authenticated",other);
 await db.query("select save_my_professional_profile(array['Actuación'],'City','Bio','available','{}','{}','[]',false,'members_only')");
 await as("postgres");
 const own=(await db.query("insert into profile_media(owner_id,category,title,media_type,source,status,purpose,storage_path,derivative_path) values($1,'book','Portrait','image','storage','ready','portrait','own/original','own/derived') returning id",[owner])).rows[0].id;
 const foreign=(await db.query("insert into profile_media(owner_id,category,title,media_type,source,status,purpose,storage_path,derivative_path) values($1,'book','Portrait','image','storage','ready','portrait','foreign/original','foreign/derived') returning id",[other])).rows[0].id;
 await as("authenticated",owner);
 await assert.rejects(db.query("select set_my_profile_identity_image('portrait',$1)",[foreign]),/Invalid identity/);
 await db.query("select set_my_profile_identity_image('portrait',$1)",[own]);
 await as("postgres"); await db.query("update professional_profiles set is_public=true where user_id=$1",[owner]);
 await as("anon");
 assert.equal((await db.query("select can_read_profile_image('own/original') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select can_read_profile_image('own/derived') allowed")).rows[0].allowed,true);
 const list=(await db.query("select get_profile_media($1) items",[slug])).rows[0].items;
 assert.ok(!list.some(m=>m.id===own));
 await as("authenticated",other); await assert.rejects(db.query("select set_my_profile_identity_image('portrait',$1)",[own]));
 await as("authenticated",owner); await db.query("select set_my_profile_identity_image('portrait',null)");
 await as("anon"); assert.equal((await db.query("select can_read_profile_image('own/derived') allowed")).rows[0].allowed,false);
 await as("postgres"); assert.equal((await db.query("select status from profile_media where id=$1",[own])).rows[0].status,"ready");
});
test("rate and crop constraints reject forged values without changing legacy text",async()=>{
 await as("postgres");
 for(const rate of [{amount:"5.555",currency:"MXN",unit:"day"},{amount:"-1",currency:"USD",unit:"hour"},{amount:"3",currency:"FAKE",unit:"day"},{amount:"3",currency:"MXN",unit:"month"},{amount:"3.50",currency:"CLP",unit:"day"}])
  await assert.rejects(db.query("update professional_profiles set presentation=jsonb_set(presentation,'{rate}',$1) where user_id=$2",[rate,owner]));
 await db.query("update professional_profiles set presentation=jsonb_set(jsonb_set(presentation,'{rate_range}','\"5000\"'),'{rate}',$1) where user_id=$2",[{amount:"5000.50",currency:"MXN",unit:"day"},owner]);
 assert.equal((await db.query("select presentation->>'rate_range' legacy from professional_profiles where user_id=$1",[owner])).rows[0].legacy,"5000");
 await assert.rejects(db.exec("update profile_media set image_crop='{\"x\":101,\"y\":50,\"zoom\":1,\"frame\":\"auto\"}'"));
});

test("private contacts stay owner-only and forged visibility or direct writes are rejected",async()=>{
 await as("authenticated",owner);
 const contact={instagram_username:"qa_demo",whatsapp_e164:"+442079460018",preferred_contact:"whatsapp",contact_visibility:"private"};
 await db.query("select save_my_private_contact($1)",[contact]);
 assert.equal((await db.query("select whatsapp_e164 from profile_private_settings")).rows[0].whatsapp_e164,contact.whatsapp_e164);
 await assert.rejects(db.query("select save_my_private_contact($1)",[{...contact,contact_visibility:"members_only"}]));
 await assert.rejects(db.exec("update profile_private_settings set contact_visibility='public'"));
 await as("authenticated",other);assert.equal((await db.query("select * from profile_private_settings")).rows.length,0);
 const detail=(await db.query("select * from get_public_professional_portfolio($1)",[slug])).rows;
 assert.doesNotMatch(JSON.stringify(detail),/qa_demo|442079460018|instagram_username|whatsapp_e164/);
 await as("anon");await assert.rejects(db.exec("select * from profile_private_settings"));await assert.rejects(db.query("select save_my_private_contact($1)",[contact]));
});
test("shared Bio matrix is identical in PostgreSQL and direct writes cannot bypass it; old bios remain unchanged",async()=>{
 await as("postgres");
 for(const c of JSON.parse(fs.readFileSync("tests/profiles/bio-cases.json","utf8"))){
  assert.equal((await db.query("select private.profile_bio_has_contact($1) blocked",[c.text])).rows[0].blocked,c.blocked,c.text);
  if(c.blocked) await assert.rejects(db.query("update professional_profiles set bio=$1 where user_id=$2",[c.text,owner]),/BIO_CONTACT_BLOCKED/);
 }
 await db.exec("alter table professional_profiles disable trigger professional_profile_bio_contact");
 await db.query("update professional_profiles set bio='IG: legacy' where user_id=$1",[owner]);
 await db.exec("alter table professional_profiles enable trigger professional_profile_bio_contact");
 await as("authenticated",owner);
 await db.query("select save_my_professional_profile(array['Actuación'],'City','IG: legacy','limited','{}','{}','[]',true,'members_only')");
 await assert.rejects(db.query("select save_my_professional_profile(array['Actuación'],'City','IG: modified','limited','{}','{}','[]',true,'members_only')"),/BIO_CONTACT_BLOCKED/);
 await db.query("select save_my_professional_profile(array['Actuación'],'City','Mi correo es x@y.com','available','{}','{}','[]',true,'members_only')");
});

test("project preferences have no public projection and no acceptance defaults",async()=>{
 await as("authenticated",owner);
 const prefs={formats:["Fotografía"],open_formats:true,themes:{},participation:{nudity:"decline"},conditions:{night:"consult"}};
 await db.query("select save_my_project_preferences($1)",[prefs]);
 assert.deepEqual((await db.query("select project_preferences from profile_private_settings")).rows[0].project_preferences,prefs);
 for(const bad of [{...prefs,participation:{nudity:"yes"}},{...prefs,formats:["Other"]},{...prefs,conditions:{unknown:"accept"}},{...prefs,visibility:"public"}]) await assert.rejects(db.query("select save_my_project_preferences($1)",[bad]));
 await as("authenticated",other);assert.equal((await db.query("select project_preferences from profile_private_settings")).rows.length,0);
 const detail=(await db.query("select * from get_public_professional_portfolio($1)",[slug])).rows;
 assert.doesNotMatch(JSON.stringify(detail),/project_preferences|nudity|decline|night|consult/);
 await as("anon");await assert.rejects(db.query("select save_my_project_preferences($1)",[prefs]));
});
test("extended credits remain a single owner-authorized presentation, with partial dates",async()=>{
 await as("postgres");
 const credits=[{title:"Film",role:"DP",year:"2024",start:"2024",end:"2025-03",company:"Demo",production_type:"Cortometraje",description:"Fictitious fixture",url:"https://example.org/film",ongoing:false}];
 await db.query("update professional_profiles set presentation=jsonb_set(presentation,'{credits}',$1) where user_id=$2",[credits,owner]);
 for(const c of [{...credits[0],start:"2024-13"},{...credits[0],end:"2023"},{...credits[0],ongoing:true},{...credits[0],url:"javascript:bad"}]) await assert.rejects(db.query("update professional_profiles set presentation=jsonb_set(presentation,'{credits}',$1) where user_id=$2",[[c],owner]));
 await as("authenticated",other);
 await assert.rejects(db.query("update professional_profiles set presentation=jsonb_set(presentation,'{credits}','[]') where user_id=$1 returning user_id",[owner]),/permission denied/);
 await as("anon");const detail=(await db.query("select presentation from get_public_professional_portfolio($1)",[slug])).rows[0];assert.equal(detail.presentation.credits[0].start,"2024");
});
