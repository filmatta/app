import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
test('Project V1.5 create and edit redirect after save; archive remains separate',()=>{
  const form=read('components/projects/ProjectEditorForm.tsx');
  const actions=read('app/mis-proyectos/actions.ts');
  assert.match(form,/await saveProject\(project\?\.id \?\? null, formData\)/);
  assert.match(form,/if \(result\.redirectTo\) router\.push\(result\.redirectTo\)/);
  assert.match(form,/value="archive"/);
  assert.match(actions,/projectId === null[\s\S]*`\/mis-proyectos\/\$\{project\.id\}\/editar\?created=1`/);
  assert.match(actions,/parsed\.value\.intent === "archive"[\s\S]*"\/mis-proyectos\?archived=1"/);
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
