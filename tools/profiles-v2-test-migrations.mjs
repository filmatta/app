// Apply only this feature's migrations to the explicit Test project. Never reset shared Test.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { testContext, testSql, TEST_REF, SUPABASE_CLI } from "./portfolio-test-context.mjs";
const migrations = ["20260923010000_profile_upload_lifecycle.sql", "20260923020000_profile_reel_selection.sql", "20260923030000_profile_identity_images_rates.sql", "20260923040000_private_profile_contact_bio.sql", "20260923050000_profile_preferences_credits.sql", "20260923060000_profile_media_attestation_grant.sql", "20260923070000_profile_bio_professional_references.sql"];
let temporary;
try {
  await testContext(); // Effective Supabase and Mux Test destination guard.
  if (process.argv[2] !== "apply") throw Error("Explicit apply required");
  const before = testSql("select (select count(*) from professional_profiles)::int profiles,(select count(*) from profile_media)::int media")[0];
  for (const file of migrations) {
    const version = file.slice(0,14), name = file.slice(15,-4);
    const source = fs.readFileSync(path.join("supabase/migrations",file), "utf8");
    if (!/^--[^]*?\bbegin;/i.test(source) || !/commit;\s*$/i.test(source)) throw Error("Transaction required");
    const applied = testSql(`select statements from supabase_migrations.schema_migrations where version='${version}'`);
    if (applied.length) {
      if (applied[0].statements?.join("\n").replace(/\r/g, "") !== source.replace(/\r/g, "")) throw Error("Migration version conflict");
      console.log("Already applied in Test", file); continue;
    }
    const encoded = Buffer.from(source).toString("base64");
    const sql = source.replace(/commit;\s*$/i, `insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[convert_from(decode('${encoded}','base64'),'UTF8')]); notify pgrst,'reload schema'; commit;`);
    temporary = path.join(os.tmpdir(), `filmatta-profiles-v2-${version}-${process.pid}.sql`);
    fs.writeFileSync(temporary, sql);
    execFileSync(SUPABASE_CLI, ["db","query","--linked","--project-ref",TEST_REF,"--file",temporary,"--output","json"], { encoding:"utf8",stdio:["ignore","pipe","pipe"] });
    fs.rmSync(temporary); temporary = undefined;
    console.log("Applied in Supabase Test", file);
  }
  const after = testSql("select (select count(*) from professional_profiles)::int profiles,(select count(*) from profile_media)::int media")[0];
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("Unexpected row count change");
  console.log(JSON.stringify({ project: TEST_REF, preexistingCountsPreserved: after, rls: testSql("select relname,relrowsecurity from pg_class where oid in ('public.professional_profiles'::regclass,'public.profile_media'::regclass,'public.profile_private_settings'::regclass)") }));
} catch { console.error("Test migration validation failed; no other environment was targeted. Inspect Test safely before continuing."); process.exitCode = 1; }
finally { if (temporary) fs.rmSync(temporary, { force:true }); }
