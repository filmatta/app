import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import load from "../load.mjs";
const read=p=>fs.readFileSync(p,"utf8");
test("legacy dashboard executes permanent redirect to the canonical account",()=>{
 const page=load("app/mi-cuenta/page.tsx",{"next/navigation":{permanentRedirect:path=>{throw new Error(path)}}});
 assert.throws(()=>page.default(),{message:"/cuenta"});
 assert.doesNotMatch(read("app/mi-cuenta/page.tsx"),/getAccountDashboard|SiteHeader/);
});
test("account navigation has one canonical dashboard and preserves professional identity",()=>{
 const nav=load("lib/navigation.ts").getAccountNavigation("user");
 assert.equal(nav.filter(x=>x.href==="/cuenta").length,1);
 assert.equal(nav.find(x=>x.href==="/cuenta").label,"Cuenta");
 assert.ok(nav.some(x=>x.href==="/mi-perfil"));
 assert.ok(nav.some(x=>x.href==="/cuenta/contactos"));
 assert.ok(nav.every(x=>x.href!=="/mi-cuenta"));
 const menu=read("components/navigation/GlobalNavigation.tsx");
 assert.ok(menu.includes('href="/mi-perfil" className={'));
 assert.doesNotMatch(menu,/Mi cuenta|\/mi-cuenta/);
});
test("canonical dashboard and settings retain gated routes and legacy feedback",()=>{
 const dashboard=read("app/cuenta/page.tsx");
 assert.ok(dashboard.includes("login?next=%2Fcuenta"));
 assert.match(dashboard,/getAccountDashboard/);
 assert.match(dashboard,/title:"Cuenta"/);
 assert.match(dashboard,/LegacyAccountLinks/);
 assert.ok(dashboard.includes('redirect("/cuenta/configuracion?'));
 const settings=read("app/cuenta/configuracion/page.tsx");
 assert.match(settings,/<MfaTotpManager/);
 assert.match(settings,/<PrivateContactForm/);
 assert.match(settings,/id="mis-cursos"/);
 assert.ok(fs.existsSync("app/cuenta/contactos/page.tsx"));
});
