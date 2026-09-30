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
  assert.equal(
    filters.parseCatalogFilters({ compensation: "sponsored" }).compensation,
    "",
  );
  assert.equal(
    filters.parseCatalogFilters({ compensation: "collaboration" })
      .compensation,
    "collaboration",
  );
  assert.equal(filters.escapeLike("100%_\\"), "100\\%\\_\\\\");
});
test("pagination preserves encoded filters without page-one clutter", () => {
  const parsed = filters.parseCatalogFilters({
    city: "México & León",
    category: "crew",
    compensation: "paid",
  });
  const next = new URL(
    filters.catalogPageHref("/oportunidades", parsed, 2),
    "https://example.invalid",
  );
  assert.equal(next.searchParams.get("city"), "México & León");
  assert.equal(next.searchParams.get("page"), "2");
  assert.equal(next.searchParams.get("category"), "crew");
  assert.equal(next.searchParams.get("compensation"), "paid");
  assert.equal(
    filters.catalogPageHref("/perfiles", filters.parseCatalogFilters({}), 1),
    "/perfiles",
  );
});

function clientFixture(data = [], error = null) {
  const calls = [];
  const query = {};
  for (const method of ["select", "eq", "ilike", "order", "range", "in", "gte"])
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
test("location filters and stable pagination use the explicit public projection", async () => {
  const f = clientFixture();
  const mod = load("lib/locations/public.ts", {
    react: { cache: (fn) => fn },
    "@/lib/catalogs/filters": filters,
    "@/lib/locations/characteristics": load("lib/locations/characteristics.ts"),
    "@/lib/locations/conditions": load("lib/locations/conditions.ts"),
    "@/lib/locations/pricing": load("lib/locations/pricing.ts"),
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
  const call = f.calls.find((c) => c[0] === "rpc");
  assert.equal(call[1], "list_public_locations");
  assert.equal(call[2].p_city, "100%");
  assert.equal(call[2].p_environment, "interior");
  assert.equal(call[2].p_offset, 24);
  assert.equal(call[2].p_limit, 25);
});
test("opportunity search sends only bounded public filters to the catalog RPC", async () => {
  const f = clientFixture();
  const mod = load("lib/opportunities/public.ts", {
    react: { cache: (fn) => fn },
    "@/lib/catalogs/filters": filters,
    "@/lib/supabase/server": { createClient: async () => f.client },
  });
  await mod.getPublishedOpportunities(
    filters.parseCatalogFilters({
      q: "directora de foto",
      category: "crew",
      city: "Guadalajara",
      compensation: "paid",
      workMode: "remote",
    }),
  );
  const call = f.calls.find((c) => c[0] === "rpc");
  assert.equal(call[1], "list_public_opportunities");
  assert.deepEqual(
    {
      q: call[2].p_q,
      category: call[2].p_category,
      city: call[2].p_city,
      compensation: call[2].p_compensation,
      workMode: call[2].p_work_mode,
      offset: call[2].p_offset,
      limit: call[2].p_limit,
    },
    {
      q: "directora de foto",
      category: "crew",
      city: "Guadalajara",
      compensation: "paid",
      workMode: "remote",
      offset: 0,
      limit: 25,
    },
  );
  assert.equal(Object.hasOwn(call[2], "owner_id"), false);
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
    assert.equal(f.calls[0][1], "list_public_professional_portfolios");
    assert.equal(f.calls[0][2].p_talent, true);
    assert.equal(Object.hasOwn(f.calls[0][2], "user_id"), false);
  }
});

test("Profiles Search V1 sends bounded URL filters to the public search RPC", async () => {
  const f = clientFixture([
    {
      slug: "ana",
      display_name: "Ana",
      disciplines: ["Dirección"],
      skills: ["Casting"],
      availability: "available",
      total_count: 1,
    },
  ]);
  const mod = load("lib/profiles/catalog.ts", {
    "@/lib/catalogs/filters": filters,
    "@/lib/supabase/server": { createClient: async () => f.client },
  });
  const result = await mod.getProfileCatalog(
    filters.parseCatalogFilters({
      q: "Ana",
      city: "Guadalajara",
      discipline: "Dirección",
      availability: "available",
      skill: "Casting",
      page: "2",
    }),
  );
  const call = f.calls.find((item) => item[0] === "rpc");
  assert.equal(call[1], "search_public_professional_profiles");
  assert.deepEqual(JSON.parse(JSON.stringify(call[2])), {
    p_query: "Ana",
    p_page: 2,
    p_discipline: "Dirección",
    p_city: "Guadalajara",
    p_availability: "available",
    p_skill: "Casting",
  });
  assert.equal(result.total, 1);
});

test("Jobs filters keep paid subset, currency semantics and pagination on Opportunities", async () => {
  const f = clientFixture();
  const mod = load("lib/opportunities/public.ts", {
    react: { cache: (fn) => fn },
    "@/lib/catalogs/filters": filters,
    "@/lib/supabase/server": { createClient: async () => f.client },
  });
  await mod.getPublishedOpportunities(
    filters.parseCatalogFilters({
      page: "2",
      budgetMin: "1500",
      currency: "MXN",
      deadlineFrom: "2030-01-01",
      discipline: "Edición",
    }),
    true,
  );
  const call = f.calls.find((c) => c[0] === "rpc");
  assert.equal(call[1], "list_public_opportunities");
  assert.equal(call[2].p_jobs_only, true);
  assert.equal(call[2].p_currency, "MXN");
  assert.equal(call[2].p_budget_min, 1500);
  assert.equal(call[2].p_deadline_from, "2030-01-01");
  assert.equal(call[2].p_offset, 24);
  assert.equal(call[2].p_limit, 25);
  assert.equal(
    filters.parseCatalogFilters({
      deadlineFrom: "2030-02-30",
      budgetMin: "Infinity",
      currency: "ALL",
    }).deadlineFrom,
    "",
  );
  const f2 = clientFixture();
  const mod2 = load("lib/opportunities/public.ts", {
    react: { cache: (fn) => fn },
    "@/lib/catalogs/filters": filters,
    "@/lib/supabase/server": { createClient: async () => f2.client },
  });
  await mod2.getPublishedOpportunities(
    filters.parseCatalogFilters({ budgetMin: "1500" }),
    true,
  );
  const call2 = f2.calls.find((c) => c[0] === "rpc");
  assert.equal(call2[2].p_budget_min, null);
});
