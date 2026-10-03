import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import load from "../load.mjs";

const read = (path) => fs.readFileSync(path, "utf8");

test("dashboard reads only owned Writer and Shotlist documents", async () => {
  const filters = [];
  const records = {
    writer_scripts: [{ id: "script", title: "La Frecuencia", updated_at: "2026-10-02T10:00:00Z" }],
    writer_shotlists: [{ id: "shots", script_id: "script", title: "Cobertura", updated_at: "2026-10-02T11:00:00Z" }],
  };
  const client = {
    from(table) {
      const chain = {
        select() { return chain; },
        eq(key, value) { filters.push([table, key, value]); return chain; },
        order() { return chain; },
        limit() { return Promise.resolve({ data: records[table], error: null }); },
      };
      return chain;
    },
  };
  const { getAccountDashboard } = load("lib/account/dashboard.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
  });
  const result = await getAccountDashboard("qa-owner");
  assert.equal(result.scripts.length, 1);
  assert.equal(result.shotlists.length, 1);
  assert.equal(result.recent[0].kind, "shotlist");
  assert.equal(result.shotlists[0].relation, "Vinculada a Writer");
  assert.ok(filters.every(([, key, value]) => key === "owner_id" && value === "qa-owner"));
});
test("dashboard fails soft without inventing progress or last-opened state", async () => {
  const client = {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
        limit() { return Promise.resolve({ data: null, error: { code: "offline" } }); },
      };
      return chain;
    },
  };
  const { getAccountDashboard } = load("lib/account/dashboard.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
  });
  const result = await getAccountDashboard("qa-owner");
  assert.equal(result.recent.length, 0);
  assert.equal(result.partial, true);
  const page = read("app/cuenta/page.tsx");
  assert.match(page, /Editado /);
  assert.doesNotMatch(page, /último abierto|\d+%/i);
});

test("CREATE dashboard keeps real account, learning and subscription routes", () => {
  const page = read("app/cuenta/page.tsx");
  assert.match(page, /if \(!viewer\) redirect/);
  for (const href of [
    "/writer",
    "/shotlists",
    "/cursos",
    "/cuenta/configuracion#configuracion",
    "/cuenta/configuracion#seguridad",
    "/cuenta/suscripcion",
  ]) {
    assert.ok(page.includes(`href="${href}"`) || page.includes(`href={surface.href!}`));
  }
  assert.match(page, /FILMATTA<\/span> CREATE/);
  assert.match(page, /¿En qué vas a trabajar hoy\?/);
  assert.doesNotMatch(page, /Mis locaciones|Solicitudes \/ Contactos|Mi red/);
});
