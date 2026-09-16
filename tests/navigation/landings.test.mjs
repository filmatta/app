import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import load from "../load.mjs";
const { landings, getLanding, landingActionHref } = load("content/landings.ts");
const nav = load("lib/navigation.ts");
test("anonymous navigation presents verticals; member navigation keeps direct access", () => {
  const anon = nav.getPrimaryNavigation(false);
  const member = nav.getPrimaryNavigation(true);
  assert.equal(anon[0].href, "/descubre/perfiles");
  assert.equal(member[0].href, "/perfiles");
  assert.equal(
    anon.find((item) => item.label === "Learn").href,
    "/descubre/learn",
  );
  assert.equal(member.find((item) => item.label === "Learn").href, "/cursos");
});
test("unknown editorial slugs cannot resolve through object prototype", () => {
  assert.equal(getLanding("__proto__"), null);
  assert.equal(getLanding("constructor"), null);
  assert.equal(getLanding("unknown"), null);
});
test("landings have real CTAs, complete content and no duplicated H1 values", () => {
  assert.equal(
    new Set(Object.values(landings).map((item) => item.title)).size,
    Object.keys(landings).length,
  );
  for (const landing of Object.values(landings)) {
    assert.equal(landing.capabilities.length, 3);
    assert.equal(landing.steps.length, 3);
    for (const { href } of [
      landing.primary,
      landing.secondary,
      landing.connection,
    ]) {
      if (href.startsWith("/descubre/"))
        assert.ok(getLanding(href.split("/").pop()));
      else assert.ok(fs.existsSync(`app${href.split(/[?#]/)[0]}/page.tsx`), href);
    }
  }
});
test("only creation CTAs require registration and preserve next", () => {
  assert.equal(
    landingActionHref("/mi-perfil", false),
    "/registro?next=%2Fmi-perfil",
  );
  assert.equal(landingActionHref("/mi-perfil", true), "/mi-perfil");
  assert.equal(landingActionHref("/locaciones", false), "/locaciones");
});
