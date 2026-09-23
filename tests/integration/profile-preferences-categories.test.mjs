import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_CLI,
  TEST_REF,
} from "../../tools/portfolio-test-context.mjs";

if (process.env.FILMATTA_RUN_REMOTE_TESTS !== TEST_REF)
  throw new Error("Supabase Test opt-in required");

const run = `preferences-qa-${randomUUID()}`;
const users = [];
const keys = JSON.parse(
  execFileSync(
    SUPABASE_CLI,
    ["projects", "api-keys", "--project-ref", TEST_REF, "--reveal", "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
const anonKey = keys.find((key) => key.name === "anon")?.api_key;
const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
if (!anonKey || !serviceKey || JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url")).ref !== TEST_REF)
  throw new Error("Invalid Supabase Test credentials");

const client = (key) => createClient(`https://${TEST_REF}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = client(serviceKey);
const anonymous = client(anonKey);
function ok(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? "request_failed"}`);
  return result.data;
}
async function createUser(index) {
  const password = `${randomBytes(24).toString("base64url")}aA1!`;
  const email = `${run}-${index}@example.invalid`;
  const user = ok(await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { qa_run: run, full_name: `Preferences QA ${index}` },
  }), "create Test user").user;
  users.push(user.id);
  const session = client(anonKey);
  ok(await session.auth.signInWithPassword({ email, password }), "normal Test login");
  return { id: user.id, session };
}

try {
  const owner = await createUser(1);
  const stranger = await createUser(2);
  const slug = ok(await owner.session.rpc("save_my_professional_profile", {
    p_disciplines: ["Dirección"],
    p_city: "QA Test",
    p_bio: "Perfil sintético temporal para preferencias.",
    p_availability: "available",
    p_skills: [],
    p_equipment: [],
    p_portfolio_items: [],
    p_is_public: true,
    p_contact_policy: "members_only",
  }), "create Test profile");

  const historical = {
    formats: ["Cortometraje"],
    open_formats: false,
    themes: { drama: "consult" },
    participation: { nudity: "decline" },
    conditions: { travel: "consult" },
  };
  ok(await owner.session.rpc("save_my_project_preferences_visibility", {
    p_preferences: historical,
    p_publish: true,
  }), "save historical preferences");

  ok(await owner.session.rpc("save_my_profile_quick_preferences", {
    p_patch: {
      formats: ["Cortometraje", "Educativo"],
      participation: { camera_presenting: "accept", motion_capture: "unspecified" },
      conditions: { day_shoots: "accept" },
    },
  }), "save onboarding preferences");
  const afterOnboarding = ok(await owner.session
    .from("profile_private_settings")
    .select("project_preferences")
    .single(), "reload onboarding preferences").project_preferences;
  assert.equal(afterOnboarding.themes.drama, "consult");
  assert.equal(afterOnboarding.participation.nudity, "decline");
  assert.equal(afterOnboarding.participation.camera_presenting, "accept");
  assert.equal(afterOnboarding.participation.motion_capture, "unspecified");
  assert.equal(afterOnboarding.conditions.travel, "consult");
  assert.equal(afterOnboarding.conditions.day_shoots, "accept");

  const edited = {
    ...afterOnboarding,
    participation: {
      ...afterOnboarding.participation,
      temporary_hair_color: "consult",
    },
    conditions: {
      ...afterOnboarding.conditions,
      remote_work: "decline",
      studio: "accept",
      preproduction: "consult",
    },
  };
  ok(await owner.session.rpc("save_my_project_preferences_visibility", {
    p_preferences: edited,
    p_publish: true,
  }), "save editor preferences");
  const reloaded = ok(await owner.session
    .from("profile_private_settings")
    .select("project_preferences")
    .single(), "reload editor preferences").project_preferences;
  assert.deepEqual(reloaded, edited);

  const publicValue = ok(await anonymous.rpc("get_public_project_preferences", { p_slug: slug }), "public projection");
  assert.deepEqual(publicValue, edited);
  assert.equal(publicValue.conditions.remote_work, "decline");
  assert.equal(publicValue.participation.temporary_hair_color, "consult");
  assert.equal(publicValue.participation.motion_capture, "unspecified");

  assert.equal(ok(await stranger.session
    .from("profile_private_settings")
    .select("project_preferences")
    .eq("owner_id", owner.id), "stranger private read").length, 0);
  assert.ok((await stranger.session.from("profile_private_settings").insert({
    owner_id: owner.id,
    project_preferences: historical,
  })).error);
  const unchanged = ok(await owner.session
    .from("profile_private_settings")
    .select("project_preferences")
    .single(), "owner remains unchanged").project_preferences;
  assert.deepEqual(unchanged, edited);

  ok(await owner.session.rpc("save_my_professional_profile", {
    p_disciplines: ["Dirección"],
    p_city: "QA Test",
    p_bio: "Perfil sintético temporal para preferencias.",
    p_availability: "available",
    p_skills: [],
    p_equipment: [],
    p_portfolio_items: [],
    p_is_public: false,
    p_contact_policy: "members_only",
  }), "make Test profile draft");
  assert.equal(ok(await anonymous.rpc("get_public_project_preferences", { p_slug: slug }), "draft projection"), null);

  console.log("PASS: Supabase Test preferences taxonomy, historical values, quick onboarding merge, four editor states, public projection and RLS.");
} finally {
  for (const id of users) {
    const user = ok(await admin.auth.admin.getUserById(id), "verify Test fixture").user;
    assert.equal(user.user_metadata.qa_run, run);
    ok(await admin.auth.admin.deleteUser(id), "delete Test fixture");
  }
  console.log("PASS: temporary Preferences Test users and profiles removed.");
}
