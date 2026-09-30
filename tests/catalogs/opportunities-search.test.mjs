import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260930111000_opportunities_search_v1.sql",
  "utf8",
);
const publicData = readFileSync("lib/opportunities/public.ts", "utf8");
const page = readFileSync("app/oportunidades/page.tsx", "utf8");
const filters = readFileSync(
  "components/opportunities/OpportunityFilters.tsx",
  "utf8",
);

test("search migration uses native FTS with a partial GIN index", () => {
  assert.match(migration, /search_document tsvector/i);
  assert.match(migration, /plainto_tsquery/i);
  assert.match(migration, /'''\\1'':\*'/i);
  assert.match(
    migration,
    /using gin \(search_document\)[\s\S]*where status = 'published'/i,
  );
});

test("public search keeps RLS and returns an explicit safe projection", () => {
  const functionSql = migration.slice(
    migration.indexOf("create function public.list_public_opportunities"),
    migration.indexOf(
      "-- Historical Job inbox entries must not require a Project",
    ),
  );
  const projection = functionSql.slice(
    functionSql.indexOf("returns table"),
    functionSql.indexOf("language sql"),
  );

  assert.match(functionSql, /security invoker/i);
  assert.doesNotMatch(functionSql, /security definer/i);
  assert.doesNotMatch(
    projection,
    /owner_id|project_id|email|phone|whatsapp/i,
  );
  assert.match(functionSql, /opportunity\.status = 'published'/i);
  assert.match(functionSql, /left join public\.projects as project/i);
  assert.match(functionSql, /opportunity\.project_id is null or project\.id is not null/i);
  assert.match(functionSql, /project\.lifecycle_status = 'active'/i);
  assert.match(functionSql, /project\.visibility = 'public'/i);
  assert.match(functionSql, /application_deadline > now\(\)/i);
});

test("independent Opportunities omit Project context and linked rows require a public Project", () => {
  assert.match(migration, /project_id is null[\s\S]*project\.id is not null/i);
  assert.match(publicData, /project_title: string \| null/);
  assert.match(publicData, /project_slug: string \| null/);
  assert.match(publicData, /projectTitle: row\.project_title/);
});

test("historical Job inboxes preserve independent publication links", () => {
  const inboxSql = migration.slice(
    migration.indexOf("create or replace function public.list_my_catalog_inquiries"),
  );
  assert.match(inboxSql, /opportunity\.project_id is null/);
  assert.match(inboxSql, /'\/oportunidades\/' \|\| opportunity\.slug/);
  assert.match(inboxSql, /project\.lifecycle_status = 'active'/);
  assert.match(inboxSql, /project\.visibility = 'public'/);
});

test("search order is relevance, recency, then a stable id tie-breaker", () => {
  assert.match(
    migration,
    /order by matches\.relevance desc, matches\.published_at desc, matches\.id/i,
  );
  assert.match(migration, /limit least\(greatest\(coalesce\(p_limit/i);
  assert.match(publicData, /p_limit: PAGE_SIZE \+ 1/);
  assert.match(publicData, /rows\.slice\(0, PAGE_SIZE\)/);
});

test("the public catalog persists search and supported facets in URL params", () => {
  for (const param of [
    "q",
    "category",
    "city",
    "compensation",
    "workMode",
  ]) {
    assert.match(filters, new RegExp(`name=\\"${param}\\"`));
  }
  assert.match(page, /CatalogPagination/);
  assert.match(page, /returnTo=/);
  assert.match(page, /robots: filtered \? \{ index: false/);
});
