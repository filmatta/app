// Test-only operator helper. Never log returned credentials or child process errors.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
export const TEST_REF = "ezlycwkuzkwcnhrhiruv";
export const SUPABASE_CLI =
  "C:/Users/atlun/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe";
export const VERCEL_CLI =
  "C:/Users/atlun/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/vercel/dist/vc.js";
export async function testContext() {
  if (process.env.FILMATTA_RUN_REMOTE_TESTS !== TEST_REF)
    throw new Error("Test opt-in required");
  let keys;
  try {
    keys = JSON.parse(
      execFileSync(
        SUPABASE_CLI,
        [
          "projects",
          "api-keys",
          "--project-ref",
          TEST_REF,
          "--reveal",
          "--output",
          "json",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
  } catch {
    throw new Error(
      "Unable to load Supabase Test credentials; details suppressed",
    );
  }
  const anon = keys.find((k) => k.name === "anon")?.api_key,
    service = keys.find((k) => k.name === "service_role")?.api_key;
  if (
    !anon ||
    !service ||
    JSON.parse(Buffer.from(service.split(".")[1], "base64url")).ref !== TEST_REF
  )
    throw new Error("Invalid Test key");
  const env = Object.fromEntries(
    fs
      .readFileSync("G:/PROYECTOS/filmatta/.env.local", "utf8")
      .split(/\r?\n/)
      .flatMap((l) => {
        const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
        return m ? [[m[1], m[2].replace(/^['"]|['"]$/g, "")]] : [];
      }),
  );
  const muxAuthorization =
    "Basic " +
    Buffer.from(env.MUX_TOKEN_ID + ":" + env.MUX_TOKEN_SECRET).toString(
      "base64",
    );
  const who = await fetch("https://api.mux.com/system/v1/whoami", {
    headers: { Authorization: muxAuthorization },
    signal: AbortSignal.timeout(15000),
  }).then((r) => r.json());
  if (
    who.data?.environment_id !== "kospfo" ||
    who.data?.environment_type !== "development"
  )
    throw new Error(
      "Local Mux credentials are not the expected Test environment",
    );
  const client = (key) =>
    createClient(`https://${TEST_REF}.supabase.co`, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return {
    anonKey: anon,
    serviceKey: service,
    client,
    admin: client(service),
    muxAuthorization,
    muxEnv: who.data.environment_id,
    muxTokenId: env.MUX_TOKEN_ID,
    muxTokenSecret: env.MUX_TOKEN_SECRET,
  };
}
export function testSql(sql) {
  if (process.env.FILMATTA_RUN_REMOTE_TESTS !== TEST_REF)
    throw new Error("Test opt-in required");
  return JSON.parse(
    execFileSync(
      SUPABASE_CLI,
      [
        "db",
        "query",
        "--linked",
        "--project-ref",
        TEST_REF,
        sql,
        "--output",
        "json",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  ).rows;
}
export async function vercel(path, init = {}) {
  const a = JSON.parse(
    fs.readFileSync(
      process.env.APPDATA + "/com.vercel.cli/Data/auth.json",
      "utf8",
    ),
  );
  const r = await fetch(
    `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=team_f1R9cvcBhfWj6XPgMiUeEczG`,
    {
      ...init,
      headers: {
        Authorization: "Bearer " + a.token,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!r.ok) {
    const failure = await r.json().catch(() => ({}));
    const code = typeof failure.error?.code === "string" && /^[a-zA-Z0-9_-]+$/.test(failure.error.code) ? failure.error.code : "unknown";
    throw new Error(`Vercel request failed (${r.status}, ${code})`);
  }
  return r.status === 204 ? null : r.json();
}
if (process.argv[2] === "inspect") {
  try {
    const c = await testContext();
    console.log(
      JSON.stringify({
        supabase: TEST_REF,
        mux: c.muxEnv,
        muxType: "development",
        keysVerified: true,
      }),
    );
    console.log(
      JSON.stringify(
        testSql(
          "select to_regclass('public.profile_media') as media_table,exists(select 1 from storage.buckets where id='profile-media') as media_bucket",
        ),
      ),
    );
  } catch {
    console.error("Test configuration verification failed. No secrets logged.");
    process.exitCode = 1;
  }
}
