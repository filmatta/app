import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const schema = fs.readFileSync(
  "supabase/migrations/20260930100000_projects_v1_5_schema.sql",
  "utf8",
);
const storage = fs.readFileSync(
  "supabase/migrations/20260930101000_project_covers.sql",
  "utf8",
);
const functions = fs.readFileSync(
  "supabase/migrations/20260930102000_projects_opportunities_v1_5_functions.sql",
  "utf8",
);
const publicQueries = fs.readFileSync("lib/opportunities/public.ts", "utf8");

test("Projects separate lifecycle from visibility and only expose active public records", () => {
  assert.match(schema, /lifecycle_status text not null default 'draft'/);
  assert.match(schema, /visibility text not null default 'private'/);
  assert.match(
    schema,
    /alter policy projects_public_read[\s\S]*lifecycle_status = 'active'[\s\S]*visibility = 'public'/,
  );
  assert.match(schema, /projects_state_visibility_v15_check/);
});

test("Opportunities are optional Project children with compound ownership and safe deletion", () => {
  assert.match(
    schema,
    /alter table public\.opportunities alter column project_id drop not null/,
  );
  assert.match(
    schema,
    /foreign key \(project_id, owner_id\)[\s\S]*references public\.projects \(id, owner_id\)[\s\S]*on delete restrict/,
  );
  assert.match(
    schema,
    /foreign key \(owner_id\)[\s\S]*references auth\.users \(id\)[\s\S]*on delete cascade/,
  );
  assert.match(
    schema,
    /project\.id = opportunities\.project_id[\s\S]*project\.owner_id = \(select auth\.uid\(\)\)/,
  );
  assert.doesNotMatch(publicQueries, /projects!inner/);
});

test("Opportunity conversion is owner-bound, locked and idempotent", () => {
  assert.match(
    functions,
    /where item\.id=p_opportunity_id and item\.owner_id=actor for update/,
  );
  assert.match(
    functions,
    /if opportunity\.project_id is not null then return opportunity\.project_id; end if/,
  );
  assert.match(
    functions,
    /update public\.opportunities set project_id=result where id=opportunity\.id and owner_id=actor/,
  );
  assert.doesNotMatch(
    functions,
    /delete\s+from\s+public\.opportunities/i,
  );
});

test("Project cover storage stays private and is authorized through Project ownership or publication", () => {
  assert.match(storage, /'project-covers', 'project-covers', false/);
  assert.match(storage, /project\.owner_id = \(select auth\.uid\(\)\)/);
  assert.match(
    storage,
    /project\.lifecycle_status = 'active'[\s\S]*project\.visibility = 'public'/,
  );
});
