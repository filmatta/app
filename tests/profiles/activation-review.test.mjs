import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import load from "../load.mjs";
const read = (p) => fs.readFileSync(p, "utf8");
function component(file, deps = {}) {
  const code = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: (name) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsx;
      if (Object.hasOwn(deps, name)) return deps[name];
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  return mod.exports.default;
}
test("preference groups are initially collapsed with named regions and selection counts", () => {
  const Accordion = component("components/ui/FilmattaAccordion.tsx");
  const html = renderToStaticMarkup(
    React.createElement(
      Accordion,
      { title: "Formatos de proyecto", summary: "3 seleccionados" },
      "Opciones",
    ),
  );
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /role="region"[^>]*hidden=""/);
  assert.match(html, /3 seleccionados/);
  const onboarding = read("app/onboarding/perfil/Onboarding.tsx");
  assert.match(onboarding, /PROFILE_PREFERENCE_CATEGORIES\.map/);
  assert.match(onboarding, /closedLabel="Ver opciones"/);
  assert.doesNotMatch(onboarding, /defaultOpen/);
});
test("publication selection preserves native form value and one accessible label", () => {
  const Row = component("components/ui/SelectionRow.tsx");
  const html = renderToStaticMarkup(
    React.createElement(
      Row,
      { name: "is_public", defaultChecked: true },
      "Perfil público y compartible",
    ),
  );
  assert.match(html, /<label[^>]*selection-row/);
  assert.match(html, /type="checkbox"[^>]*name="is_public"[^>]*checked=""/);
  assert.match(html, /aria-hidden="true"/);
  const modal = read("app/mi-perfil/PortfolioDialogs.tsx");
  assert.match(modal, /<SelectionRow\s+name="is_public"/);
});
test("preference save invalidates public preview only after authenticated successful mutation", async () => {
  const prefs = load("lib/profiles/project-preferences.ts");
  for (const state of ["signed-out", "failed", "saved"]) {
    const calls = [];
    const db = {
      auth: {
        getUser: async () => ({
          data: { user: state === "signed-out" ? null : { id: "owner" } },
          error: null,
        }),
      },
      rpc: async (name, args) => {
        calls.push([name, args]);
        return { error: state === "failed" ? {} : null };
      },
    };
    const actions = load("app/mi-perfil/preference-actions.ts", {
      "@/lib/supabase/server": { createClient: async () => db },
      "@/lib/profiles/project-preferences": prefs,
      "next/cache": { revalidatePath: (...args) => calls.push(args) },
    });
    const result = await actions.saveProjectPreferences(
      prefs.EMPTY_PREFERENCES,
    );
    assert.equal(Boolean(result.error), state !== "saved");
    assert.equal(
      calls.some((c) => c[0] === "/perfiles/[slug]"),
      state === "saved",
    );
    if (state === "saved") assert.equal(calls[0][0], "save_my_project_preferences");
    if (state === "signed-out") assert.equal(calls.length, 0);
  }
});
test("owner editing has one full-mode action while empty sections stay actionable", () => {
  const editor = read("app/mi-perfil/ProfileEditor.tsx");
  assert.equal((editor.match(/: "Editar perfil"/g) ?? []).length, 1);
  assert.match(editor, /editAction=/);
  assert.match(editor, /emptyAdd=\{addEmpty\}/);
  assert.match(editor, /Construir CV/);
  assert.match(editor, /section\("credits", "CV"\)/);
  const profile = read("components/profiles/ProfilePortfolio.tsx");
  assert.equal((profile.match(/className="p2-availability"/g) ?? []).length, 1);
  assert.ok(
    profile.indexOf('className="p2-availability"') <
      profile.indexOf("<h1"),
  );
  assert.doesNotMatch(profile, /preferencesNotice/);
  assert.match(
    read("app/perfiles/[slug]/page.tsx"),
    /get_public_project_preferences/,
  );
});

test("public preferences show real values and omit unspecified without publication controls", () => {
  const prefs = load("lib/profiles/project-preferences.ts");
  const View = component("components/profiles/ProfileProjectPreferences.tsx", {
    "@/components/ui/FilmattaAccordion": ({children}) => React.createElement("section", null, children),
    "@/components/ui/StatusBadge": ({children}) => React.createElement("span", null, children),
    "@/components/ui/MetaChip": { MetaChips: () => null },
    "@/lib/profiles/project-preferences": prefs,
    "./ProfileDetailIcon": () => null,
  });
  const render = value => renderToStaticMarkup(React.createElement(View, {value}));
  assert.equal(render({...prefs.EMPTY_PREFERENCES, themes: {romance:"unspecified"}}), "");
  const html = render({...prefs.EMPTY_PREFERENCES, themes: {romance:"accept", comedy:"consult", drama:"decline", horror:"unspecified"}});
  for (const label of ["Sí ✓", "Consultar ?", "No ×"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Terror|Sin especificar/);
  const dialog = read("app/mi-perfil/ProjectPreferencesDialog.tsx");
  assert.doesNotMatch(dialog, /setPublished|Quiero publicar|permanecen privadas/);
  assert.doesNotMatch(read("app/onboarding/perfil/Onboarding.tsx"), /Sólo las compartirás|Son privadas/);
});
