import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const read=p=>fs.readFileSync(p,'utf8');
test('profile contact leaves availability and follows media/career/preferences in DOM',()=>{
  const p=read('components/profiles/ProfilePortfolio.tsx');
  const markers=['<header','<ProfileBio','<aside','{media}','id="credits"','<ProfileProjectPreferences','<ProfileContactSection','{socialProof}'];
  const positions=markers.map(m=>p.indexOf(m));
  assert.ok(positions.every((n,i)=>n>=0&&(!i||n>positions[i-1])));
  const aside=p.slice(p.indexOf('<aside'),p.indexOf('</aside>'));
  assert.doesNotMatch(aside,/Contacto protegido|ProfileContactDialog|ProfileContactSection/);
  assert.ok(aside.indexOf('{sectionControls.skills}')<aside.indexOf('<ProfessionalDetails>'));
});
test('followers use identity only, bounded responsive proof and no visitor analytics',()=>{
  const p=read('components/profiles/ProfileSocialProof.tsx');
  assert.match(p,/portrait_media_id/);assert.match(p,/portrait_url/);assert.match(p,/p2-follower-initial/);
  assert.doesNotMatch(p,/reel|cover|mux|visit/i);assert.match(p,/if \(!followers.length\) return null/);
  assert.match(p,/slice\(0,7\)/); assert.match(p,/total-7/); assert.match(p,/total-5/);
});
test('follow optimistic state is rolled back on errors, login required, verbal details accessible',()=>{
  const p=read('components/profiles/ProfileFollow.tsx');
  assert.match(p,/setFollowing\(previous\)/);assert.match(p,/\/login\?next=/);
  const d=read('components/profiles/ProfessionalDetails.tsx');
  assert.match(d,/aria-expanded=\{open\}/);assert.match(d,/Ocultar información profesional/);assert.match(d,/Ver información profesional/);
});
test('contact UI: authentic balance, exhausted CTA, Pro anti-abuse, existing thread and fail-closed',()=>{
  const code=ts.transpileModule(read('components/profiles/ProfileContactSection.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require:name=>{
    if(name==='react/jsx-runtime')return jsx;
    if(name.endsWith('.css'))return {};
    if(name==='next/link')return function MockLink({children,...props}) {return React.createElement('a',props,children);};
    if(name==='./ProfileContactDialog')return function MockContactDialog() {return React.createElement('button',null,'Contactar');};
    throw new Error(`Unexpected UI dependency: ${name}`);
  }});
  const render=access=>renderToStaticMarkup(React.createElement(mod.exports.default,{slug:'demo',name:'Demo',closed:false,owner:false,preview:false,signedIn:true,access}));
  const base={is_pro:false,free_contact_limit:5,remaining_contacts:5,already_contacted:false,thread_id:null};
  assert.match(render(base),/5 disponibles/);
  assert.match(render({...base,reserved_contacts:2,consumed_contacts:1}),/2 reservados · 1 consumidos/);
  assert.match(render(base),/Los créditos se gastan cuando este perfil acepta tu solicitud/);
  const exhausted=render({...base,remaining_contacts:0});assert.match(exhausted,/Ver plan Pro/);assert.doesNotMatch(exhausted,/<button/);
  const pro=render({...base,is_pro:true,remaining_contacts:0});assert.match(pro,/sin límite de créditos/);assert.match(pro,/medidas contra el abuso/);assert.match(pro,/<button/);
  const thread=render({...base,remaining_contacts:0,already_contacted:true,thread_id:'known-thread'});assert.match(thread,/\/cuenta\/contactos\/known-thread/);assert.doesNotMatch(thread,/<button/);
  assert.doesNotMatch(render(null),/Te quedan|<button/);
});
