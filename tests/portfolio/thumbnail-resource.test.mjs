import test from 'node:test';
import assert from 'node:assert/strict';
import load from '../load.mjs';

function harness(resource) {
  const signed = [];
  let checks = 0;
  const route = load('app/api/portfolio/media/[id]/resource/route.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ rpc: async () => ({ data: resource, error: null }) }) },
    '@/lib/mux/server': { createValidatedMuxContext: async () => ({ environment: { id: 'test', type: 'development' }, mux: { jwt: { signPlaybackId: async (id, options) => { signed.push({ id, options }); return options.type + '-signed'; } } } }) },
    '@/lib/mux/provenance': { assertMuxEnvironmentProvenance: () => { checks++; } },
    '@/lib/profiles/presentation': { reelSource: () => null },
  }, { MUX_SIGNING_KEY: 'test', MUX_PRIVATE_KEY: 'test' });
  return { route, signed, checks: () => checks };
}
const id = '11111111-1111-4111-8111-111111111111';
test('thumbnail timestamp is stable and signed; video authorization remains separate', async () => {
  const h = harness({ source: 'mux', mux_playback_id: 'qa-playback' });
  for (let n = 0; n < 2; n++) {
    const response = await h.route.GET(new Request('https://preview.invalid/resource'), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.tokens.playback, 'video-signed');
    assert.equal(body.tokens.thumbnail, 'thumbnail-signed');
  }
  assert.equal(h.checks(), 2);
  for (const claim of h.signed.filter(s => s.options.type === 'thumbnail')) assert.equal(claim.options.params.time, '3');
  for (const claim of h.signed.filter(s => s.options.type === 'video')) assert.equal(claim.options.params, undefined);
});
test('resource denied by Auth/RLS never reaches signing', async () => {
  const h = harness(null);
  const response = await h.route.GET(new Request('https://preview.invalid/resource'), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 404);
  assert.equal(h.signed.length, 0);
  assert.equal(h.checks(), 0);
});
