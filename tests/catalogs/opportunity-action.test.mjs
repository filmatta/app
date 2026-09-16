import assert from "node:assert/strict";
import test from "node:test";
import load from "../load.mjs";
const parser = load("lib/opportunities/form.ts");
const filters = load("lib/catalogs/filters.ts");
function setup(user, error = null) {
  const calls = [];
  const action = load("app/mis-oportunidades/actions.ts", {
    "@/lib/opportunities/form": parser,
    "@/lib/catalogs/filters": filters,
    "next/cache": {
      revalidatePath: (...args) => calls.push(["revalidate", ...args]),
    },
    "next/navigation": {
      redirect: (url) => {
        throw new Error(`redirect:${url}`);
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        rpc: async (name, args) => {
          calls.push([name, args]);
          return { error };
        },
      }),
    },
  });
  return { calls, save: action.saveOpportunity };
}
function valid() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    title: "Convocatoria",
    project_title: "Corto",
    category: "crew",
    work_mode: "remote",
    compensation_type: "unspecified",
  }))
    f.set(k, v);
  return f;
}
test("anonymous calls cannot reach the publishing RPC", async () => {
  const x = setup(null);
  assert.match((await x.save({ error: "" }, valid())).error, /Inicia sesión/);
  assert.equal(x.calls.length, 0);
});
test("owner identity is never taken from form data and revalidation follows success only", async () => {
  const x = setup({ id: "real-user" });
  const f = valid();
  f.set("owner_id", "forged");
  await assert.rejects(
    x.save({ error: "" }, f),
    /redirect:\/mis-oportunidades\?saved=1/,
  );
  assert.equal(x.calls[0][0], "save_my_opportunity");
  assert.equal(Object.hasOwn(x.calls[0][1].p_data, "owner_id"), false);
  assert.ok(
    x.calls.some(
      (c) => c[0] === "revalidate" && c[1] === "/oportunidades/[slug]",
    ),
  );
});
test("missing RPC preserves form and reports setup failure without redirecting", async () => {
  const x = setup({ id: "user" }, { code: "PGRST202" });
  assert.match(
    (await x.save({ error: "" }, valid())).error,
    /no está configurada/,
  );
  assert.equal(x.calls.length, 1);
});
