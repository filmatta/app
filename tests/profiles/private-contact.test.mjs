import assert from "node:assert/strict";
import fs from "node:fs";
import {test} from "node:test";
import load from "../load.mjs";
const bio=load("lib/profiles/bio-policy.ts"),contacts=load("lib/profiles/private-contact.ts");
const cases=JSON.parse(fs.readFileSync("tests/profiles/bio-cases.json","utf8"));
test("shared Bio matrix preserves email, professional URLs and legitimate numbers",()=>{
 for(const c of cases) assert.equal(bio.analyzeBio(c.text).blocked,c.blocked,c.text);
 assert.equal(bio.analyzeBio("Mi correo es x@y.com").hasEmail,true);
});
test("Instagram only accepts exact profile hosts and canonical usernames",()=>{
 for(const v of ["@Cine.User","Cine.User","https://www.instagram.com/Cine.User/"])assert.equal(contacts.normalizeInstagram(v),"cine.user");
 for(const v of ["https://instagram.com.evil.org/cine","https://evil.org/instagram.com/cine","https://instagram.com/p/abc","https://instagram.com/reel/abc","a..b","user.","https://u:p@instagram.com/cine"])assert.equal(contacts.normalizeInstagram(v),null,v);
});
test("WhatsApp needs a country or explicit prefix and derives international display",()=>{
 assert.equal(contacts.normalizeWhatsApp("3312345678"),null);
 for(const [raw,country,expected] of [["3312345678","MX","+523312345678"],["020 7946 0018","GB","+442079460018"],["202-555-0123","US","+12025550123"]]){
  const p=contacts.normalizeWhatsApp(raw,country);assert.equal(p.canonical,expected);assert.equal(contacts.normalizeWhatsApp(p.canonical).display,p.display);
 }
 assert.equal(contacts.normalizeWhatsApp("Call me +12025550123"),null);
 const parsed=contacts.parsePrivateContact({instagram_username:"",whatsapp_e164:"",preferred_contact:"whatsapp",contact_visibility:"private"});assert.equal(parsed.preferred_contact,"none");
 assert.equal(contacts.parsePrivateContact({...parsed,contact_visibility:"public"}),null);
});
