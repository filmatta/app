import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("first run and replay use the same intention selector", () => {
  const dashboard = read("components/create/ProjectDashboard.tsx");
  const form = read("components/create/CreateProjectForm.tsx");
  assert.match(dashboard, /autoOpen=\{autoOpenOnboarding\}/);
  assert.match(form, /¿Dónde estás con tu proyecto\?/);
  assert.match(form, /Tengo una idea/);
  assert.match(form, /Quiero escribir un guion nuevo/);
  assert.match(form, /Ya tengo un guion o borrador/);
  assert.match(form, /Explorar por mi cuenta/);
  assert.match(form, /status: "skipped"/);
});

test("idea draft has immediate local protection and debounced server persistence", () => {
  const form = read("components/create/CreateProjectForm.tsx");
  assert.match(form, /localStorage\.setItem/);
  assert.match(form, /window\.setTimeout\(async \(\) =>/);
  assert.match(form, /}, 500\)/);
  assert.match(form, /maxLength=\{10000\}/);
  assert.match(form, /saveCreateIdeaDraftAction/);
  assert.doesNotMatch(form, /createProjectAction\(idea/);
});

test("Project Writer creation reuses the existing artifact and exposes one CTA", () => {
  const action = read("app/create/actions.ts");
  const button = read("components/create/CreateProjectWriterButton.tsx");
  assert.match(action, /if \(project\.writers\[0\]\) return \{ ok: true, writerId: project\.writers\[0\]\.id \}/);
  assert.equal((button.match(/Crear guion/g) ?? []).length, 1);
  assert.doesNotMatch(button, />Importar guion</);
});

test("onboarding schema is private and records recoverable idea state", () => {
  const migration = read("supabase/migrations/20261009030000_create_onboarding_foundation_v1.sql");
  assert.match(migration, /alter table public\.create_onboarding_states enable row level security/);
  assert.match(migration, /alter table public\.create_idea_drafts enable row level security/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /char_length\(idea\) <= 10000/);
  assert.match(migration, /existing_script_id/);
});

test("legacy Projects route returns to the canonical dashboard", () => {
  assert.match(read("app/create/projects/page.tsx"), /redirect\("\/create"\)/);
});
