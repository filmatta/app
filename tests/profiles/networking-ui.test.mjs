import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
test('project create and edit redirect after save; archive remains separate',()=>{
  const code=read('components/networking/ProjectForm.tsx');
  assert.ok(code.indexOf('if (!value.roles.length)')<code.indexOf('await saveNetworkingProject'));
  assert.match(code,/Selecciona al menos una opción/);
  assert.match(code,/router.push\(initial \? "\/mis-proyectos\?saved=1" : "\/mis-proyectos\?created=1"\)/);
  assert.match(code,/setSaved\(n => n \+ 1\)/);
  assert.match(read('app/proyectos/page.tsx'),/Proyecto creado/);
});
test('accepted process and open contacts share the accepted query but preserve distinct presentation',()=>{
  const code=read('app/cuenta/contactos/page.tsx');
  assert.match(code,/box === "accepted_requests" \? "accepted" : box/);
  assert.match(code,/\["received","Recibidas"\],\["sent","Enviadas"\],\["accepted_requests","Aceptadas"\],\["expired","Vencidas"\]/);
  assert.match(code,/view=\{box === "accepted" \? "contact" : "request"\}/);
  const card=read('components/networking/ContactRequestCard.tsx');
  assert.match(card,/Ver contacto/); assert.match(card,/#contact-/);
});
test('selection rows keep native keyboard input inside one label and profile styles cannot override layout',()=>{
  const code=read('components/ui/SelectionRow.tsx');
  assert.match(code,/<label className="selection-row"><input/);assert.doesNotMatch(code,/onClick/);
  assert.match(read('components/profiles/portfolio-editor.css'),/label:not\(\.selection-row\)/);
});
