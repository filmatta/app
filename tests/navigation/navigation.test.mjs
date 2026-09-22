import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import load from "../load.mjs";
const nav = load("lib/navigation.ts");

test("session navigation preserves hierarchy and unique destinations", () => {
  for (const authenticated of [false, true]) {
    const items = nav.getPrimaryNavigation(authenticated);
    assert.equal(items[0].label, "Perfiles");
    assert.equal(items[1].label, "Oportunidades");
    assert.equal(items.filter((item) => item.label === "Jobs").length, 0);
    assert.equal(items.filter((item) => item.label === "Talento").length, 0);
    const routes = items.flatMap((item) => item.children ?? [item]);
    assert.equal(new Set(routes.map((item) => item.href)).size, routes.length);
    assert.ok(routes.some((item) => item.label === "Buscar talento" && item.href === "/talento"));
  }
});
test("account navigation uses exact server role and existing account routes", () => {
  for (const role of ["user", "instructor", "", "ADMIN"]) {
    assert.equal(
      nav.getAccountNavigation(role).some((item) => item.href === "/admin"),
      false,
    );
  }
  assert.ok(
    nav.getAccountNavigation("admin").some((item) => item.href === "/admin"),
  );
  assert.ok(
    nav
      .getAccountNavigation("user")
      .some((item) => item.href === "/cuenta/suscripcion"),
  );
  assert.ok(
    nav
      .getAccountNavigation("user")
      .some((item) => item.href === "/cuenta/configuracion#mis-cursos"),
  );
});
test("every enabled navigation and publishing destination has a page", () => {
  const links = [false, true].flatMap((auth) =>
    nav.getPrimaryNavigation(auth).flatMap((item) => item.children ?? [item]),
  );
  links.push(...nav.getAccountNavigation("admin"), ...nav.publishingNavigation);
  for (const { href } of links) {
    const route = href.split(/[?#]/)[0];
    assert.ok(
      fs.existsSync(`app${route}/page.tsx`) ||
        (route.startsWith("/descubre/") &&
          fs.existsSync("app/descubre/[vertical]/page.tsx")),
      href,
    );
  }
});
test("active matching respects path boundaries", () => {
  assert.equal(nav.isNavigationActive("/perfiles/ana", "/perfiles"), true);
  assert.equal(nav.isNavigationActive("/perfiles-extra", "/perfiles"), false);
  assert.equal(nav.isNavigationActive("/cursos", "/"), false);
  assert.equal(
    nav.isNavigationActive("/oportunidades", "/oportunidades?category=casting"),
    true,
  );
  assert.equal(
    nav.isNavigationActive("/perfiles/ana", "/descubre/perfiles"),
    true,
  );
  assert.equal(nav.isNavigationActive("/descubre/learn", "/cursos"), true);
});

test("navigation identity uses the authenticated profile portrait and falls back without video metadata", async () => {
  let record = { display_name: "Profesional", presentation: { portrait_media_id: "photo", portrait_url: "https://example.com/photo.webp", reel_cover_media_id: "never", reel_cover_url: "never" } };
  let owner;
  const client = { from: table => { assert.equal(table, "professional_profiles"); return { select: () => ({ eq: (key,id) => { assert.equal(key,"user_id"); owner=id; return { maybeSingle: async()=>({data:record}) }; } }) }; } };
  const { getNavigationIdentity } = load("lib/navigation-identity.ts", { react: { cache: fn=>fn }, "@/lib/supabase/server": { createClient: async()=>client } });
  assert.equal(Object.keys(await getNavigationIdentity(null)).length,0);
  const viewer={id:"owner",displayName:"Fallback"};
  const actual=await getNavigationIdentity(viewer);
  assert.equal(owner,"owner"); assert.equal(actual.accountName,"Profesional");
  assert.equal(actual.accountPortrait.id,"photo"); assert.equal(actual.accountPortrait.url,"https://example.com/photo.webp");
  assert.ok(!JSON.stringify(actual).includes("never"));
  record=null; assert.equal((await getNavigationIdentity(viewer)).accountName,"Fallback");
});

test("menu identity is a profile link in both header variants, with account settings retained", () => {
  const code=fs.readFileSync("components/navigation/GlobalNavigation.tsx","utf8");
  const identity=code.slice(code.indexOf("function AccountIdentity"),code.indexOf("function DesktopMenu"));
  assert.match(identity,/href="\/mi-perfil"/); assert.match(identity,/Mi perfil →/);
  assert.match(code,/Configuración \/ cuenta/);
  for(const path of ["components/SiteHeader.tsx","components/student/AuthenticatedHeader.tsx"]) assert.match(fs.readFileSync(path,"utf8"),/getNavigationIdentity\(viewer\)/);
});
