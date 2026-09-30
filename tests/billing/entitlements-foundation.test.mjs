import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import load from './load.mjs';

const resolver = load('lib/entitlements/resolver.ts');
const catalog = load('lib/entitlements/catalog.ts');
const migration = fs.readFileSync(
  'supabase/migrations/20260930050000_entitlements_foundation_v1.sql',
  'utf8'
);
const planBadge = fs.readFileSync('components/entitlements/PlanBadge.tsx', 'utf8');
const featureBadge = fs.readFileSync(
  'components/entitlements/FeaturePlanBadge.tsx',
  'utf8'
);
const upgradeGate = fs.readFileSync(
  'components/entitlements/UpgradeGate.tsx',
  'utf8'
);
const adminPage = fs.readFileSync('app/admin/planes/page.tsx', 'utf8');
const entitlementTree = [
  fs.readFileSync('lib/entitlements/types.ts', 'utf8'),
  fs.readFileSync('lib/entitlements/catalog.ts', 'utf8'),
  fs.readFileSync('lib/entitlements/resolver.ts', 'utf8'),
  fs.readFileSync('lib/entitlements/server.ts', 'utf8'),
  upgradeGate,
].join('\n');

test('plan hierarchy and Business compatibility are explicit', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(resolver.PLAN_HIERARCHY)),
    ['free', 'starter', 'plus', 'pro', 'pro_plus']
  );
  assert.equal(resolver.normalizePlanCode('business'), 'pro_plus');
  assert.equal(resolver.normalizePlanCode('unknown'), null);
  assert.equal(resolver.planIncludes('plus', 'starter'), true);
  assert.equal(resolver.planIncludes('pro', 'plus'), true);
  assert.equal(resolver.planIncludes('pro_plus', 'pro'), true);
  assert.equal(resolver.planIncludes('starter', 'plus'), false);
});

test('minimum-plan features inherit upward without granting downward', () => {
  const starterLearn = resolver.resolveEntitlementCheck({
    plan: 'starter', entitlement: 'learn.full_access',
  });
  const plusAdvanced = resolver.resolveEntitlementCheck({
    plan: 'plus', entitlement: 'search.advanced_filters',
  });
  const proProduction = resolver.resolveEntitlementCheck({
    plan: 'pro', entitlement: 'production.assistant',
  });
  const proPlusProduction = resolver.resolveEntitlementCheck({
    plan: 'pro_plus', entitlement: 'production.assistant',
  });
  const plusMatchmaking = resolver.resolveEntitlementCheck({
    plan: 'plus', entitlement: 'search.project_matchmaking',
  });

  assert.equal(starterLearn.allowed, true);
  assert.equal(plusAdvanced.allowed, true);
  assert.equal(proProduction.allowed, true);
  assert.equal(proPlusProduction.allowed, true, 'PRO+ inherits PRO');
  assert.equal(plusMatchmaking.allowed, false);
  assert.equal(plusMatchmaking.reason, 'PLAN_LOCKED');
  assert.equal(plusMatchmaking.requiredPlan, 'pro');
});

test('explicit entitlement overrides can deny a higher plan safely', () => {
  const definition = {
    key: 'test.override',
    name: 'Override',
    description: 'Test',
    minimumPlan: 'plus',
    upgradeTitle: 'Test',
    upgradeDescription: 'Test',
    values: {
      plus: { access: true },
      pro: { access: false },
      pro_plus: { access: true },
    },
  };

  assert.equal(resolver.resolveEntitlementValue('plus', definition).access, true);
  assert.equal(resolver.resolveEntitlementValue('pro', definition).access, false);
  assert.equal(resolver.resolveEntitlementValue('pro_plus', definition).access, true);
});

test('unknown and unavailable checks fail safe without becoming upgrades', () => {
  const unknown = resolver.resolveEntitlementCheck({
    plan: 'pro_plus', entitlement: 'unknown.feature',
  });
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.reason, 'UNKNOWN_ENTITLEMENT');

  const unavailable = resolver.resolveEntitlementCheck({
    plan: 'pro', entitlement: 'search.project_matchmaking', available: false,
  });
  assert.equal(unavailable.allowed, false);
  assert.equal(unavailable.reason, 'UNAVAILABLE');
});

test('allowances resolve by plan and distinguish exhaustion reasons', () => {
  const expectedCredits = {
    starter: 50,
    plus: 200,
    pro: 500,
    pro_plus: 1000,
  };
  for (const [plan, allowance] of Object.entries(expectedCredits)) {
    const result = resolver.resolveEntitlementCheck({
      plan, entitlement: 'writer.ai_credits',
    });
    assert.equal(result.allowed, true);
    assert.equal(result.allowance, allowance);
  }

  const creditsExhausted = resolver.resolveEntitlementCheck({
    plan: 'starter',
    entitlement: 'writer.ai_credits',
    usage: { used: 50, periodStartsAt: null, periodEndsAt: null },
  });
  assert.equal(creditsExhausted.reason, 'AI_CREDITS_EXHAUSTED');
  assert.equal(creditsExhausted.remaining, 0);

  const searchesExhausted = resolver.resolveEntitlementCheck({
    plan: 'plus',
    entitlement: 'search.monthly_allowance',
    usage: { used: 100, periodStartsAt: null, periodEndsAt: null },
  });
  assert.equal(searchesExhausted.reason, 'ALLOWANCE_EXHAUSTED');
});

test('baseline profile allowances remain 1 Reel, 2 videos and 6 photos', () => {
  const expectations = {
    'profiles.reels': 1,
    'profiles.complementary_videos': 2,
    'profiles.photos': 6,
  };
  for (const [entitlement, allowance] of Object.entries(expectations)) {
    const result = resolver.resolveEntitlementCheck({ plan: 'free', entitlement });
    assert.equal(result.allowed, true);
    assert.equal(result.allowance, allowance);
  }
  assert.equal(
    resolver.resolveEntitlementCheck({
      plan: 'free', entitlement: 'profiles.extra_storage',
    }).allowed,
    false
  );
});

test('central catalog exposes stable semantic keys and configurable prices', () => {
  assert.equal(catalog.PLAN_DEFINITIONS.starter.currentPriceMxn, 139);
  assert.equal(catalog.PLAN_DEFINITIONS.plus.currentPriceMxn, 299);
  assert.equal(catalog.PLAN_DEFINITIONS.pro.currentPriceMxn, 599);
  assert.equal(catalog.PLAN_DEFINITIONS.pro_plus.currentPriceMxn, 999);
  assert.equal(catalog.getEntitlementDefinition('search.project_matchmaking').minimumPlan, 'pro');
  assert.equal(catalog.getEntitlementDefinition('services.business_profile').minimumPlan, 'pro_plus');
  assert.equal(catalog.getEntitlementDefinition('unknown'), null);
});

test('server resolver uses the new RPC, legacy fallback and fail-safe baseline', async () => {
  const central = load('lib/entitlements/server.ts', {
    react: { cache: (fn) => fn },
    '@/lib/supabase/server': {
      createClient: async () => ({ rpc: async (name) => {
        assert.equal(name, 'get_my_entitlement_context');
        return { data: [{
          effective_plan: 'pro_plus', billing_plan: 'pro', grant_plan: 'pro_plus',
          grant_expires_at: null, access_source: 'test',
        }], error: null };
      } }),
    },
  });
  assert.equal(await central.getEffectivePlan(), 'pro_plus');
  assert.equal((await central.getEntitlementContext()).source, 'test');

  const calls = [];
  const legacy = load('lib/entitlements/server.ts', {
    react: { cache: (fn) => fn },
    '@/lib/supabase/server': {
      createClient: async () => ({ rpc: async (name) => {
        calls.push(name);
        return name === 'get_my_entitlement_context'
          ? { data: null, error: { code: 'PGRST202', message: 'missing function' } }
          : { data: [{
              effective_plan: 'plus', stripe_plan: 'plus', admin_grant_plan: null,
              admin_grant_expires_at: null, access_source: 'stripe',
            }], error: null };
      } }),
    },
  });
  assert.equal(await legacy.getEffectivePlan(), 'plus');
  assert.deepEqual(calls, ['get_my_entitlement_context', 'get_my_billing_access']);

  const failed = load('lib/entitlements/server.ts', {
    react: { cache: (fn) => fn },
    '@/lib/supabase/server': {
      createClient: async () => ({ rpc: async () => ({
        data: null, error: { code: 'XX000', message: 'network failure' },
      }) }),
    },
  });
  const context = await failed.getEntitlementContext();
  assert.equal(context.plan, 'free');
  assert.equal(context.status, 'unavailable');
  assert.equal(context.source, 'fail_safe');
});

test('migration is additive, protected by RLS and separates usage economies', () => {
  assert.match(migration, /create table public\.subscription_plans/);
  assert.match(migration, /create table public\.plan_entitlements/);
  assert.match(migration, /create table public\.entitlement_usage/);
  assert.match(migration, /alter table public\.subscription_plans enable row level security/);
  assert.match(migration, /alter table public\.plan_entitlements enable row level security/);
  assert.match(migration, /alter table public\.entitlement_usage enable row level security/);
  assert.match(migration, /entitlement_usage_own_read/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /create function public\.get_my_entitlement_context\(\)/);
  assert.match(migration, /coalesce\(r\.grant_plan, r\.billing_plan, 'free'\)/);
  assert.match(migration, /order by g\.created_at desc/);
  assert.match(migration, /legacy_aliases.*business/i);
  assert.doesNotMatch(migration, /drop table|truncate table/i);
  assert.doesNotMatch(migration, /contact_credits/i,
    'Contact Credits remain a separate economy');
});

test('plan and feature badges share one accessible visual system', () => {
  assert.match(planBadge, /getPlanVisual/);
  assert.match(planBadge, /aria-label=\{`Plan FILMATTA/);
  assert.match(planBadge, /normalized === "free" && !showBaseline/);
  assert.match(planBadge, /if \(plan === "pro_plus"\) return "PRO\+"/);
  assert.match(featureBadge, /<PlanBadge plan=\{plan\} size="feature"/);
});

test('UpgradeGate distinguishes commercial and unavailable states accessibly', () => {
  assert.match(upgradeGate, /if \(access\.allowed\) return/);
  assert.match(upgradeGate, /<dialog/);
  assert.match(upgradeGate, /aria-label="Cerrar"/);
  assert.match(upgradeGate, /Ahora no/);
  assert.match(upgradeGate, /Mejorar plan/);
  assert.match(upgradeGate, /dialogRef\.current\?\.close\(\)/);
  assert.match(upgradeGate, /access\.reason === "UNAVAILABLE"/);
  assert.match(upgradeGate, /No disponible/);
  assert.match(upgradeGate, /AI_CREDITS_EXHAUSTED/);
  assert.match(upgradeGate, /STORAGE_LIMIT/);
  assert.match(upgradeGate, /allowance_exhausted/);
});

test('admin simulator exposes all five states and stays server-authorized', () => {
  for (const plan of ['free', 'starter', 'plus', 'pro', 'pro_plus']) {
    assert.match(adminPage, new RegExp(`name="plan" value="${plan}"`));
  }
  assert.match(adminPage, /La asignación revoca los grants explícitos anteriores/);
  assert.match(adminPage, /requireAdmin/);
});

test('Entitlements Foundation introduces no Stripe or checkout coupling', () => {
  assert.doesNotMatch(
    entitlementTree,
    /from ["']stripe["']|startCheckout|checkout\.sessions|STRIPE_PRICE/i
  );
});
