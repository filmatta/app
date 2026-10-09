import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const projectA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const legacyProject = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

test("workspace creation is private and idempotent, and cover reads stay bound to the owning Project", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table auth.users (id uuid primary key);
      insert into auth.users (id) values ('${ownerA}'), ('${ownerB}');
      create table public.projects (
        id uuid primary key, owner_id uuid not null references auth.users(id),
        title text not null, slug text not null unique,
        status text not null default 'draft', lifecycle_status text not null default 'draft',
        visibility text not null default 'private', create_enabled boolean not null default false,
        cover_image_path text
      );
      alter table public.projects enable row level security;
      grant usage on schema auth to authenticated;
      grant select on public.projects to anon;
      grant select, insert, update on public.projects to authenticated;
      create policy projects_owner_read on public.projects for select to authenticated using (owner_id = auth.uid());
      create policy projects_public_read on public.projects for select to anon, authenticated
        using (lifecycle_status = 'active' and visibility = 'public');
      create policy projects_owner_insert on public.projects for insert to authenticated with check (owner_id = auth.uid());
      create policy projects_owner_update on public.projects for update to authenticated
        using (owner_id = auth.uid()) with check (owner_id = auth.uid());
      create schema storage;
      create table storage.objects (bucket_id text not null, name text not null);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated;
      grant select on storage.objects to anon, authenticated;
      create policy project_covers_authorized_read on storage.objects for select to anon, authenticated using (false);
    `);
    const legacyCover = `${ownerA}/${legacyProject}/legacy.jpg`;
    await db.query(
      "insert into public.projects(id,owner_id,title,slug,status,lifecycle_status,visibility,cover_image_path) values($1,$2,$3,$4,'published','active','public',$5)",
      [legacyProject, ownerA, "Proyecto legado", "legacy-project", legacyCover],
    );
    await db.query("insert into storage.objects(bucket_id,name) values('project-covers',$1)", [legacyCover]);
    await db.exec(fs.readFileSync("supabase/migrations/20261009010000_projects_workspace_identity_v1.sql", "utf8"));

    const as = async (role, uid = "") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
      if (role !== "postgres") await db.exec(`set role ${role}`);
    };
    await as("authenticated", ownerA);
    const createdA = await db.query("select public.create_workspace_project_v1($1,$2,$3) as id", [projectA, "Película A", "writer"]);
    assert.equal(createdA.rows[0].id, projectA);
    const retried = await db.query("select public.create_workspace_project_v1($1,$2,$3) as id", [projectA, "Película A", "writer"]);
    assert.equal(retried.rows[0].id, projectA);
    assert.equal((await db.query("select id from projects where create_enabled=true")).rows.length, 1);
    const legacy = (await db.query("select entry_module,cover_source,cover_image_path from projects where id=$1", [legacyProject])).rows[0];
    assert.deepEqual(legacy, { entry_module: null, cover_source: null, cover_image_path: legacyCover });
    await assert.rejects(db.query("select public.create_workspace_project_v1($1,$2,$3)", [projectA, "Película distinta", "writer"]), /PROJECT_OPERATION_REUSED/);
    await assert.rejects(db.query("select public.create_workspace_project_v1($1,$2,$3)", ["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Inválido", "unknown"]), /PROJECT_CREATE_INVALID/);

    await as("authenticated", ownerB);
    assert.equal((await db.query("select id from projects where id=$1", [projectA])).rows.length, 0);
    await assert.rejects(db.query("select public.create_workspace_project_v1($1,$2,$3)", [projectA, "Película A", "writer"]), /PROJECT_OPERATION_REUSED/);
    await db.query("select public.create_workspace_project_v1($1,$2,$3)", [projectB, "Película B", "production"]);

    const pathB = `${ownerB}/${projectB}/cover.webp`;
    const unreferencedOwnCover = `${ownerA}/${projectA}/old-cover.png`;
    await as("postgres");
    await db.query("update public.projects set cover_image_path=$1 where id=$2", [pathB, projectB]);
    await db.query("update public.projects set cover_image_path=$1 where id=$2", [pathB, projectA]);
    await db.query("insert into storage.objects(bucket_id,name) values('project-covers',$1)", [pathB]);
    await db.query("insert into storage.objects(bucket_id,name) values('project-covers',$1)", [unreferencedOwnCover]);

    await as("authenticated", ownerA);
    assert.equal((await db.query("select name from storage.objects where name=$1", [pathB])).rows.length, 0);
    assert.equal((await db.query("select name from storage.objects where name=$1", [unreferencedOwnCover])).rows.length, 1);
    await as("authenticated", ownerB);
    assert.equal((await db.query("select name from storage.objects where name=$1", [pathB])).rows.length, 1);
    assert.equal((await db.query("select name from storage.objects where name=$1", [unreferencedOwnCover])).rows.length, 0);

    await as("postgres");
    await db.query("update public.projects set lifecycle_status='active', visibility='public' where id=$1", [projectB]);
    await as("anon");
    assert.equal((await db.query("select name from storage.objects where name=$1", [pathB])).rows.length, 0);
    assert.equal((await db.query("select name from storage.objects where name=$1", [unreferencedOwnCover])).rows.length, 0);
    assert.equal((await db.query("select name from storage.objects where name=$1", [legacyCover])).rows.length, 1);
  } finally {
    await db.close();
  }
});
