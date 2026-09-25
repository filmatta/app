import fs from "node:fs";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";

const TEST_REF = "ezlycwkuzkwcnhrhiruv";
const PROJECT_ID = "prj_JWPAu87qoRstiV6YOmcEStMU6kow";
const TEAM_ID = "team_f1R9cvcBhfWj6XPgMiUeEczG";
const SUPABASE_CLI = "C:/Users/atlun/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe";
const VERCEL_CLI = "C:/Users/atlun/AppData/Local/npm-cache/_npx/67eb4586ca667318/node_modules/vercel/dist/vc.js";

if (process.env.FILMATTA_WRITER_PREVIEW !== TEST_REF) {
  throw new Error("Explicit Writer Preview Test opt-in required.");
}

const keys = JSON.parse(execFileSync(SUPABASE_CLI, [
  "projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json",
], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const anonKey = keys.find((key) => key.name === "anon")?.api_key;
if (!anonKey) throw new Error("Supabase Test publishable key unavailable.");

fs.mkdirSync(".vercel", { recursive: true });
fs.writeFileSync(".vercel/project.json", JSON.stringify({ orgId: TEAM_ID, projectId: PROJECT_ID }));

const preview = await deploy({
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
  BILLING_ENABLED: "false",
  BILLING_MODE: "test",
  BILLING_TEST_SUPABASE_PROJECT_REF: TEST_REF,
});
const deployment = await vercel(`/v13/deployments/${new URL(preview).hostname}`);
if (deployment.projectId !== PROJECT_ID || deployment.target === "production" || deployment.readyState !== "READY") {
  throw new Error("Preview target verification failed.");
}
console.log(JSON.stringify({
  preview,
  deploymentId: deployment.id,
  projectId: deployment.projectId,
  target: deployment.target ?? "preview",
  readyState: deployment.readyState,
  commitSha: deployment.meta?.githubCommitSha ?? null,
  backend: TEST_REF,
}));

function deploy(env) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(process.execPath, [
      VERCEL_CLI,
      "deploy",
      "--yes",
      "--target", "preview",
      "--scope", "filmatta",
      "--env", "NEXT_PUBLIC_SUPABASE_URL",
      "--env", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "--env", "BILLING_ENABLED",
      "--env", "BILLING_MODE",
      "--env", "BILLING_TEST_SUPABASE_PROJECT_REF",
    ], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => { output += data; });
    child.on("error", () => reject(new Error("Preview launch failed.")));
    child.on("exit", (code) => {
      const urls = [...output.matchAll(/https:\/\/(app-[a-z0-9]+-filmatta\.vercel\.app)/g)];
      if (code || !urls.length) return reject(new Error("Preview build failed; raw output suppressed."));
      resolve(`https://${urls.at(-1)[1]}`);
    });
  });
}

async function vercel(path) {
  const auth = JSON.parse(fs.readFileSync(`${process.env.APPDATA}/com.vercel.cli/Data/auth.json`, "utf8"));
  const response = await fetch(`https://api.vercel.com${path}?teamId=${TEAM_ID}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Vercel verification failed (${response.status}).`);
  return response.json();
}
