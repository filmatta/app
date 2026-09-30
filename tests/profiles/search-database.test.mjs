import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema private;
    grant usage on schema public to anon, authenticated;
    create table public.professional_profiles (
      user_id uuid primary key,
      slug text not null unique,
      display_name text not null,
      disciplines text[] not null default '{}',
      city text,
      bio text,
      availability text not null default 'not_specified',
      skills text[] not null default '{}',
      portfolio_items jsonb not null default '[]',
      is_public boolean not null default false,
      updated_at timestamptz not null default now(),
      presentation jsonb not null default '{}',
      media_initialized boolean not null default false
    );
    create table public.profile_media (
      id uuid primary key,
      owner_id uuid not null references public.professional_profiles(user_id),
      purpose text not null,
      category text not null,
      media_type text not null,
      source text not null,
      url text not null default '',
      featured boolean not null default false,
      sort_order integer not null default 0,
      visibility text not null default 'visible',
      status text not null default 'ready',
      thumbnail_id uuid,
      custom_reel_cover_id uuid
    );
  `);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20260930010000_profiles_search_v1.sql",
      "utf8",
    ),
  );

  const presentation = (name) =>
    JSON.stringify({
      portrait_url: "",
      stage_name: name,
      work_area: "",
      rate_range: "",
      book: [],
      credits: [],
    });
  await db.query(
    `insert into public.professional_profiles
      (user_id, slug, display_name, disciplines, city, bio, availability, skills, is_public, updated_at, presentation)
     values
      ('11111111-1111-4111-8111-111111111111','ana-foto','Ana F.',array['Dirección de fotografía'],'Guadalajara','Bio','available',array['Iluminación natural'],true,'2026-09-03',$1),
      ('22222222-2222-4222-8222-222222222222','luis-sonido','Luis S.',array['Sonido'],'Ciudad de México','Bio','limited',array['Mezcla de campo'],true,'2026-09-02',$2),
      ('33333333-3333-4333-8333-333333333333','draft-secret','Secreto D.',array['Dirección'],'Mérida','Bio','available',array['Casting'],false,'2026-09-04',$3)`,
    [presentation("Ana Torres"), presentation("Luis Sonido"), presentation("Secreto Privado")],
  );
});

after(() => db.close());

test("indexed RPC searches public name, discipline and skills with stable totals", async () => {
  await db.exec("set role anon");
  const byName = await db.query(
    "select * from search_public_professional_profiles('Ana',1,'','','','')",
  );
  assert.equal(byName.rows.length, 1);
  assert.equal(byName.rows[0].slug, "ana-foto");
  assert.equal(Number(byName.rows[0].total_count), 1);

  const combined = await db.query(
    "select * from search_public_professional_profiles('director de fotografía',1,'Dirección de fotografía','Guadalajara','available','Iluminación natural')",
  );
  assert.equal(combined.rows.length, 1);
  assert.equal(combined.rows[0].slug, "ana-foto");

  const byProfessionAlias = await db.query(
    "select * from search_public_professional_profiles('fotógrafa',1,'','','','')",
  );
  assert.equal(byProfessionAlias.rows[0].slug, "ana-foto");

  const bySoundAlias = await db.query(
    "select * from search_public_professional_profiles('sonidista',1,'','','','')",
  );
  assert.equal(bySoundAlias.rows[0].slug, "luis-sonido");

  const draft = await db.query(
    "select * from search_public_professional_profiles('Secreto',1,'','','','')",
  );
  assert.equal(draft.rows.length, 0);
});

test("facets contain only values from published profiles", async () => {
  const { rows } = await db.query("select get_public_profile_search_facets() facets");
  assert.deepEqual(rows[0].facets.cities, ["Ciudad de México", "Guadalajara"]);
  assert.deepEqual(rows[0].facets.skills, ["Iluminación natural", "Mezcla de campo"]);
  assert.equal(JSON.stringify(rows[0]).includes("Mérida"), false);
});
