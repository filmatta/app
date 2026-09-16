import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import load from "../billing/load.mjs";
const nav = load("lib/navigation.ts");

test("session navigation preserves hierarchy and unique destinations", () => {
  for (const authenticated of [false, true]) {
    const items = nav.getPrimaryNavigation(authenticated);
    assert.equal(items[0].label, "Perfiles");
    assert.equal(items[1].label, "Oportunidades");
    assert.equal(items.filter(item => item.label === "Jobs").length, 0);
    assert.equal(items.filter(item => item.label === "Talento").length, 0);
    const routes = items.flatMap(item => item.children ?? [item]);
    assert.equal(new Set(routes.map(item => item.href)).size, routes.length);
  }
});
test("account navigation uses exact server role and existing account routes", () => {
  for (const role of ["user", "instructor", "", "ADMIN"]) {
    assert.equal(nav.getAccountNavigation(role).some(item => item.href === "/admin"), false);
  }
  assert.ok(nav.getAccountNavigation("admin").some(item => item.href === "/admin"));
  assert.ok(nav.getAccountNavigation("user").some(item => item.href === "/cuenta/suscripcion"));
  assert.ok(nav.getAccountNavigation("user").some(item => item.href === "/cuenta#mis-cursos"));
});
test("every enabled navigation and publishing destination has a page", () => {
  const links = [false, true].flatMap(auth => nav.getPrimaryNavigation(auth).flatMap(item => item.children ?? [item]));
  links.push(...nav.getAccountNavigation("admin"), ...nav.publishingNavigation);
  for (const { href } of links) {
    const route = href.split(/[?#]/)[0];
    assert.ok(fs.existsSync(`app${route}/page.tsx`) || (route.startsWith("/descubre/") && fs.existsSync("app/descubre/[vertical]/page.tsx")), href);
  }
});
test("active matching respects path boundaries", () => {
  assert.equal(nav.isNavigationActive("/perfiles/ana", "/perfiles"), true);
  assert.equal(nav.isNavigationActive("/perfiles-extra", "/perfiles"), false);
  assert.equal(nav.isNavigationActive("/cursos", "/"), false);
  assert.equal(nav.isNavigationActive("/oportunidades", "/oportunidades?category=casting"), true);
});
