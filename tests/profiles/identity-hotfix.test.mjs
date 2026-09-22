import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

// Execute the actual identity form handlers; keep hook state between renders.
function identityForm({photoSaved = true} = {}) {
  const state = [], refs = [], calls = [];
  let cursor = 0, refCursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => state[i] = typeof v === 'function' ? v(state[i]) : v]; },
    useRef(initial) { const i = refCursor++; return refs[i] ??= {current: initial}; },
    useEffect() {},
  };
  const deps = {
    react, 'react/jsx-runtime': jsx,
    '@/components/ui/FilmattaAccordion': {default: 'accordion'},
    '@/components/ui/SelectionRow': {default: 'selection'},
    './IdentityImageEditor': {default: 'image-editor'},
    '@/lib/profiles/constants': {PROFILE_DISCIPLINES: ['A','B','C','D','E','F'], AVAILABILITY_LABELS: {available:'Disponible'}},
    '@/lib/profiles/bio-policy': {analyzeBio: () => ({blocked:false})},
    '@/lib/profiles/rate': {RATE_CURRENCIES: []},
    './portfolio-actions': {savePortfolioSection: async () => {calls.push('save-section'); return {data: {profile:{}}};}},
  };
  const source = ts.transpileModule(fs.readFileSync('app/mi-perfil/PortfolioDialogs.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod = {exports:{}};
  vm.runInNewContext(source, {module:mod,exports:mod.exports,require:name => deps[name] ?? {}, FormData: class {entries(){return [];} getAll(){return [];} get(){return null;}}});
  const profile = {disciplines:[],skills:[],equipment:[],presentation:{credits:[]},availability:'available'};
  const render = () => {cursor=0;refCursor=0;return mod.exports.SectionDialog({section:'identity',profile,bioDraft:'',setBioDraft(){},done(){calls.push('done');},close(){calls.push('close');}});};
  const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node,...walk(node.props?.children)];
  const nodes = () => walk(render());
  const image = nodes().find(n => n.type === 'image-editor');
  assert.ok(image.props.continueRef, 'parent save must own the pending identity upload');
  image.props.continueRef.current = {save:async () => {calls.push('save-photo');return photoSaved;}};
  return {nodes,calls};
}

test('identity Save waits for pending first photo/replacement before saving latest profile and closing', async () => {
  const h = identityForm();
  await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});
  assert.deepEqual(h.calls,['save-photo','save-section','done','close']);
});
test('failed identity upload preserves the open editor instead of silently saving without photo', async () => {
  const h=identityForm({photoSaved:false});
  await h.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});
  assert.deepEqual(h.calls,['save-photo']);
});
test('discipline counter follows 0–5, blocks sixth immediately, and permits replacing a choice', () => {
  const h=identityForm();
  const rows=()=>h.nodes().filter(n=>n.type==='selection' && n.props.name==='disciplines');
  for(let i=0;i<5;i++) {
    assert.equal(h.nodes().find(n=>n.type==='accordion').props.summary,`${i} de 5 seleccionadas`);
    rows()[i].props.onChange({target:{checked:true}});
  }
  rows()[5].props.onChange({target:{checked:true}});
  assert.equal(rows().filter(n=>n.props.checked).length,5);
  assert.equal(rows()[5].props.checked,false);
  assert.ok(h.nodes().some(n=>n.props?.role==='alert' && n.props.children==='Ya seleccionaste 5 disciplinas. Quita una para agregar otra.'));
  rows()[0].props.onChange({target:{checked:false}});
  rows()[5].props.onChange({target:{checked:true}});
  assert.equal(rows()[5].props.checked,true);
  assert.equal(h.nodes().find(n=>n.type==='accordion').props.summary,'5 de 5 seleccionadas');
});
