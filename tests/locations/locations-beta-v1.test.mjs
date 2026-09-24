import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const conditions = load("lib/locations/conditions.ts");
const characteristics = load("lib/locations/characteristics.ts");

test("condition catalog has nine groups and globally unique keys", () => {
  assert.equal(conditions.LOCATION_CONDITION_GROUPS.length, 9);
  assert.equal(new Set(conditions.LOCATION_CONDITION_KEYS).size, conditions.LOCATION_CONDITION_KEYS.length);
  assert.ok(conditions.LOCATION_CONDITION_KEYS.includes("stage_liquids"));
  assert.equal(conditions.LOCATION_CONDITION_KEYS.filter((key) => key === "set_design").length, 1);
  assert.equal(conditions.LOCATION_CONDITION_KEYS.filter((key) => key === "external_generator").length, 1);
});

test("unspecified and unknown answers are omitted from public conditions", () => {
  assert.equal(JSON.stringify(conditions.normalizeLocationConditions({ day_shoots: "yes", night_shoots: "", forged: "yes", haze: "consult" })), JSON.stringify({ day_shoots: "yes", haze: "consult" }));
  const data = new FormData();
  data.set("condition.day_shoots", "no");
  data.set("condition.haze", "consult");
  data.set("condition.pyrotechnics", "");
  assert.equal(JSON.stringify(conditions.parseLocationConditions(data)), JSON.stringify({ day_shoots: "no", haze: "consult" }));
});

test("characteristics preserve unknown as absent rather than zero or false", () => {
  const empty = characteristics.parseLocationCharacteristics(new FormData());
  assert.equal(JSON.stringify(empty), JSON.stringify({ ok: true, value: {} }));
  const data = new FormData();
  data.set("characteristic.surface_m2", "120.5");
  data.set("characteristic.wifi", "no");
  const parsed = characteristics.parseLocationCharacteristics(data);
  assert.equal(JSON.stringify(parsed), JSON.stringify({ ok: true, value: { surface_m2: 120.5, wifi: false } }));
});

test("migration keeps one tour field and protects public access through projections", () => {
  const sql = fs.readFileSync("supabase/migrations/20260928010000_locations_beta_v1.sql", "utf8");
  assert.equal((sql.match(/add column tour_video_url/g) ?? []).length, 1);
  assert.match(sql, /drop policy locations_public_read/);
  assert.match(sql, /revoke select on public\.locations, public\.location_photos from anon/);
  assert.match(sql, /create function public\.get_public_location/);
  assert.match(sql, /c\.is_public/);
  assert.doesNotMatch(sql, /service_role/);
});
