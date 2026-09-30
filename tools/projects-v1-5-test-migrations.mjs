// Apply only Projects V1.5 migrations to the fixed Supabase Test project.
// Shared Test is never reset and Production is never a valid target.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  testSql,
  TEST_REF,
  SUPABASE_CLI,
} from "./portfolio-test-context.mjs";

const migrations = [
  "20260930100000_projects_v1_5_schema.sql",
  "20260930101000_project_covers.sql",
  "20260930102000_projects_opportunities_v1_5_functions.sql",
  "20260930103000_independent_job_opportunities.sql",
];

let temporary;
try {
  if (process.env.FILMATTA_RUN_REMOTE_TESTS !== TEST_REF) {
    throw new Error("Supabase Test opt-in required");
  }
  if (process.argv[2] !== "apply") throw new Error("Explicit apply required");

  const before = testSql(
    "select (select count(*) from public.projects)::int projects,(select count(*) from public.opportunities)::int opportunities",
  )[0];

  for (const file of migrations) {
    const version = file.slice(0, 14);
    const name = file.slice(15, -4);
    const source = fs.readFileSync(path.join("supabase/migrations", file), "utf8");
    if (!/^--[^]*?\bbegin;/i.test(source) || !/commit;\s*$/i.test(source)) {
      throw new Error(`Transaction required for ${file}`);
    }

    const applied = testSql(
      `select statements from supabase_migrations.schema_migrations where version='${version}'`,
    );
    if (applied.length) {
      if (
        applied[0].statements?.join("\n").replace(/\r/g, "") !==
        source.replace(/\r/g, "")
      ) {
        throw new Error(`Migration version conflict for ${version}`);
      }
      console.log("Already applied in Supabase Test", file);
      continue;
    }

    const encoded = Buffer.from(source).toString("base64");
    const tracked = source.replace(
      /commit;\s*$/i,
      `insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[convert_from(decode('${encoded}','base64'),'UTF8')]); notify pgrst,'reload schema'; commit;`,
    );
    temporary = path.join(
      os.tmpdir(),
      `filmatta-projects-v1-5-${version}-${process.pid}.sql`,
    );
    fs.writeFileSync(temporary, tracked);
    execFileSync(
      SUPABASE_CLI,
      [
        "db",
        "query",
        "--linked",
        "--project-ref",
        TEST_REF,
        "--file",
        temporary,
        "--output",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    fs.rmSync(temporary);
    temporary = undefined;
    console.log("Applied in Supabase Test", file);
  }

  const after = testSql(
    "select (select count(*) from public.projects)::int projects,(select count(*) from public.opportunities)::int opportunities",
  )[0];
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Unexpected row count change");
  }
  const contract = testSql(
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='lifecycle_status') lifecycle,exists(select 1 from information_schema.columns where table_schema='public' and table_name='opportunities' and column_name='project_id' and is_nullable='YES') independent_opportunities,exists(select 1 from storage.buckets where id='project-covers' and not public) private_cover_bucket,to_regprocedure('public.convert_my_opportunity_to_project(uuid)') is not null conversion_rpc",
  )[0];
  if (!Object.values(contract).every(Boolean)) {
    throw new Error("Projects V1.5 Test contract verification failed");
  }
  console.log(
    JSON.stringify({
      project: TEST_REF,
      preexistingCountsPreserved: after,
      contract,
    }),
  );
} catch (error) {
  const detail = String(error?.stderr ?? error?.message ?? "unknown")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[redacted]")
    .slice(0, 1200);
  console.error("Projects V1.5 Test migration failed; no other environment was targeted.", detail);
  process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { force: true });
}
