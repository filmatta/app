import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";
const filters = load("lib/catalogs/filters.ts");

test("untrusted URL filters have bounded pages, text and enums", () => {
  assert.equal(filters.parseCatalogFilters({ page: "-1" }).page, 1);
  assert.equal(filters.parseCatalogFilters({ page: "1.9" }).page, 1);
  assert.equal(filters.parseCatalogFilters({ page: "99999999" }).page, 1000);
  assert.equal(filters.parseCatalogFilters({ city: ["A", "B"] }).city, "");
  assert.equal(
    filters.parseCatalogFilters({ city: "a".repeat(90) }).city.length,
    80,
  );
  assert.equal(
    filters.parseCatalogFilters({ availability: "evil" }).availability,
    "",
  );
  assert.equal(filters.escapeLike("100%_\\"), "100\\%\\_\\\\");
});
test("pagination preserves encoded filters without page-one clutter", () => {
  const parsed = filters.parseCatalogFilters({
    city: "México & León",
    category: "crew",
  });
  const next = new URL(
    filters.catalogPageHref("/oportunidades", parsed, 2),
    "https://example.invalid",
  );
  assert.equal(next.searchParams.get("city"), "México & León");
  assert.equal(next.searchParams.get("page"), "2");
  assert.equal(next.searchParams.get("category"), "crew");
  assert.equal(
    filters.catalogPageHref("/perfiles", filters.parseCatalogFilters({}), 1),
    "/perfiles",
  );
});

function clientFixture(data = [], error = null) {
  const calls = [];
  const query = {};
  for (const method of ["select", "eq", "ilike", "order", "range", "in"])
    query[method] = (...args) => {
      calls.push([method, ...args]);
      return query;
    };
  query.then = (resolve) => Promise.resolve({ data, error }).then(resolve);
  return {
    calls,
    client: {
      from(table) {
        calls.push(["from", table]);
        return query;
      },
      async rpc(name, args) {
        calls.push(["rpc", name, args]);
        return { data, error };
      },
    },
  };
}
test("location filters and stable pagination run on the server before photos", async () => {
  const f = clientFixture();
  const mod = load("lib/locations/public.ts", {
    react: { cache: (fn) => fn },
    "@/lib/catalogs/filters": filters,
    "@/lib/supabase/server": { createClient: async () => f.client },
  });
  const result = await mod.getPublishedLocations(
    filters.parseCatalogFilters({
      page: "2",
      city: "100%",
      environment: "interior",
    }),
  );
  assert.equal(result.ok, true);
  assert.ok(
    f.calls.some(
      (c) => c[0] === "eq" && c[1] === "status" && c[2] === "published",
    ),
  );
  assert.ok(f.calls.some((c) => c[0] === "ilike" && c[2] === "%100\\%%"));
  assert.ok(
    f.calls.some((c) => c[0] === "range" && c[1] === 24 && c[2] === 48),
  );
  assert.equal(
    f.calls
      .filter((c) => c[0] === "order")
      .map((c) => c[1])
      .join(","),
    "published_at,id",
  );
});
test("opportunity pagination excludes unpublished projects before the range", async () => {
  const f = clientFixture();
  const mod = load("lib/opportunities/public.ts", {
    react: { cache: (fn) => fn },
    "@/lib/catalogs/filters": filters,
    "@/lib/supabase/server": { createClient: async () => f.client },
  });
  await mod.getPublishedOpportunities(
    filters.parseCatalogFilters({ category: "crew", workMode: "remote" }),
  );
  assert.ok(
    f.calls.find((c) => c[0] === "select")[1].includes("projects!inner"),
  );
  assert.ok(
    f.calls.findIndex((c) => c[0] === "eq" && c[1] === "projects.status") <
      f.calls.findIndex((c) => c[0] === "range"),
  );
  assert.ok(
    f.calls.some(
      (c) => c[0] === "eq" && c[1] === "category" && c[2] === "crew",
    ),
  );
});
test("missing schema is distinguished from network failure and empty catalog", async () => {
  for (const [error, kind] of [
    [{ code: "PGRST202" }, "unconfigured"],
    [{ code: "42501" }, "error"],
    [null, null],
  ]) {
    const f = clientFixture([], error);
    const mod = load("lib/profiles/catalog.ts", {
      "@/lib/catalogs/filters": filters,
      "@/lib/supabase/server": { createClient: async () => f.client },
    });
    const result = await mod.getProfileCatalog(
      filters.parseCatalogFilters({}),
      true,
    );
    assert.equal(result.ok, kind === null);
    if (kind) assert.equal(result.kind, kind);
    assert.equal(f.calls[0][1], "list_public_professional_profiles");
    assert.equal(f.calls[0][2].p_talent, true);
    assert.equal(Object.hasOwn(f.calls[0][2], "user_id"), false);
  }
});
