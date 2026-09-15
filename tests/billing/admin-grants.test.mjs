import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import load from './load.mjs';

const effective = load('lib/billing/effective-plan.ts');
const grantPolicy = load('lib/billing/admin-grant-policy.ts');
const migration = fs.readFileSync(
  'supabase/migrations/20260914020000_admin_plan_grants.sql',
  'utf8'
);
const plansPage = fs.readFileSync('app/planes/page.tsx', 'utf8');
const subscriptionPage = fs.readFileSync('app/cuenta/suscripcion/page.tsx', 'utf8');
const billingReturnPage = fs.readFileSync('app/billing/return/page.tsx', 'utf8');
const billingStatusRoute = fs.readFileSync('app/api/billing/status/route.ts', 'utf8');
const adminActionsSource = fs.readFileSync('app/admin/planes/actions.ts', 'utf8');

const now = new Date('2026-09-14T12:00:00.000Z');
const active = (plan, overrides = {}) => ({
  plan,
  startsAt: '2026-09-13T12:00:00.000Z',
  expiresAt: '2026-10-14T12:00:00.000Z',
  revokedAt: null,
  ...overrides,
});

test('effective Admin Grants resolve Plus and Pro independently from Stripe', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(effective.resolveEffectiveBillingAccess({
      stripePlan: null, grants: [active('plus')], now,
    }))),
    {
      regularAccess: true,
      plan: 'plus',
      stripePlan: null,
      adminGrantPlan: 'plus',
      adminGrantExpiresAt: '2026-10-14T12:00:00.000Z',
      source: 'admin_grant',
    }
  );
  assert.equal(
    effective.resolveEffectiveBillingAccess({ stripePlan: null, grants: [active('pro')], now }).plan,
    'pro'
  );
  assert.equal(
    effective.resolveEffectiveBillingAccess({ stripePlan: 'plus', grants: [active('pro')], now }).plan,
    'pro'
  );
  assert.equal(
    effective.resolveEffectiveBillingAccess({ stripePlan: 'pro', grants: [active('plus')], now }).plan,
    'pro'
  );
  assert.equal(
    effective.resolveEffectiveBillingAccess({ stripePlan: 'plus', grants: [active('pro')], now }).source,
    'both'
  );
});

test('future, expired and revoked grants never enable access', () => {
  const invalid = [
    active('pro', { startsAt: '2026-09-15T12:00:00.000Z' }),
    active('pro', { expiresAt: '2026-09-14T11:59:59.000Z' }),
    active('pro', { revokedAt: '2026-09-14T11:00:00.000Z' }),
  ];
  for (const grant of invalid) {
    const access = effective.resolveEffectiveBillingAccess({ stripePlan: null, grants: [grant], now });
    assert.equal(access.plan, null);
    assert.equal(access.regularAccess, false);
  }

  const stripeFallback = effective.resolveEffectiveBillingAccess({
    stripePlan: 'plus',
    grants: invalid,
    now,
  });
  assert.equal(stripeFallback.plan, 'plus');
  assert.equal(stripeFallback.source, 'stripe');
});

test('unlimited grants remain active and Pro always outranks Plus', () => {
  const access = effective.resolveEffectiveBillingAccess({
    stripePlan: null,
    grants: [active('plus', { expiresAt: null }), active('pro', { expiresAt: null })],
    now,
  });
  assert.equal(access.plan, 'pro');
  assert.equal(access.adminGrantExpiresAt, null);
  assert.equal(access.regularAccess, true, 'A valid grant enables learn_regular');
});

test('a canceled Stripe plan does not remove a separate active grant', () => {
  const access = effective.resolveEffectiveBillingAccess({
    stripePlan: null,
    grants: [active('pro')],
    now,
  });
  assert.equal(access.plan, 'pro');
  assert.equal(access.source, 'admin_grant');
  assert.equal(access.regularAccess, true);
});

test('grant durations are server-derived and constrained', () => {
  assert.equal(
    grantPolicy.getAdminGrantExpiresAt('7d', now),
    '2026-09-21T12:00:00.000Z'
  );
  assert.equal(
    grantPolicy.getAdminGrantExpiresAt('30d', now),
    '2026-10-14T12:00:00.000Z'
  );
  assert.equal(
    grantPolicy.getAdminGrantExpiresAt('90d', now),
    '2026-12-13T12:00:00.000Z'
  );
  assert.equal(grantPolicy.getAdminGrantExpiresAt('none', now), null);
  assert.throws(() => grantPolicy.parseAdminGrantDuration('1d'));
  assert.throws(() => grantPolicy.parseAdminGrantPlan('business'));
});

test('Admin Grants migration is additive, audited and inaccessible directly to users', () => {
  assert.match(migration, /create table public\.admin_plan_grants/);
  assert.match(migration, /user_id uuid not null references auth\.users/);
  assert.match(migration, /granted_by uuid not null references auth\.users/);
  assert.match(migration, /starts_at <= now\(\)/);
  assert.match(migration, /revoked_at is null/);
  assert.match(migration, /expires_at is null or g\.expires_at > now\(\)/);
  assert.match(migration, /alter table public\.admin_plan_grants enable row level security/);
  assert.match(migration, /revoke all on public\.admin_plan_grants from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on public\.admin_plan_grants to service_role/);
  assert.doesNotMatch(migration, /grant delete on public\.admin_plan_grants/i,
    'The normal service path cannot hard-delete grant audit records');
  assert.doesNotMatch(migration, /create policy [^;]*admin_plan_grants/i,
    'No direct browser read or write policy exists');
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.billing_entitlements/i,
    'Grants never materialize into paid entitlements');
  assert.match(migration, /create function public\.get_my_billing_access\(\)/);
  assert.match(migration, /c\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /g\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /when r\.stripe_plan = 'pro' or r\.grant_plan = 'pro' then 'pro'/);
  assert.match(migration, /create or replace function public\.get_my_billing_plan/);
});

test('billing access reads grant origin and falls back before the migration is applied', async () => {
  const detailed = load('lib/billing/access.ts', {
    react: { cache: (fn) => fn },
    '@/lib/supabase/server': {
      createClient: async () => ({
        rpc: async (name) => {
          assert.equal(name, 'get_my_billing_access');
          return { data: [{
            effective_plan: 'pro', stripe_plan: 'plus', admin_grant_plan: 'pro',
            admin_grant_expires_at: '2026-10-14T12:00:00.000Z', access_source: 'both',
          }], error: null };
        },
      }),
    },
    './config': { billingEnabled: () => true, billingAccessConfig: () => ({}) },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await detailed.getBillingAccess())), {
    regularAccess: true,
    plan: 'pro',
    stripePlan: 'plus',
    adminGrantPlan: 'pro',
    adminGrantExpiresAt: '2026-10-14T12:00:00.000Z',
    source: 'both',
  });

  const calls = [];
  const fallback = load('lib/billing/access.ts', {
    react: { cache: (fn) => fn },
    '@/lib/supabase/server': {
      createClient: async () => ({
        rpc: async (name) => {
          calls.push(name);
          return name === 'get_my_billing_access'
            ? { data: null, error: { code: 'PGRST202', message: 'missing function' } }
            : { data: 'plus', error: null };
        },
      }),
    },
    './config': { billingEnabled: () => true, billingAccessConfig: () => ({}) },
  });
  const legacy = await fallback.getBillingAccess();
  assert.equal(legacy.plan, 'plus');
  assert.equal(legacy.stripePlan, 'plus');
  assert.equal(legacy.source, 'stripe');
  assert.deepEqual(calls, ['get_my_billing_access', 'get_my_billing_plan']);
});

test('normal users cannot invoke grant actions and admins record granted_by server-side', async () => {
  let writes = 0;
  const parserMocks = {
    parseAdminGrantPlan: () => 'pro',
    parseAdminGrantDuration: () => '30d',
    parseAdminGrantReason: () => 'QA',
    getAdminGrantExpiresAt: () => '2026-10-14T12:00:00.000Z',
  };
  const denied = load('app/admin/planes/actions.ts', {
    'next/navigation': { redirect() {} },
    'next/cache': { revalidatePath() {} },
    '@/lib/auth/require-admin': { requireAdmin: async () => { throw new Error('forbidden'); } },
    '@/lib/billing/admin-grant-policy': parserMocks,
    '@/lib/billing/admin-grants': { insertAdminPlanGrant: async () => { writes++; } },
  });
  await assert.rejects(denied.grantPlanToUser(new FormData()), /forbidden/);
  assert.equal(writes, 0);

  let inserted;
  const allowed = load('app/admin/planes/actions.ts', {
    'next/navigation': { redirect() {} },
    'next/cache': { revalidatePath() {} },
    '@/lib/auth/require-admin': { requireAdmin: async () => ({ userId: 'admin-uid' }) },
    '@/lib/billing/admin-grant-policy': parserMocks,
    '@/lib/billing/admin-grants': {
      insertAdminPlanGrant: async (value) => {
        inserted = value;
        return { id: 'target-uid' };
      },
    },
  });
  const form = new FormData();
  form.set('target', 'target-uid');
  await allowed.grantPlanToUser(form);
  assert.equal(inserted.targetIdentifier, 'target-uid');
  assert.equal(inserted.grantedBy, 'admin-uid');
  assert.equal(inserted.plan, 'pro');
});

test('revoking a grant has no Stripe or paid-entitlement mutation path', () => {
  assert.doesNotMatch(adminActionsSource, /stripe|billing_entitlements|billing_subscriptions/i);
  assert.match(adminActionsSource, /requireAdmin\(\)/);
  assert.match(adminActionsSource, /revokeAdminPlanGrant/);
});

test('grant-only presentation shows origin and avoids a useless Customer Portal', () => {
  const presentation = load('lib/billing/plan-presentation.ts');
  assert.deepEqual(
    JSON.parse(JSON.stringify(presentation.getPlanCardAction({
      planId: 'pro', currentPlan: 'plus', stripePlan: null,
      authenticated: true, billingAvailable: true,
    }))),
    { kind: 'checkout', label: 'Obtener Pro', plan: 'pro' }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(presentation.getPlanCardAction({
      planId: 'plus', currentPlan: 'pro', stripePlan: null,
      authenticated: true, billingAvailable: true,
    }))),
    { kind: 'status', label: 'Incluido en tu acceso' }
  );
  assert.match(plansPage, /Acceso otorgado por FILMATTA/);
  assert.match(plansPage, /billing\.source === "admin_grant"/);
  assert.match(subscriptionPage, /Acceso otorgado por FILMATTA/);
  assert.match(subscriptionPage, /enabled && hasStripeSubscription && <form action=\{openBillingPortal\}/,
    'Portal is rendered only for a real Stripe subscription');
  assert.match(subscriptionPage, /!hasStripeSubscription && <div/,
    'A grant alone never suppresses the safe first-subscription Checkout');
  assert.match(billingReturnPage, /initialPlan=\{access\.stripePlan\}/,
    'Administrative access cannot trigger a Stripe/Matti return welcome');
  assert.match(billingStatusRoute, /plan: access\.stripePlan/,
    'Return polling waits for Stripe instead of an unrelated grant');
});
