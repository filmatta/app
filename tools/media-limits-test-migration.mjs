// Apply exactly the Media Limits migration to the fixed Supabase Test project.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  SUPABASE_CLI,
  TEST_REF,
  testContext,
  testSql,
} from "./portfolio-test-context.mjs";

const file = "20260927010000_free_profile_media_limits.sql";
const version = "20260927010000";
const forbiddenVersion = "20260927020000";
let temporary;

function snapshot() {
  return {
    rows: testSql(
      "select (select count(*) from public.professional_profiles)::int profiles," +
        "(select count(*) from public.profile_media)::int media",
    )[0],
    table: testSql(
      "select c.relowner::regrole::text owner,c.relrowsecurity rls,c.relacl::text acl " +
        "from pg_class c where c.oid='public.profile_media'::regclass",
    )[0],
    policies: testSql(
      "select policyname,cmd,roles::text,qual,with_check from pg_policies " +
        "where schemaname='public' and tablename='profile_media' order by policyname",
    ),
    functions: testSql(
      "select p.oid::regprocedure::text signature,p.proowner::regrole::text owner,p.proacl::text acl " +
        "from pg_proc p where p.oid in " +
        "('public.reserve_my_profile_upload(jsonb,bigint,text,text)'::regprocedure," +
        "'public.save_my_profile_media(uuid,jsonb)'::regprocedure," +
        "'public.manage_my_profile_media(uuid,text,uuid)'::regprocedure) order by 1",
    ),
  };
}

try {
  if (process.argv[2] !== "apply") throw new Error("Explicit apply required");
  await testContext();
  const source = fs.readFileSync(path.join("supabase", "migrations", file), "utf8");
  if (!/^--[^]*?\bbegin;/i.test(source) || !/commit;\s*$/i.test(source))
    throw new Error("Migration must be transactional");
  const histories = testSql(
    `select version,name,statements from supabase_migrations.schema_migrations where version in ('${version}','${forbiddenVersion}') order by version`,
  );
  const existing = histories.find((row) => row.version === version);
  if (existing) {
    if (existing.statements?.join("\n").replace(/\r/g, "") !== source.replace(/\r/g, ""))
      throw new Error("Migration version conflict");
    console.log(JSON.stringify({ project: TEST_REF, migration: file, result: "already-applied-identical" }));
    process.exit(0);
  }
  const before = snapshot();
  const encoded = Buffer.from(source).toString("base64");
  const sql = source.replace(
    /commit;\s*$/i,
    `insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','free_profile_media_limits',array[convert_from(decode('${encoded}','base64'),'UTF8')]); notify pgrst,'reload schema'; commit;`,
  );
  temporary = path.join(os.tmpdir(), `filmatta-media-limits-${process.pid}.sql`);
  fs.writeFileSync(temporary, sql);
  execFileSync(
    SUPABASE_CLI,
    ["db", "query", "--linked", "--project-ref", TEST_REF, "--file", temporary, "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  fs.rmSync(temporary);
  temporary = undefined;
  const after = snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Ownership, RLS, grants, policies or existing row counts changed");
  const applied = testSql(
    `select version,name from supabase_migrations.schema_migrations where version='${version}'`,
  );
  if (applied.length !== 1) throw new Error("Migration ledger confirmation failed");
  console.log(
    JSON.stringify({
      project: TEST_REF,
      migration: file,
      result: "applied-isolated",
      forbiddenMigrationAppliedByThisRun: false,
      preserved: ["ownership", "RLS", "policies", "grants", "existing rows"],
    }),
  );
} catch (error) {
  const detail = String(error?.stderr ?? error?.message ?? "unknown")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[redacted]")
    .slice(0, 1200);
  console.error("Isolated Test migration stopped safely.", detail);
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { force: true });
}
