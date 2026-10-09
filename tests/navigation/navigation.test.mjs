import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import load from "../load.mjs";

const nav = load("lib/navigation.ts");

test("primary navigation is focused on CREATE and excludes marketplace verticals", () => {
  for (const authenticated of [false, true]) {
    const items = nav.getPrimaryNavigation(authenticated);
    assert.equal(items.map((item) => item.label).join(","), "Herramientas,Learn");
    const routes = items.flatMap((item) => item.children ?? [item]);
    assert.ok(routes.some((item) => item.label === "Writer" && item.href === "/writer"));
    assert.ok(routes.some((item) => item.label === "Shotlist" && item.href === "/shotlists"));
    assert.ok(routes.some((item) => item.label === "Storyboard" && item.href === "/#storyboard"));
    for (const hidden of ["Perfiles", "Oportunidades", "Locaciones", "Marketplace", "Servicios"]) {
      assert.ok(routes.every((item) => item.label !== hidden));
    }
  }
});
test("Crear contains only real creation destinations", () => {
  assert.equal(nav.getCreateNavigation().map((item) => item.href).join(","), "/crear,/writer,/shotlists");
  assert.ok(nav.getCreateNavigation().every((item) => fs.existsSync(`app${item.href}/page.tsx`)));
});

test("account navigation keeps subscription, settings, profile and admin authorization", () => {
  assert.ok(nav.getAccountNavigation("user").some((item) => item.href === "/cuenta/suscripcion"));
  assert.ok(nav.getAccountNavigation("user").some((item) => item.href === "/mi-perfil"));
  assert.equal(nav.getAccountNavigation("user").some((item) => item.href === "/admin"), false);
  assert.equal(nav.getAccountNavigation("admin").some((item) => item.href === "/admin"), true);
});

test("authenticated header has only the catalog-backed CREATE menu", () => {
  const legacyHeader = fs.readFileSync("components/networking/NetworkingHeader.tsx", "utf8");
  for (const hidden of ["/mis-proyectos/nuevo", "/mis-oportunidades/nueva", "/mis-locaciones/nueva", "/mis-servicios/nuevo"]) {
    assert.equal(legacyHeader.includes(hidden), false);
  }
  const globalHeader = fs.readFileSync("components/navigation/GlobalNavigation.tsx", "utf8");
  assert.match(globalHeader, /getCreateNavigation\(\)/);
});

test("active matching respects path boundaries and home anchors", () => {
  assert.equal(nav.isNavigationActive("/writer/demo", "/writer"), true);
  assert.equal(nav.isNavigationActive("/writer-extra", "/writer"), false);
  assert.equal(nav.isNavigationActive("/cursos", "/"), false);
  assert.equal(nav.isNavigationActive("/", "/#storyboard"), true);
});

test("navigation identity remains server-derived while the menu opens the dashboard", async () => {
  let owner;
  const record = { display_name: "Profesional", presentation: { portrait_media_id: "photo", portrait_url: "https://example.com/photo.webp" } };
  const client = { from: () => ({ select: () => ({ eq: (key, id) => { owner = id; return { maybeSingle: async () => ({ data: record }) }; } }) }) };
  const { getNavigationIdentity } = load("lib/navigation-identity.ts", {
    react: { cache: (fn) => fn },
    "@/lib/supabase/server": { createClient: async () => client },
  });
  const actual = await getNavigationIdentity({ id: "owner", displayName: "Fallback" });
  assert.equal(owner, "owner");
  assert.equal(actual.accountName, "Profesional");
  const code = fs.readFileSync("components/navigation/GlobalNavigation.tsx", "utf8");
  assert.match(code, /href="\/cuenta"/);
  assert.match(code, /Dashboard →/);
  assert.match(code, /Configuración \/ cuenta/);
});
