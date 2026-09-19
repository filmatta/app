import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import load from "../load.mjs";

const adminRoutes = [
  ["/admin", "app/admin/page.tsx"],
  ["/admin/cursos", "app/admin/cursos/page.tsx"],
  ["/admin/cursos/nuevo", "app/admin/cursos/nuevo/page.tsx"],
  ["/admin/cursos/[id]", "app/admin/cursos/[id]/page.tsx"],
  ["/admin/planes", "app/admin/planes/page.tsx"],
];

function guardFor(role, currentLevel, nextLevel = "aal2") {
  const supabase = {
    auth: {
      getClaims: async () => ({ data: { claims: { sub: "actor" } } }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel, nextLevel },
        }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { role } }) }),
      }),
    }),
  };
  return load("lib/auth/require-admin.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/auth/safe-next-path": load("lib/auth/safe-next-path.ts"),
    "next/navigation": { redirect: (path) => { throw new Error(path); } },
  }).requireAdmin;
}

test("every Admin route has both the shared boundary and its page guard", () => {
  const layout = fs.readFileSync("app/admin/layout.tsx", "utf8");
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(layout, /await requireAdmin\(nextPath\)/);
  assert.match(layout, /x-filmatta-request-path/);

  for (const [route, file] of adminRoutes) {
    assert.ok(fs.existsSync(file), route);
    assert.match(fs.readFileSync(file, "utf8"), /requireAdmin\(/, route);
  }
});

test("all Admin Server Actions fail through requireAdmin before privileged work", () => {
  for (const [file, expectedGuards] of [
    ["app/admin/planes/actions.ts", 2],
    ["app/admin/cursos/actions.ts", 3],
    ["app/admin/cursos/content-actions.ts", 5],
    ["app/admin/cursos/video-actions.ts", 4],
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.equal(source.match(/requireAdmin\(/g)?.length, expectedGuards, file);
  }
});

test("AAL matrix applies to root and nested Admin destinations", async () => {
  for (const [route] of adminRoutes) {
    await assert.rejects(
      guardFor("admin", "aal1")(route),
      (error) => error.message === `/verificar-admin?next=${encodeURIComponent(route)}`,
      `admin aal1 ${route}`,
    );
    assert.equal((await guardFor("admin", "aal2")(route)).userId, "actor");
    await assert.rejects(
      guardFor("user", "aal2")(route),
      (error) => error.message === "/",
      `user aal2 ${route}`,
    );
  }
});

test("Admin browser cache cannot be a reusable authorization decision", () => {
  const boundary = fs.readFileSync("app/admin/AdminRouteRevalidator.tsx", "utf8");
  const navigation = fs.readFileSync("components/navigation/GlobalNavigation.tsx", "utf8");
  const config = fs.readFileSync("next.config.ts", "utf8");
  const proxy = fs.readFileSync("lib/supabase/proxy.ts", "utf8");

  assert.match(boundary, /router\.refresh\(\)/);
  assert.match(boundary, /event\.persisted/);
  assert.match(boundary, /window\.location\.reload\(\)/);
  assert.match(navigation, /item\.href === "\/admin"/);
  assert.match(navigation, /<a key=\{item\.href\} href=\{item\.href\}/);
  assert.match(config, /source: "\/admin\/:path\*"/);
  assert.match(config, /private, no-store, max-age=0/);
  assert.match(proxy, /x-filmatta-request-path/);
});
