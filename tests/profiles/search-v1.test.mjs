import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const filters = load("lib/catalogs/filters.ts");
const search = load("lib/profiles/search.ts", {
  "@/lib/catalogs/filters": filters,
});

test("profile search URLs preserve search, filters and pagination", () => {
  const parsed = filters.parseCatalogFilters({
    q: "directora de fotografía",
    city: "Guadalajara",
    discipline: "Dirección de fotografía",
    availability: "available",
    skill: "Iluminación natural",
    page: "3",
  });
  const href = new URL(
    search.profileSearchHref(parsed),
    "https://example.invalid",
  );
  assert.equal(href.searchParams.get("q"), "directora de fotografía");
  assert.equal(href.searchParams.get("skill"), "Iluminación natural");
  assert.equal(href.searchParams.get("page"), "3");

  const withoutCity = new URL(
    search.profileSearchHref(parsed, { city: "" }),
    "https://example.invalid",
  );
  assert.equal(withoutCity.searchParams.has("city"), false);
  assert.equal(withoutCity.searchParams.has("page"), false);
});

test("profile return paths accept only the public catalog and known params", () => {
  assert.equal(
    search.safeProfileReturnPath(
      "/perfiles?q=Ana&city=Guadalajara&page=2&private=secret",
    ),
    "/perfiles?q=Ana&city=Guadalajara&page=2",
  );
  assert.equal(search.safeProfileReturnPath("https://evil.invalid/perfiles"), null);
  assert.equal(search.safeProfileReturnPath("/cuenta"), null);
});

test("search migration is indexed, deterministic and public-only", () => {
  const sql = fs.readFileSync(
    "supabase/migrations/20260930010000_profiles_search_v1.sql",
    "utf8",
  );
  assert.match(sql, /using gin \(search_document\)/i);
  assert.match(sql, /where profile\.is_public/i);
  assert.match(sql, /order by matched\.match_rank desc, matched\.updated_at desc, matched\.slug asc/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /to anon, authenticated/i);
  assert.doesNotMatch(sql, /email|phone|whatsapp|instagram/i);
});
