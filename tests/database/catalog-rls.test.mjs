import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const admin = "33333333-3333-4333-8333-333333333333";
async function as(role, uid = "") {
  assert.ok(["anon", "authenticated", "postgres"].includes(role));
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}
before(async () => {
  // Minimal Supabase auth prerequisite. Catalog tables/policies/functions below
  // are executed verbatim from the actual versioned migrations.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated;
    grant usage on schema private to authenticated;
    create table public.profiles (id uuid primary key, role text);
  `);
  const core = fs.readFileSync(
    "supabase/production/0001_core_learn_prerequisites.sql",
    "utf8",
  );
  const adminHelper = core.match(
    /create function private\.is_admin\(\)[\s\S]*?\$\$;/,
  )[0];
  await db.exec(adminHelper);
  for (const file of [
    "20260910120000_create_professional_profiles.sql",
    "20260910230000_create_locations_opportunities_foundations.sql",
    "20260916010000_public_profile_catalog.sql",
    "20260916020000_opportunity_owner_publishing.sql",
    "20260916030000_services_directory.sql",
  ]) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  await db.query(
    'insert into auth.users(id,raw_user_meta_data) values ($1,\'{"full_name":"Test Owner"}\'),($2,\'{"full_name":"Test Stranger"}\'),($3,\'{"full_name":"Test Admin"}\')',
    [owner, stranger, admin],
  );
  await db.query(
    "insert into public.profiles values ($1,'user'),($2,'user'),($3,'admin')",
    [owner, stranger, admin],
  );
  await db.query(
    "insert into professional_profiles(user_id,slug,display_name,disciplines,city,is_public) values ($1,'test-owner','Test O.',array['Actuación','Cámara'],'México',true),($2,'test-private','Test S.',array['Modelaje'],'León',false)",
    [owner, stranger],
  );
});
after(async () => db.close());

test("public projection omits owner/private fields, filters talent and excludes drafts", async () => {
  await as("anon");
  const { rows } = await db.query(
    "select * from list_public_professional_profiles(1,'','','',true)",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "test-owner");
  assert.equal(
    Object.keys(rows[0]).sort().join(","),
    "availability,bio,city,disciplines,display_name,slug,updated_at",
  );
  assert.equal(
    (
      await db.query(
        "select * from list_public_professional_profiles(1,'Modelaje','','',true)",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select * from list_public_professional_profiles(1,'','méx','',false)",
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select * from list_public_professional_profiles(1,'','%','',false)",
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select * from professional_profiles"),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "select save_my_professional_profile(array['Cámara'],null,null,'available','{}','{}','[]',true,'closed')",
    ),
    /permission denied/,
  );
});
test("authenticated owner cannot read another private profile or write another identity", async () => {
  await as("authenticated", owner);
  assert.equal(
    (await db.query("select * from professional_profiles")).rows.length,
    1,
  );
  await assert.rejects(
    db.query(
      "update professional_profiles set is_public=true where slug='test-private'",
    ),
    /permission denied/,
  );
  await db.query(
    "select save_my_professional_profile(array['Actuación'], 'México', 'Actualizado', 'available', '{}', '{}', '[]', true, 'members_only')",
  );
  await as("postgres");
  const { rows } = await db.query(
    "select is_public,bio from professional_profiles where user_id=$1",
    [stranger],
  );
  assert.equal(rows[0].is_public, false);
  assert.equal(rows[0].bio, null);
});
test("existing Locations ownership denies cross-user mutation and draft disclosure", async () => {
  await as("authenticated", owner);
  await db.query(
    "insert into locations(owner_id,title,slug,city,space_type) values($1,'Espacio privado','space-private','México','Estudio')",
    [owner],
  );
  await as("authenticated", stranger);
  assert.equal(
    (
      await db.query(
        "update locations set title='Cambio ajeno' where slug='space-private' returning id",
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    db.query(
      "insert into locations(owner_id,title,slug,city,space_type) values($1,'Falso','false-owner','México','Estudio')",
      [owner],
    ),
    /row-level security/,
  );
  await as("anon");
  assert.equal((await db.query("select * from locations")).rows.length, 0);
  await as("authenticated", admin);
  assert.equal((await db.query("select * from locations")).rows.length, 1);
});
test("opportunities require a published project and retain compound ownership", async () => {
  await as("authenticated", owner);
  const project = (
    await db.query(
      "insert into projects(owner_id,title,slug) values($1,'Proyecto','test-project') returning id",
      [owner],
    )
  ).rows[0].id;
  await db.query(
    "insert into opportunities(owner_id,project_id,title,slug,category,status) values($1,$2,'Crew','test-crew','crew','published')",
    [owner, project],
  );
  await as("anon");
  assert.equal((await db.query("select * from opportunities")).rows.length, 0);
  await as("authenticated", stranger);
  await assert.rejects(
    db.query(
      "insert into opportunities(owner_id,project_id,title,slug,category) values($1,$2,'Falso','test-false','crew')",
      [stranger, project],
    ),
  );
  await as("authenticated", owner);
  await db.query("update projects set status='published' where id=$1", [
    project,
  ]);
  await as("anon");
  assert.equal((await db.query("select * from opportunities")).rows.length, 1);
});
test("public profile pagination is bounded, stable and does not duplicate boundary rows", async () => {
  await as("postgres");
  await db.exec(`
    insert into auth.users(id) select ('aaaaaaaa-aaaa-4aaa-8aaa-' || lpad(i::text,12,'0'))::uuid from generate_series(1,28) i;
    insert into professional_profiles(user_id,slug,display_name,disciplines,is_public,updated_at)
      select ('aaaaaaaa-aaaa-4aaa-8aaa-' || lpad(i::text,12,'0'))::uuid, 'public-'||lpad(i::text,2,'0'),'Test '||i,array['Modelaje'],true,'2026-01-01'
      from generate_series(1,28) i;
  `);
  await as("anon");
  const first = (
    await db.query(
      "select slug from list_public_professional_profiles(1,'Modelaje','','',true)",
    )
  ).rows;
  const second = (
    await db.query(
      "select slug from list_public_professional_profiles(2,'Modelaje','','',true)",
    )
  ).rows;
  assert.equal(first.length, 25); // lookahead row
  assert.equal(second.length, 4);
  assert.equal(first[24].slug, second[0].slug);
  assert.equal(
    new Set([...first.slice(0, 24), ...second].map((r) => r.slug)).size,
    28,
  );
});

test("publishing RPC is atomic, owner-bound and preserves shared links across edits", async () => {
  const brief = {
    title: "Nueva convocatoria",
    category: "crew",
    description: "Buscamos equipo para una producción de cortometraje.",
    work_mode: "remote",
    compensation_type: "unspecified",
  };
  await as("anon");
  await assert.rejects(
    db.query("select save_my_opportunity(null,$1,'Proyecto nuevo','draft')", [
      brief,
    ]),
    /permission denied/,
  );
  await as("authenticated", owner);
  const longTitle = 'a'.repeat(139) + ' ' + 'b'.repeat(20);
  const longId = (await db.query("select save_my_opportunity(null,$1,'Proyecto extenso','draft')",[{...brief,title:longTitle}])).rows[0].save_my_opportunity;
  const longRow = (await db.query('select title,slug from opportunities where id=$1',[longId])).rows[0];
  assert.equal(longRow.title.length,160);
  assert.match(longRow.slug,/^[a-z0-9]+(-[a-z0-9]+)*$/);
  const id = (
    await db.query(
      "select save_my_opportunity(null,$1,'Proyecto nuevo','draft')",
      [{ ...brief, owner_id: stranger }],
    )
  ).rows[0].save_my_opportunity;
  const original = (
    await db.query("select * from opportunities where id=$1", [id])
  ).rows[0];
  assert.equal(original.owner_id, owner);
  assert.equal(original.status, "draft");
  await as("authenticated", stranger);
  await assert.rejects(
    db.query("select save_my_opportunity($1,$2,null,'published')", [id, brief]),
    /Not authorized/,
  );
  await as("authenticated", owner);
  await db.query("select save_my_opportunity($1,$2,null,'published')", [
    id,
    { ...brief, title: "Título actualizado" },
  ]);
  await as("anon");
  const published = (
    await db.query("select * from opportunities where id=$1", [id])
  ).rows[0];
  assert.equal(published.slug, original.slug);
  assert.equal(published.title, "Título actualizado");
  await as("authenticated", owner);
  await db.query("select save_my_opportunity($1,$2,null,'archived')", [
    id,
    brief,
  ]);
  await as("anon");
  assert.equal(
    (await db.query("select * from opportunities where id=$1", [id])).rows
      .length,
    0,
  );
  await as("authenticated", owner);
  const beforeCount = (
    await db.query("select count(*)::int as n from projects")
  ).rows[0].n;
  await assert.rejects(
    db.query("select save_my_opportunity(null,$1,'No orphan','draft')", [
      { ...brief, category: "invalid" },
    ]),
  );
  assert.equal(
    (await db.query("select count(*)::int as n from projects")).rows[0].n,
    beforeCount,
  );
});

test('Services schema, ownership, publication and private inquiry boundaries',async()=>{
  await as('authenticated',owner);
  const values={title:'Sonido directo',category:'sound',description:'Equipo de sonido directo para producciones audiovisuales.',city:'México',work_mode:'on_site',indicative_price:1200.50,currency:'MXN',portfolio_links:[{label:'Portafolio',url:'https://example.com/work'}]};
  const saved=await db.query("select save_my_service(null,$1,'draft')",[values]);const id=saved.rows[0].save_my_service;
  const listing=(await db.query('select * from service_listings where id=$1',[id])).rows[0];
  await as('anon');assert.equal((await db.query('select id,title from service_listings where id=$1',[id])).rows.length,0);
  await assert.rejects(db.query('select owner_user_id from service_listings'));
  await as('authenticated',stranger);
  await assert.rejects(db.query("select save_my_service($1,$2,'published')",[id,values]),/Not authorized/);
  assert.equal((await db.query("update service_listings set title='Ajeno' where id=$1 returning id",[id])).rows.length,0);
  await as('authenticated',owner);
  await assert.rejects(db.query("update service_listings set owner_user_id=$1 where id=$2",[stranger,id]));
  await assert.rejects(db.query("select save_my_service(null,$1,'published')",[{...values,description:''}]));
  await assert.rejects(db.query("select save_my_service(null,$1,'draft')",[{...values,portfolio_links:[{label:'Bad',url:'javascript:alert(1)'}]}]));
  await db.query("select save_my_service($1,$2,'published')",[id,{...values,title:'Sonido actualizado'}]);
  await as('anon');assert.equal((await db.query('select slug from service_listings where id=$1',[id])).rows[0].slug,listing.slug);
  await assert.rejects(db.query('select * from catalog_inquiries'));
  await assert.rejects(db.query('select send_service_inquiry($1,$2)',[listing.slug,'Consulta privada para esta producción.']));
  await as('authenticated',stranger);
  await db.query("select save_my_professional_profile(array['Actuación'],null,null,'available','{}','{}','[]',true,'members_only')");
  const inquiry=(await db.query('select send_service_inquiry($1,$2)',[listing.slug,'Consulta privada para esta producción.'])).rows[0].send_service_inquiry;
  await assert.rejects(db.query('select send_service_inquiry($1,$2)',[listing.slug,'Consulta privada para esta producción.']),/unique/);
  assert.equal((await db.query("update catalog_inquiries set status='accepted' where id=$1 returning id",[inquiry])).rows.length,0);
  await assert.rejects(db.query('update catalog_inquiries set recipient_id=$1 where id=$2',[stranger,inquiry]));
  await as('authenticated',owner);
  assert.equal((await db.query('select * from list_my_catalog_inquiries()')).rows.length,1);
  await db.query("update catalog_inquiries set status='accepted' where id=$1",[inquiry]);
  await db.query("select save_my_service($1,$2,'draft')",[id,values]);
  await as('authenticated',stranger);
  const received=(await db.query('select * from list_my_catalog_inquiries()')).rows[0];
  assert.equal(received.status,'accepted');assert.equal(received.target_title,'Servicio no disponible');assert.equal(received.target_href,null);
  await as('authenticated',admin);assert.equal((await db.query('select id from service_listings where id=$1',[id])).rows.length,1);
  await db.query("update service_listings set status='archived' where id=$1",[id]);
});
