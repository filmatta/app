import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite(),
  owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
async function as(role, id = "") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
}
const presentation = {
  portrait_url: "https://example.com/portrait.jpg",
  stage_name: "Artista",
  work_area: "Zona Poniente",
  rate_range: "MXN 3,000 / jornada",
  book: [{ url: "https://example.com/book.jpg", caption: "Retrato" }],
  credits: [{ title: "Proyecto", role: "Actriz", year: "2026" }],
};
before(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;`);
  for (const name of [
    "20260910120000_create_professional_profiles.sql",
    "20260916010000_public_profile_catalog.sql",
    "20260920010000_profile_presentation.sql",
  ])
    await db.exec(fs.readFileSync("supabase/migrations/" + name, "utf8"));
  await db.query("insert into auth.users values ($1,$3),($2,$4)", [
    owner,
    other,
    { full_name: "Elena Privada", email: "secret@example.invalid" },
    { full_name: "Otro Privado" },
  ]);
});
after(() => db.close());
async function save(pub = true, p = presentation) {
  return db.query(
    "select save_my_professional_portfolio(array['Actuación','Dirección'],'Guadalajara','Bio','available',array['Inglés'],'{}','[]',$1,'members_only',$2) as slug",
    [pub, p],
  );
}
test("atomic owner save; public projections contain presentation but never private identity", async () => {
  await as("authenticated", owner);
  const { rows } = await save();
  const slug = rows[0].slug;
  await as("anon");
  const detail = (
    await db.query("select * from get_public_professional_portfolio($1)", [
      slug,
    ])
  ).rows[0];
  assert.equal(detail.presentation.stage_name, "Artista");
  assert.equal(detail.display_name, "Elena P.");
  assert.equal(detail.user_id, undefined);
  assert.doesNotMatch(
    JSON.stringify(detail),
    /secret@|raw_user_meta_data|Elena Privada/,
  );
  const catalog = (
    await db.query(
      "select * from list_public_professional_portfolios(1,'','Guadalajara','available',true)",
    )
  ).rows;
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].presentation.rate_range, "");
  assert.equal(
    (
      await db.query(
        "select * from list_public_professional_portfolios(1,'Modelaje','','',true)",
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    db.query("select * from professional_profiles"),
    /permission denied/,
  );
  await assert.rejects(save(), /permission denied/);
});
test("draft unpublication removes detail and all catalogs; other member cannot read or mutate it", async () => {
  await as("authenticated", owner);
  const slug = (await save(false)).rows[0].slug;
  await as("anon");
  assert.equal(
    (
      await db.query("select * from get_public_professional_portfolio($1)", [
        slug,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from list_public_professional_portfolios()")).rows
      .length,
    0,
  );
  await as("authenticated", other);
  assert.equal(
    (await db.query("select * from professional_profiles")).rows.length,
    0,
  );
  await assert.rejects(
    db.query("update professional_profiles set is_public=true"),
    /permission denied/,
  );
  await save();
  await as("postgres");
  const original = (
    await db.query("select * from professional_profiles where user_id=$1", [
      owner,
    ])
  ).rows[0];
  assert.equal(original.is_public, false);
  assert.deepEqual(original.presentation, presentation);
});
test("invalid presentation rolls back existing profile and publication changes", async () => {
  await as("authenticated", owner);
  for (const patch of [
    { portrait_url: "javascript:alert(1)" },
    { credits: [{ title: "", role: "X", year: "2026" }] },
    { private_email: "hidden" },
    {
      book: [{ url: "https://example.com/a", caption: "", private: "hidden" }],
    },
  ])
    await assert.rejects(
      save(true, { ...presentation, ...patch }),
      /Invalid presentation/,
    );
  await as("postgres");
  const row = (
    await db.query(
      "select is_public,presentation from professional_profiles where user_id=$1",
      [owner],
    )
  ).rows[0];
  assert.equal(row.is_public, false);
  assert.deepEqual(row.presentation, presentation);
});
