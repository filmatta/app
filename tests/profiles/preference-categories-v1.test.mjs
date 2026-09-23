import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import load from "../load.mjs";

const preferences = load("lib/profiles/project-preferences.ts");
const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001";

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.profile_private_settings(
      owner_id uuid primary key,
      project_preferences jsonb not null default '{"formats":[],"open_formats":false,"themes":{},"participation":{},"conditions":{}}',
      publish_project_preferences boolean not null default false,
      updated_at timestamptz not null default now()
    );
    create function public.save_my_project_preferences_visibility(p_preferences jsonb,p_publish boolean)
    returns void language plpgsql security definer set search_path='' as $$
    begin
      if auth.uid() is null or not private.project_preferences_valid(p_preferences) then raise exception 'Invalid preferences' using errcode='22023'; end if;
      insert into public.profile_private_settings(owner_id,project_preferences,publish_project_preferences)
      values(auth.uid(),p_preferences,p_publish)
      on conflict(owner_id) do update set project_preferences=excluded.project_preferences,publish_project_preferences=excluded.publish_project_preferences,updated_at=now();
    end $$;
    grant usage on schema public,auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(fs.readFileSync("supabase/migrations/20260927020000_profile_preference_categories.sql", "utf8"));
});

after(() => db.close());

test("shared taxonomy keeps the eight requested categories and historical keys", () => {
  const options = preferences.PROFILE_PREFERENCE_CATEGORIES.flatMap((category) =>
    category.sections.flatMap((section) => section.options),
  );
  assert.deepEqual(
    Array.from(preferences.PROFILE_PREFERENCE_CATEGORIES, (category) => category.title),
    [
      "Tipos de proyecto",
      "Interpretación y participación",
      "Caracterización y vestuario",
      "Horarios y movilidad",
      "Modalidad y colaboración",
      "Entornos y escenas especiales",
      "Colaboración profesional / crew",
      "Límites de intimidad escénica",
    ],
  );
  assert.equal(preferences.PROFILE_PREFERENCE_GROUPS.participation.nudity, "Desnudez total");
  assert.equal(preferences.PROFILE_PREFERENCE_GROUPS.conditions.travel, "Desplazamientos");
  assert.equal(preferences.PROFILE_PREFERENCE_GROUPS.participation.camera_presenting, "Presentación a cámara");
  assert.ok(preferences.PROJECT_FORMATS.includes("Proyecto estudiantil"));
  assert.equal(options.length, 139);
  assert.equal(new Set(options.map((item) => `${item.group}:${item.key}`)).size, options.length);
  for (const item of options)
    assert.equal(preferences.PROFILE_PREFERENCE_GROUPS[item.group][item.key], item.label);
});

test("parser accepts new keys while preserving all four states and rejecting unknown keys", () => {
  const value = {
    ...preferences.EMPTY_PREFERENCES,
    formats: ["Institucional", "Proyecto estudiantil"],
    themes: { drama: "consult" },
    participation: { camera_presenting: "accept", nudity: "decline" },
    conditions: { remote_work: "accept", travel: "consult" },
  };
  assert.equal(JSON.stringify(preferences.parseProjectPreferences(value)), JSON.stringify(value));
  assert.equal(preferences.parseProjectPreferences({ ...value, conditions: { unknown: "accept" } }), null);
  assert.equal(preferences.parseProjectPreferences({ ...value, participation: { nudity: "yes" } }), null);
});

test("quick onboarding persistence merges explicit changes without clearing historical answers", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("set role authenticated");
  const historical = {
    formats: ["Cortometraje"],
    open_formats: false,
    themes: { drama: "consult" },
    participation: { nudity: "decline" },
    conditions: { travel: "consult", night: "accept" },
  };
  await db.query("select save_my_project_preferences_visibility($1,true)", [historical]);
  await db.query("select save_my_profile_quick_preferences($1)", [{
    formats: ["Cortometraje", "Educativo"],
    participation: { camera_presenting: "accept" },
    conditions: { night: "unspecified", remote_work: "accept" },
  }]);
  await db.exec("reset role");
  const row = (await db.query("select project_preferences,publish_project_preferences from profile_private_settings where owner_id=$1", [owner])).rows[0];
  assert.equal(row.publish_project_preferences, true);
  assert.equal(row.project_preferences.themes.drama, "consult");
  assert.equal(row.project_preferences.participation.nudity, "decline");
  assert.equal(row.project_preferences.participation.camera_presenting, "accept");
  assert.equal(row.project_preferences.conditions.travel, "consult");
  assert.equal(row.project_preferences.conditions.night, "unspecified");
  assert.equal(row.project_preferences.conditions.remote_work, "accept");
  assert.deepEqual(row.project_preferences.formats, ["Cortometraje", "Educativo"]);
});

test("quick onboarding rejects advanced states and unknown keys", async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select save_my_profile_quick_preferences($1)", [{ conditions: { remote_work: "consult" } }]));
  await assert.rejects(db.query("select save_my_profile_quick_preferences($1)", [{ conditions: { unknown: "accept" } }]));
  await db.exec("reset role");
});
