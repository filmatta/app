import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
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
test('followers use identity only, no counters or visitor analytics',()=>{
  const p=read('components/profiles/ProfileSocialProof.tsx');
  assert.match(p,/portrait_media_id/);assert.match(p,/portrait_url/);assert.match(p,/p2-follower-initial/);
  assert.doesNotMatch(p,/reel|cover|mux|visit|count/i);assert.match(p,/if \(!followers.length\) return null/);
});
test('follow optimistic state is rolled back on errors, login required, verbal details accessible',()=>{
  const p=read('components/profiles/ProfileFollow.tsx');
  assert.match(p,/setFollowing\(previous\)/);assert.match(p,/\/login\?next=/);
  const d=read('components/profiles/ProfessionalDetails.tsx');
  assert.match(d,/aria-expanded=\{open\}/);assert.match(d,/Ocultar información profesional/);assert.match(d,/Ver información profesional/);
});
