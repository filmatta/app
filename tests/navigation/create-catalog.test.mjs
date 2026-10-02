import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import load from "../load.mjs";

const catalog = load("lib/create/catalog.ts");

test("CREATE catalog separates availability, visibility, destination and visual truth", () => {
  const ids = catalog.createSurfaces.map((surface) => surface.id);
  assert.equal(ids.join(","), "writer,shotlist,storyboard,production,rec,learn");
  for (const surface of catalog.createSurfaces) {
    assert.ok(["available", "beta", "development"].includes(surface.availability));
    assert.equal(typeof surface.visibility.home, "boolean");
    assert.ok(["real-ui", "concept"].includes(surface.visualKind));
  }
});
test("future concepts never appear in Crear or expose fake routes", () => {
  for (const id of ["storyboard", "production", "rec"]) {
    const surface = catalog.getCreateSurface(id);
    assert.equal(surface.availability, "development");
    assert.equal(surface.visibility.create, false);
    assert.equal(surface.href, undefined);
    assert.equal(surface.visualKind, "concept");
  }
});

test("rollback is a versioned presentation switch and legacy routes remain intact", () => {
  const experience = fs.readFileSync("lib/create/experience.ts", "utf8");
  assert.match(experience, /PublicHomeVariant = "legacy" \| "create"/);
  assert.match(experience, /PUBLIC_HOME_VARIANT.*"create"/s);
  for (const route of ["/perfiles", "/locaciones", "/oportunidades", "/mis-servicios"]) {
    assert.ok(fs.existsSync(`app${route}/page.tsx`), route);
  }
});
