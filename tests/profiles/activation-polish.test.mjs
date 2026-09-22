import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import load from "../load.mjs";
const a = load("lib/profiles/activation.ts"),
  safe = load("lib/auth/safe-next-path.ts");
const read = (p) => fs.readFileSync(p, "utf8");
test("signup alone and Learn preserve their destination; explicit profile intents opt in", () => {
  assert.equal(safe.getSafePostAuthPath(null), "/cuenta");
  for (const p of ["/learn", "/cursos/fotografia", "/cursos/luz/lecciones/uno"])
    assert.equal(safe.getSafePostAuthPath(p), p);
  for (const i of ["talent", "crew"])
    assert.equal(
      safe.getSafePostAuthPath(a.onboardingPath(i)),
      `/onboarding/perfil?intent=${i}`,
    );
  assert.match(
    read("app/mi-perfil/page.tsx"),
    /if \(!minimumProfile\(profile\)\) redirect\("\/onboarding\/perfil"\)/,
  );
});
test("nine-step checkpoints include photo after draft; historical migration remains immutable", () => {
  for (let i = 1; i <= 9; i++) assert.equal(a.resumeStep(i), i);
  assert.equal(a.resumeStep(10), 1);
  const sql = read(
    "supabase/migrations/20260926020000_profile_activation_polish.sql",
  );
  assert.match(sql, /when 4 then 5 when 5 then 6 when 6 then 7 when 7 then 9/);
  assert.match(sql, /onboarding_identity\|\|jsonb_build_object/);
  assert.match(
    read("supabase/migrations/20260926010000_profile_activation.sql"),
    /between 1 and 7/,
  );
});
test("quick preferences never infer rejection and retain the existing taxonomy", () => {
  assert.equal(a.quickPreference(true), "accept");
  assert.equal(a.quickPreference(false), "unspecified");
  const ui = read("app/onboarding/perfil/Onboarding.tsx");
  assert.match(ui, /PROJECT_FORMATS\.map/);
  assert.match(ui, /PREFERENCE_GROUPS\.conditions/);
  assert.match(ui, /changedConditions/);
  assert.match(ui, /formatsChanged/);
});
test("identity UX has no alias, and Continue controls photo persistence", () => {
  const ui = read("app/onboarding/perfil/Onboarding.tsx");
  assert.doesNotMatch(ui, /alias|nombre artístico/i);
  assert.match(ui, /imageEditor\.current\.save\(\)/);
  const image = read("app/mi-perfil/IdentityImageEditor.tsx");
  assert.doesNotMatch(image, /Guardar imagen/);
  assert.match(image, /Cambiar imagen/);
  assert.match(image, /setStored/);
});
test("cover presets are six local optimized licensed assets; no derived Book or Reel cover", () => {
  const presets = load("lib/profiles/cover-presets.ts").PROFILE_COVER_PRESETS;
  assert.equal(presets.length, 6);
  const manifest = JSON.parse(read("content/image-sources.json"));
  for (const p of presets) {
    assert.ok(fs.existsSync("public" + p.src));
    assert.ok(
      manifest.images
        .find((i) => i.file === p.src)
        ?.source.startsWith("https://www.pexels.com/photo/"),
    );
  }
  const ui = read("components/profiles/ProfilePortfolio.tsx");
  assert.doesNotMatch(ui, /p\.book\.find/);
  assert.match(read("app/mi-perfil/ProfileEditor.tsx"), /Cambiar portada/);
});
test("anonymous global create is not rendered; authenticated actions stay intact", () => {
  const ui = read("components/networking/NetworkingHeader.tsx");
  assert.match(
    ui,
    /authenticated\s*&&\s*<Disclosure key=\{pathname\s*\+\s*"-create"\}/,
  );
  for (const route of [
    "/proyectos/nuevo",
    "/mis-locaciones/nueva",
    "/mis-servicios/nuevo",
  ])
    assert.ok(ui.includes(route));
});
test("compact catalog uses only identity, bounded tags and explicit profile link", () => {
  const ui = read("components/profiles/ProfileCard.tsx");
  assert.match(ui, /ProfileAvatar/);
  assert.doesNotMatch(
    ui,
    /leadReel|reelSource|cover_media_id|portfolio_items|p\.book/,
  );
  assert.match(ui, /limit=\{3\}/);
  assert.match(ui, /Ver perfil/);
  assert.match(
    read("components/profiles/profile-card.css"),
    /repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
});
