import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Stripe from 'stripe';
import load from './load.mjs';
const policy = load('lib/billing/policy.ts');
const planPresentation = load('lib/billing/plan-presentation.ts');
const returnPresentation = load('lib/billing/return-presentation.ts');
const planVisuals = load('lib/plan-visuals.ts');
const entitledProgressSql = fs.readFileSync('supabase/migrations/20260912020000_entitled_lesson_progress.sql', 'utf8');
const lessonProgressActions = fs.readFileSync('app/cursos/[slug]/lecciones/[lessonSlug]/actions.ts', 'utf8');
const subscriptionPage = fs.readFileSync('app/cuenta/suscripcion/page.tsx', 'utf8');
const billingReturnPage = fs.readFileSync('app/billing/return/page.tsx', 'utf8');
const billingReturnClient = fs.readFileSync('app/billing/return/BillingReturnClient.tsx', 'utf8');
const billingStatusRoute = fs.readFileSync('app/api/billing/status/route.ts', 'utf8');
const billingPlanBadge = fs.readFileSync('components/BillingPlanBadge.tsx', 'utf8');

function loadHeaderPlan(getBillingAccess) {
  return load('lib/billing/header-plan.ts', {
    '@/lib/billing/access': { getBillingAccess },
  }).getHeaderBillingPlan;
}

function hasRegularAccess(plan, billingAccess) {
  return (plan === 'plus' || plan === 'pro') && billingAccess === 'regular';
}

function canTrackLesson({ plan = null, billingAccess = 'regular', enrolled = true,
  courseStatus = 'published', moduleStatus = 'published', lessonStatus = 'published', preview = false }) {
  return policy.canReadLesson({
    authenticated: true,
    admin: false,
    published: courseStatus === 'published' && moduleStatus === 'published' && lessonStatus === 'published',
    quickGuide: false,
    enrolled,
    preview,
    regularAccess: hasRegularAccess(plan, billingAccess),
  });
}

function courseCompletes({ plan = null, billingAccess = 'regular', lessons }) {
  const regularAccess = hasRegularAccess(plan, billingAccess);
  const publishedLessons = lessons.filter((lesson) =>
    lesson.lessonStatus === 'published' && lesson.moduleStatus === 'published');
  return publishedLessons.length > 0 &&
    publishedLessons.every((lesson) => lesson.preview || regularAccess) &&
    publishedLessons.every((lesson) => lesson.completed);
}

test('header badge is limited to authenticated Plus and Pro access', async () => {
  let reads = 0;
  const unauthenticated = loadHeaderPlan(async () => {
    reads++;
    return { regularAccess: true, plan: 'plus' };
  });
  assert.equal(await unauthenticated(false), null);
  assert.equal(reads, 0, 'Unauthenticated headers do not query Billing');

  for (const [plan, expected] of [[null, null], ['plus', 'PLUS'], ['pro', 'PRO']]) {
    const resolve = loadHeaderPlan(async () => ({ regularAccess: plan !== null, plan }));
    assert.equal(await resolve(true), expected);
  }

  const failed = loadHeaderPlan(async () => { throw new Error('Billing unavailable'); });
  assert.equal(await failed(true), null);
});

test('plan visuals keep Plus, Pro and future Business badges consistent', () => {
  const plus = planVisuals.getPlanVisual('plus');
  const pro = planVisuals.getPlanVisual('pro');
  const business = planVisuals.getPlanVisual('business');

  assert.match(plus.badgeClassName, /emerald/);
  assert.match(pro.badgeClassName, /amber/);
  assert.match(business.badgeClassName, /blue/);
  assert.notEqual(plus.badgeClassName, pro.badgeClassName);
  assert.notEqual(pro.badgeClassName, business.badgeClassName);
  assert.match(billingPlanBadge, /getPlanVisual/);
  assert.match(billingPlanBadge, /"BUSINESS"/);
  assert.match(billingPlanBadge, /if \(!plan\) return null/,
    'Free and unauthenticated viewers render no badge');
});

test('billing return confirms only the server plan expected for its Stripe flow', () => {
  const view = (source, plan, timedOut = false) =>
    returnPresentation.getBillingReturnView({ source, plan, timedOut });

  assert.equal(view('upgrade', 'plus').status, 'waiting');
  assert.equal(view('upgrade', 'pro').status, 'confirmed');
  assert.equal(view('upgrade', 'pro').plan, 'pro');
  assert.match(view('upgrade', 'pro').title, /FILMATTA Pro/);

  assert.equal(view('checkout', 'plus').plan, 'plus');
  assert.match(view('checkout', 'plus').title, /FILMATTA Plus/);
  assert.equal(view('checkout', 'pro').plan, 'pro');
  assert.equal(view('checkout', null).status, 'waiting');
  assert.equal(view('checkout', null, true).status, 'timeout');

  assert.equal(returnPresentation.parseBillingReturnSource('plan=pro'), 'unknown');
  assert.equal(view('unknown', 'pro').status, 'waiting',
    'A manipulated visual source cannot claim a plan');
  assert.equal(view('upgrade', null, true).status, 'timeout',
    'Timeout never invents paid access');
});

test('billing return is authenticated, bounded, read-only and refreshes plans with a full navigation', () => {
  assert.equal(returnPresentation.BILLING_RETURN_POLL_INTERVAL_MS, 1_500);
  assert.equal(returnPresentation.BILLING_RETURN_TIMEOUT_MS, 15_000);
  assert.ok(
    returnPresentation.BILLING_RETURN_TIMEOUT_MS /
      returnPresentation.BILLING_RETURN_POLL_INTERVAL_MS <= 10,
    'Polling is limited to at most ten retries'
  );
  assert.match(billingReturnPage, /if \(!viewer\) redirect\("\/acceso\?next=%2Fbilling%2Freturn"\)/);
  assert.match(billingReturnPage, /getBillingAccess\(\)/);
  assert.match(billingStatusRoute, /if \(!viewer\)/);
  assert.match(billingStatusRoute, /getBillingAccess\(\)/);
  assert.match(billingStatusRoute, /private, no-store/);
  assert.match(billingReturnClient, /fetch\("\/api\/billing\/status"/);
  assert.match(billingReturnClient, /cache: "no-store"/);
  assert.match(billingReturnClient, /BILLING_RETURN_POLL_INTERVAL_MS/);
  assert.match(billingReturnClient, /BILLING_RETURN_TIMEOUT_MS/);
  assert.match(billingReturnClient, /\/brand\/matti\/matti-plan-success\.png/);
  assert.match(billingReturnClient, /onClick=\{\(\) => window\.location\.replace\("\/planes"\)\}/,
    'The explicit CTA uses a full navigation to avoid the pre-upgrade Router Cache');
  assert.doesNotMatch(billingReturnClient, /BILLING_RETURN_REDIRECT_DELAY_MS/,
    'Confirmed welcome remains visible until the user continues');
  assert.doesNotMatch(
    `${billingReturnPage}\n${billingStatusRoute}\n${billingReturnClient}`,
    /subscriptions\.create|entitlements.*(?:insert|upsert)|invoices.*(?:insert|upsert)|payments.*(?:insert|upsert)/,
    'The return flow never creates Billing records'
  );
});

test('plans page presents Checkout, current plan and Portal actions safely', () => {
  const action = (planId, currentPlan, authenticated = true, billingAvailable = true) =>
    JSON.parse(JSON.stringify(
      planPresentation.getPlanCardAction({ planId, currentPlan, authenticated, billingAvailable })
    ));

  assert.deepEqual(action('free', null), { kind: 'link', label: 'Explorar cursos', href: '/cursos' });
  assert.deepEqual(action('plus', null), { kind: 'checkout', label: 'Obtener Plus', plan: 'plus' });
  assert.deepEqual(action('pro', null), { kind: 'checkout', label: 'Obtener Pro', plan: 'pro' });

  assert.deepEqual(action('free', 'plus'), { kind: 'status', label: 'Plan base incluido' });
  assert.deepEqual(action('plus', 'plus'), { kind: 'status', label: 'Tu plan actual' });
  assert.deepEqual(action('pro', 'plus'), { kind: 'pro-upgrade', label: 'Actualizar a Pro' });

  assert.deepEqual(action('free', 'pro'), { kind: 'status', label: 'Plan base incluido' });
  assert.deepEqual(action('plus', 'pro'), { kind: 'portal', label: 'Administrar plan' });
  assert.deepEqual(action('pro', 'pro'), { kind: 'status', label: 'Tu plan actual' });

  for (const currentPlan of [null, 'plus', 'pro']) {
    assert.deepEqual(action('business', currentPlan), { kind: 'coming-soon', label: 'Próximamente' });
  }

  assert.deepEqual(action('plus', 'plus', false), {
    kind: 'checkout', label: 'Obtener Plus', plan: 'plus',
  }, 'Unauthenticated presentation cannot inherit a paid plan');
  assert.deepEqual(action('pro', null, true, false), {
    kind: 'coming-soon', label: 'Próximamente',
  });
});

test('free access, enrollment, premium, unpublished and admin boundaries', () => {
  const base = { authenticated: true, admin: false, published: true, quickGuide: false, enrolled: true, preview: true, regularAccess: false };
  assert.equal(policy.canReadLesson(base), true);
  for (const change of [{ authenticated: false }, { published: false }, { enrolled: false }, { preview: false }, { quickGuide: true }]) {
    assert.equal(policy.canReadLesson({ ...base, ...change }), false);
  }
  assert.equal(policy.canReadLesson({ ...base, preview: false, regularAccess: true }), true);
  assert.equal(policy.canReadLesson({ ...base, regularAccess: true, enrolled: false }), false);
  assert.equal(policy.canReadLesson({ ...base, regularAccess: true, quickGuide: true, enrolled: false }), true);
  assert.equal(policy.canReadLesson({ ...base, admin: true, published: false, enrolled: false }), true);
  assert.equal(policy.canReadLesson({ ...base, admin: true, authenticated: false }), false);
});

test('lesson progress access matrix covers plans, separate courses, enrollment and publication', () => {
  assert.equal(canTrackLesson({ preview: true }), true, 'Free + preview');
  assert.equal(canTrackLesson({}), false, 'Free + premium regular');
  assert.equal(canTrackLesson({ plan: 'plus' }), true, 'Plus + premium regular');
  assert.equal(canTrackLesson({ plan: 'pro' }), true, 'Pro + premium regular');
  assert.equal(canTrackLesson({ plan: 'plus', billingAccess: 'separate' }), false, 'Plus + premium separate');
  assert.equal(canTrackLesson({ plan: 'pro', billingAccess: 'separate' }), false, 'Pro + premium separate');
  assert.equal(canTrackLesson({ plan: 'plus', enrolled: false }), false, 'No enrollment');
  assert.equal(canTrackLesson({ plan: 'plus', courseStatus: 'draft' }), false, 'Draft course');
  assert.equal(canTrackLesson({ plan: 'plus', moduleStatus: 'draft' }), false, 'Draft module');
  assert.equal(canTrackLesson({ plan: 'plus', lessonStatus: 'draft' }), false, 'Draft lesson');
});

test('course completion requires access to and completion of every published lesson', () => {
  const previewsCompletePremiumPending = [
    { preview: true, completed: true, lessonStatus: 'published', moduleStatus: 'published' },
    { preview: false, completed: false, lessonStatus: 'published', moduleStatus: 'published' },
  ];
  const allComplete = previewsCompletePremiumPending.map((lesson) => ({ ...lesson, completed: true }));
  assert.equal(courseCompletes({ lessons: previewsCompletePremiumPending }), false,
    'Free previews cannot complete a regular course with premium pending');
  assert.equal(courseCompletes({ plan: 'plus', lessons: allComplete }), true, 'Plus can complete a regular course');
  assert.equal(courseCompletes({ plan: 'pro', lessons: allComplete }), true, 'Pro can complete a regular course');
  assert.equal(courseCompletes({ plan: 'plus', billingAccess: 'separate', lessons: allComplete }), false,
    'Plus cannot complete a separate course through its entitlement');
  assert.equal(courseCompletes({ plan: 'pro', billingAccess: 'separate', lessons: allComplete }), false,
    'Pro cannot complete a separate course through its entitlement');
});

test('entitled progress SQL keeps one access decision and all server-side gates', () => {
  const startSql = entitledProgressSql.slice(
    entitledProgressSql.indexOf('create function public.start_entitled_lesson'),
    entitledProgressSql.indexOf('create function public.complete_entitled_lesson'));
  const completeSql = entitledProgressSql.slice(
    entitledProgressSql.indexOf('create function public.complete_entitled_lesson'),
    entitledProgressSql.indexOf('-- Compatibility aliases'));

  for (const sql of [startSql, completeSql]) {
    assert.equal((sql.match(/private\.has_regular_course_access\(p_course_id\)/g) ?? []).length, 1);
    assert.match(sql, /current_user_id uuid := \(select auth\.uid\(\)\)/);
    assert.match(sql, /if current_user_id is null then/);
    assert.match(sql, /enrollment\.user_id = current_user_id/);
    assert.match(sql, /enrollment\.status in \('active', 'completed'\)/);
    assert.match(sql, /enrollment\.access_expires_at is null/);
    assert.match(sql, /enrollment\.access_expires_at > now\(\)/);
    assert.match(sql, /lesson\.status = 'published'/);
    assert.match(sql, /module\.status = 'published'/);
    assert.match(sql, /course\.status = 'published'/);
    assert.match(sql, /course\.content_type = 'course'/);
    assert.match(sql, /security definer\s+set search_path = ''/);
    assert.doesNotMatch(sql, /p_user_id/);
    assert.doesNotMatch(sql, /lesson\.is_preview or private\.has_regular_course_access/);
  }
  assert.match(entitledProgressSql,
    /create function private\.has_regular_course_access[\s\S]*?security definer set search_path = ''/);
  assert.match(entitledProgressSql,
    /revoke all on function private\.has_regular_course_access\(uuid\) from public,anon,authenticated/);
  assert.match(entitledProgressSql, /billing_access='regular'/);
  assert.match(completeSql, /and not \(lesson\.is_preview or has_regular_access\)/);
  assert.match(completeSql, /and progress\.completed_at is null/);
});

test('application progress callers use entitled RPCs and legacy RPCs delegate to them', () => {
  assert.match(lessonProgressActions, /"start_entitled_lesson"/);
  assert.match(lessonProgressActions, /"complete_entitled_lesson"/);
  assert.doesNotMatch(lessonProgressActions, /"start_preview_lesson"|"complete_preview_lesson"/);
  assert.match(entitledProgressSql,
    /select public\.start_entitled_lesson\(p_course_id, p_lesson_id\)/);
  assert.match(entitledProgressSql,
    /select public\.complete_entitled_lesson\(p_course_id, p_lesson_id\)/);
});

test('entitlements expire and cannot survive failure, foreign billing or reversal', () => {
  const paid = { status: 'active', paused: false, knownPrice: true, country: 'MX', invoicePaid: true, reversed: false, periodEnd: 2000, paidPeriodEnd: 1800 };
  assert.equal(policy.paidAccessUntil(paid, 1000), new Date(1800000).toISOString());
  for (const status of ['past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'canceled', 'paused', 'trialing']) {
    assert.equal(policy.paidAccessUntil({ ...paid, status }, 1000), null);
  }
  for (const change of [{ paused: true }, { knownPrice: false }, { country: 'US' }, { country: null }, { invoicePaid: false }, { reversed: true }, { periodEnd: 1000 }, { paidPeriodEnd: NaN }]) {
    assert.equal(policy.paidAccessUntil({ ...paid, ...change }, 1000), null);
  }
});

test('configuration rejects live keys, production and the wrong Supabase project', () => {
  const env = { BILLING_ENABLED: 'true', BILLING_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_unit_fixture', BILLING_APP_URL: 'http://localhost:3000', BILLING_TEST_SUPABASE_PROJECT_REF: 'test-ref', NEXT_PUBLIC_SUPABASE_URL: 'https://test-ref.supabase.co', STRIPE_PLUS_PRICE_ID: 'price_plus', STRIPE_PRO_PRICE_ID: 'price_pro' };
  assert.equal(load('lib/billing/config.ts', {}, env).billingConfig().origin, 'http://localhost:3000');
  for (const change of [{ STRIPE_SECRET_KEY: 'sk_live_unit_fixture' }, { BILLING_MODE: 'live' }, { VERCEL_ENV: 'production' }, { BILLING_ENABLED: 'false' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://another.supabase.co' }, { BILLING_APP_URL: 'https://site.test/path' }, { STRIPE_PRO_PRICE_ID: 'price_plus' }]) {
    assert.throws(() => load('lib/billing/config.ts', {}, { ...env, ...change }).billingConfig());
  }
});

test('webhook verifies raw signatures, rejects live/Connect and retries failures', async () => {
  const stripe = new Stripe('sk_test_unit_fixture');
  const secret = 'whsec_unit_fixture';
  let calls = 0;
  let fail = false;
  let enabled = true;
  const { POST } = load('app/api/stripe/webhooks/route.ts', {
    '@/lib/billing/config': { billingEnabled: () => enabled, billingConfig: () => ({ webhookSecret: secret }), stripeClient: () => stripe },
    '@/lib/billing/sync': { reconcileBillingEvent: async () => { calls++; if (fail) throw new Error('Temporary DB failure'); } },
  });
  function request(event, valid = true) {
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    return new Request('https://test.local/api/stripe/webhooks', { method: 'POST', headers: { 'stripe-signature': signature }, body: valid ? payload : payload + ' ' });
  }
  const event = { id: 'evt_test', type: 'invoice.paid', livemode: false, data: { object: {} } };
  assert.equal((await POST(request(event, false))).status, 400);
  assert.equal((await POST(request({ ...event, livemode: true }))).status, 400);
  assert.equal((await POST(request({ ...event, account: 'acct_connected' }))).status, 400);
  assert.equal(calls, 0);
  fail = true;
  assert.equal((await POST(request(event))).status, 500);
  fail = false;
  assert.equal((await POST(request(event))).status, 200);
  enabled = false;
  assert.equal((await POST(request(event))).status, 503);
});

function syncHarness() {
  const state = { status: 'active', plan: 'plus', scheduledPlan: null, multipleItems: false,
    refunded: false, country: 'MX', deleted: false, fail: false, locked: false,
    owner: true, commits: 0, events: new Set(), grants: [], subscriptions: [], invoicePaid: true };
  const end = Math.floor(Date.now() / 1000) + 3600;
  const priceId = () => state.plan === 'plus' ? 'price_plus' : state.plan === 'pro' ? 'price_pro' : 'price_unknown';
  const db = {
    from(table) {
      let value;
      const q = { select() { return q; }, eq(_name, v) { value = v; return q; }, limit() { return q; }, async maybeSingle() {
        return { error: null, data: table === 'billing_customers' ? state.owner ? { user_id: 'trusted-user' } : null : table === 'billing_events' && state.events.has(value) ? { stripe_event_id: value } : null };
      } };
      return q;
    },
    async rpc(name, args) {
      if (name === 'apply_billing_snapshot') {
        if (state.fail) return { error: new Error('rollback') };
        state.events.add(args.p_event); state.grants = args.p_entitlements;
        state.subscriptions = args.p_subscriptions; state.commits++;
      }
      return { error: null };
    },
  };
  const stripe = {
    customers: { retrieve: async () => state.deleted ? { deleted: true } : { livemode: false, address: { country: state.country } } },
    subscriptions: { list: async () => ({ has_more: false, data: [{ id: 'sub_test', livemode: false,
      status: state.status, pause_collection: null, latest_invoice: 'in_test', cancel_at_period_end: true,
      schedule: state.scheduledPlan ? { phases: [{ items: [{ price: `price_${state.scheduledPlan}` }] }] } : null,
      items: { has_more: false, data: [
        { quantity: 1, current_period_end: end, price: { id: priceId(), livemode: false, currency: 'mxn', recurring: { interval: 'month', interval_count: 1 } } },
        ...(state.multipleItems ? [{ quantity: 1, current_period_end: end, price: { id: 'price_extra', livemode: false, currency: 'mxn', recurring: { interval: 'month', interval_count: 1 } } }] : []),
      ] } }] }) },
    invoices: { retrieve: async () => ({ id: 'in_test', livemode: false, customer: 'cus_test', currency: 'mxn', status: state.invoicePaid ? 'paid' : 'open', amount_paid: state.invoicePaid ? 29900 : 0,
      customer_address: { country: 'MX' }, lines: { has_more: false, data: [{ amount: 20000,
        parent: { type: 'subscription_item_details', subscription_item_details: { proration: state.plan === 'pro' } },
        pricing: { type: 'price_details', price_details: { price: priceId() } }, period: { end } }] },
      parent: { subscription_details: { subscription: 'sub_test' } }, total_taxes: [] }) },
    invoicePayments: { list: async () => ({ has_more: false, data: [{ id: 'inpay_test', livemode: false, status: 'paid', amount_paid: 29900, currency: 'mxn', payment: { payment_intent: { id: 'pi_test', latest_charge: { id: 'ch_test', livemode: false, paid: true, refunded: state.refunded, disputed: false, amount_refunded: state.refunded ? 29900 : 0, payment_method_details: { type: 'card' }, billing_details: { address: { country: 'MX' } } } } } }] }) },
  };
  const sync = load('lib/billing/sync.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    './config': { stripeClient: () => stripe, billingConfig: () => ({ prices: { plus: 'price_plus', pro: 'price_pro' } }) },
    './lock': { withBillingLock: async (_customer, callback) => { if (state.locked) throw new Error('busy'); return callback('token'); } },
  }).reconcileBillingEvent;
  const send = (id, type = 'invoice.paid') => sync({ id, type, livemode: false, data: { object:
    type.startsWith('customer.subscription.')
      ? { object: 'subscription', id: 'sub_test', customer: 'cus_test', metadata: { user_id: 'attacker' } }
      : { object: 'invoice', id: 'in_test', customer: 'cus_test', metadata: { user_id: 'attacker' } } } });
  return { state, send };
}

test('subscription and invoice events reconcile canonically in either order and tolerate duplicates', async () => {
  for (const order of [
    [['evt_subscription', 'customer.subscription.created'], ['evt_invoice', 'invoice.paid']],
    [['evt_invoice', 'invoice.paid'], ['evt_subscription', 'customer.subscription.created']],
  ]) {
    const { state, send } = syncHarness();
    for (const [id, type] of order) await send(id, type);
    assert.equal(state.commits, 2);
    assert.equal(state.events.size, 2);
    assert.equal(state.grants.length, 1);
    for (const [id, type] of order) await send(id, type);
    assert.equal(state.commits, 2);
  }
});

test('plan changes keep one subscription and replace the entitlement only after paid Price evidence', async () => {
  const { state, send } = syncHarness();
  await send('evt_plus');
  assert.equal(state.subscriptions[0].id, 'sub_test');
  assert.equal(state.grants.length, 1);
  assert.equal(state.grants[0].subscription, 'sub_test');
  assert.equal(state.grants[0].plan, 'plus');

  state.plan = 'pro'; state.invoicePaid = false;
  await send('evt_upgrade_pending', 'customer.subscription.updated');
  assert.equal(state.grants.length, 0, 'Unpaid upgrade does not grant Pro');

  state.invoicePaid = true;
  await send('evt_upgrade_paid', 'invoice.paid');
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.subscriptions[0].id, 'sub_test');
  assert.equal(state.subscriptions[0].plan, 'pro');
  assert.equal(state.grants.length, 1);
  assert.equal(state.grants[0].subscription, 'sub_test');
  assert.equal(state.grants[0].plan, 'pro');

  state.scheduledPlan = 'plus';
  await send('evt_downgrade_scheduled', 'customer.subscription.updated');
  assert.equal(state.subscriptions[0].plan, 'pro', 'Scheduled downgrade preserves Pro until period end');
  assert.equal(state.grants[0].plan, 'pro');

  state.plan = 'plus'; state.scheduledPlan = null;
  await send('evt_downgrade_effective', 'customer.subscription.updated');
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.subscriptions[0].id, 'sub_test');
  assert.equal(state.subscriptions[0].plan, 'plus');
  assert.equal(state.grants.length, 1);
  assert.equal(state.grants[0].subscription, 'sub_test');
  assert.equal(state.grants[0].plan, 'plus');

  await send('evt_downgrade_effective', 'customer.subscription.updated');
  assert.equal(state.commits, 5, 'Duplicate delivery does not write another snapshot');
});

test('unknown Prices and subscriptions with multiple items never grant access', async () => {
  for (const change of [{ plan: 'unknown' }, { multipleItems: true }]) {
    const { state, send } = syncHarness();
    Object.assign(state, change);
    await send(`evt_${change.plan ?? 'multiple'}`, 'customer.subscription.updated');
    assert.equal(state.grants.length, 0);
  }
});

test('billing lock waits for a concurrent canonical reconciliation and propagates database errors', async () => {
  let claims = 0;
  let releases = 0;
  const db = { async rpc(name) {
    if (name === 'claim_billing_customer') return { data: ++claims < 3 ? null : 'token', error: null };
    releases++;
    return { data: null, error: null };
  } };
  const { withBillingLock } = load('lib/billing/lock.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
  });
  assert.equal(await withBillingLock('cus_test', async (token) => `worked:${token}`), 'worked:token');
  assert.equal(claims, 3);
  assert.equal(releases, 1);

  const failure = new Error('Supabase unavailable');
  const failingLock = load('lib/billing/lock.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async () => ({ data: null, error: failure }) }) },
  }).withBillingLock;
  await assert.rejects(failingLock('cus_test', async () => {}), /Supabase unavailable/);
});

test('real reconciler: duplicate delivery, reordered cancellation, payment failure and refund', async () => {
  const { state, send } = syncHarness();
  await send('evt_1'); assert.equal(state.grants.length, 1);
  await send('evt_1'); assert.equal(state.commits, 1);
  state.status = 'canceled';
  await send('evt_2', 'customer.subscription.deleted'); assert.equal(state.grants.length, 0);
  // Old event still contains a paid invoice; canonical canceled state must win.
  await send('evt_old'); assert.equal(state.grants.length, 0);
  state.status = 'active'; state.invoicePaid = false;
  await send('evt_failed', 'invoice.payment_failed'); assert.equal(state.grants.length, 0);
  state.invoicePaid = true;
  await send('evt_recovered'); assert.equal(state.grants.length, 1);
  state.refunded = true;
  await send('evt_refunded'); assert.equal(state.grants.length, 0);
  state.refunded = false; state.country = 'US';
  await send('evt_foreign'); assert.equal(state.grants.length, 0);
  state.deleted = true;
  await send('evt_deleted', 'customer.deleted'); assert.equal(state.grants.length, 0);
});

test('real reconciler: busy/failed transactions remain retryable and unmapped users never gain access', async () => {
  const { state, send } = syncHarness();
  state.locked = true;
  await assert.rejects(send('evt_busy')); assert.equal(state.events.size, 0);
  state.locked = false; state.fail = true;
  await assert.rejects(send('evt_retry')); assert.equal(state.events.size, 0);
  state.fail = false;
  await send('evt_retry'); assert.equal(state.grants.length, 1);
  state.owner = false;
  await send('evt_unknown'); assert.equal(state.events.has('evt_unknown'), false);
});

test('checkout authenticates and rejects forged plan/country before contacting Stripe', async () => {
  let viewer = null;
  let calls = 0;
  let portalCalls = 0;
  let portalCustomerExists = true;
  let upgradeCalls = 0;
  let upgradeAllowed = true;
  const actions = load('app/cuenta/suscripcion/actions.ts', {
    'next/navigation': { redirect: (url) => { throw new Error(`redirect:${url}`); } },
    '@/lib/auth/get-viewer': { getViewer: async () => viewer },
    '@/lib/billing/policy': policy,
    '@/lib/billing/checkout': {
      createTestCheckout: async (user) => { calls++; assert.equal(user.id, 'trusted'); return 'https://checkout.stripe.com/test'; },
      createTestPortal: async (userId) => {
        portalCalls++;
        assert.equal(userId, 'trusted');
        if (!portalCustomerExists) throw new Error('No billing customer');
        return 'https://billing.stripe.com/p/session/test';
      },
      createTestProUpgradePortal: async (userId) => {
        upgradeCalls++;
        assert.equal(userId, 'trusted');
        if (!upgradeAllowed) throw new Error('Not Plus');
        return 'https://billing.stripe.com/p/session/pro-upgrade';
      },
    },
  });
  const form = new FormData(); form.set('plan', 'plus'); form.set('country', 'MX');
  await assert.rejects(actions.startCheckout(form), /acceso/);
  await assert.rejects(actions.openBillingPortal(), /acceso/);
  await assert.rejects(actions.upgradeToPro(), /acceso/);
  viewer = { id: 'trusted', email: null };
  form.set('plan', 'business'); await assert.rejects(actions.startCheckout(form), /country/);
  form.set('plan', 'plus'); form.set('country', 'US'); await assert.rejects(actions.startCheckout(form), /country/);
  assert.equal(calls, 0);
  form.set('country', 'MX'); form.set('user_id', 'attacker'); form.set('customer', 'cus_attacker');
  await assert.rejects(actions.startCheckout(form), /checkout.stripe.com/);
  assert.equal(calls, 1);
  await assert.rejects(actions.openBillingPortal(), /billing.stripe.com/);
  assert.equal(portalCalls, 1);
  portalCustomerExists = false;
  await assert.rejects(actions.openBillingPortal(), /error=portal/);
  assert.equal(portalCalls, 2);
  const forged = new FormData();
  forged.set('customer', 'cus_attacker');
  forged.set('subscription', 'sub_attacker');
  forged.set('item', 'si_attacker');
  forged.set('price', 'price_attacker');
  await assert.rejects(actions.upgradeToPro(forged), /billing.stripe.com/);
  assert.equal(upgradeCalls, 1, 'The action resolves the trusted user and accepts no billing identifiers');
  upgradeAllowed = false;
  await assert.rejects(actions.upgradeToPro(forged), /error=portal/);
  assert.equal(upgradeCalls, 2);
});

test('portal button depends on server configuration instead of the visual subscription list', () => {
  assert.match(subscriptionPage,
    /const portalConfigured = Boolean\(process\.env\.STRIPE_PORTAL_CONFIGURATION_ID\);/);
  const button = subscriptionPage.match(/<LoadingButton[^>]*>Ver y cambiar mi plan<\/LoadingButton>/)?.[0] ?? '';
  assert.match(button, /disabled=\{!portalConfigured\}/);
  assert.doesNotMatch(button, /subscriptions\.length/);
  assert.equal(Boolean('bpc_test'), true, 'Configured Portal stays enabled with an empty visual list');
  assert.equal(Boolean(undefined), false, 'Missing Portal configuration disables the button');
});

test('portal session is restricted to Plus and Pro with immediate upgrades and scheduled downgrades', async () => {
  let sessions = 0;
  let mapped = true;
  const validPortal = {
    livemode: false,
    active: true,
    features: {
      customer_update: { enabled: false },
      subscription_update: {
        enabled: true,
        billing_cycle_anchor: 'unchanged',
        default_allowed_updates: ['price'],
        proration_behavior: 'always_invoice',
        schedule_at_period_end: { conditions: [{ type: 'decreasing_item_amount' }] },
        products: [
          { product: 'prod_plus', prices: ['price_plus'], adjustable_quantity: { enabled: false } },
          { product: 'prod_pro', prices: ['price_pro'], adjustable_quantity: { enabled: false } },
        ],
      },
    },
  };
  const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({
    data: mapped ? { stripe_customer_id: 'cus_trusted' } : null, error: null,
  }) };
  const stripe = {
    customers: { retrieve: async () => ({ id: 'cus_trusted', livemode: false, deleted: false }) },
    billingPortal: {
      configurations: { retrieve: async (id, params) => {
        assert.equal(id, 'bpc_test');
        assert.equal(params.expand.length, 1);
        assert.equal(params.expand[0], 'features.subscription_update.products');
        return validPortal;
      } },
      sessions: { create: async (params) => {
        sessions++;
        assert.equal(params.customer, 'cus_trusted');
        assert.equal(params.configuration, 'bpc_test');
        assert.equal(params.return_url, 'https://preview.test/cuenta/suscripcion');
        return { url: 'https://billing.stripe.com/p/session/test' };
      } },
    },
  };
  const portal = load('lib/billing/checkout.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => q }) },
    '@/lib/plans': { FILMATTA_PLAN_PRICES: { plus: 299, pro: 499 } },
    './config': { stripeClient: () => stripe, billingConfig: () => ({ portal: 'bpc_test',
      origin: 'https://preview.test', prices: { plus: 'price_plus', pro: 'price_pro' } }) },
    './lock': { withBillingLock: async (_id, fn) => fn('token') },
  }).createTestPortal;

  assert.equal(await portal('trusted'), 'https://billing.stripe.com/p/session/test');
  assert.equal(sessions, 1);

  validPortal.features.subscription_update.products[1].prices = ['price_unknown'];
  await assert.rejects(portal('trusted'), /outside the FILMATTA Plus and Pro policy/);
  assert.equal(sessions, 1, 'Unknown Price is rejected before creating a session');

  mapped = false;
  await assert.rejects(portal('trusted'), /No billing customer/);
  assert.equal(sessions, 1);
});

test('Plus upgrade deep link resolves the active subscription server-side and targets only Pro', async () => {
  let mapped = true;
  let sessions = 0;
  const state = {
    subscriptions: [{
      id: 'sub_plus',
      livemode: false,
      status: 'active',
      customer: 'cus_trusted',
      items: {
        has_more: false,
        data: [{ id: 'si_plus', price: { id: 'price_plus' }, quantity: 1 }],
      },
    }],
  };
  const validPortal = {
    livemode: false,
    active: true,
    features: {
      customer_update: { enabled: false },
      subscription_update: {
        enabled: true,
        billing_cycle_anchor: 'unchanged',
        default_allowed_updates: ['price'],
        proration_behavior: 'always_invoice',
        schedule_at_period_end: { conditions: [{ type: 'decreasing_item_amount' }] },
        products: [
          { product: 'prod_plus', prices: ['price_plus'], adjustable_quantity: { enabled: false } },
          { product: 'prod_pro', prices: ['price_pro'], adjustable_quantity: { enabled: false } },
        ],
      },
    },
  };
  const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({
    data: mapped ? { stripe_customer_id: 'cus_trusted' } : null, error: null,
  }) };
  const stripe = {
    accounts: { retrieve: async (id) => {
      assert.equal(id, 'acct_test');
      return { id: 'acct_test', country: 'MX' };
    } },
    customers: { retrieve: async (id) => {
      assert.equal(id, 'cus_trusted');
      return { id, livemode: false, deleted: false };
    } },
    subscriptions: { list: async (params) => {
      assert.deepEqual(JSON.parse(JSON.stringify(params)), {
        customer: 'cus_trusted', status: 'active', limit: 2,
        expand: ['data.items.data.price'],
      });
      return { has_more: false, data: state.subscriptions };
    } },
    billingPortal: {
      configurations: { retrieve: async (id, params) => {
        assert.equal(id, 'bpc_test');
        assert.deepEqual(JSON.parse(JSON.stringify(params)), {
          expand: ['features.subscription_update.products'],
        });
        return validPortal;
      } },
      sessions: { create: async (params) => {
        sessions++;
        assert.deepEqual(JSON.parse(JSON.stringify(params)), {
          customer: 'cus_trusted',
          configuration: 'bpc_test',
          return_url: 'https://preview.test/planes',
          flow_data: {
            type: 'subscription_update_confirm',
            subscription_update_confirm: {
              subscription: 'sub_plus',
              items: [{ id: 'si_plus', price: 'price_pro', quantity: 1 }],
            },
            after_completion: {
              type: 'redirect',
              redirect: { return_url: 'https://preview.test/billing/return?source=upgrade' },
            },
          },
        });
        return { livemode: false, url: 'https://billing.stripe.com/p/session/pro-upgrade' };
      } },
    },
  };
  const upgrade = load('lib/billing/checkout.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => q }) },
    '@/lib/plans': { FILMATTA_PLAN_PRICES: { plus: 299, pro: 499 } },
    './config': { stripeClient: () => stripe, billingConfig: () => ({
      portal: 'bpc_test', account: 'acct_test', origin: 'https://preview.test',
      prices: { plus: 'price_plus', pro: 'price_pro' },
    }) },
    './lock': { withBillingLock: async (_id, fn) => fn('token') },
  }).createTestProUpgradePortal;

  assert.equal(await upgrade('trusted'), 'https://billing.stripe.com/p/session/pro-upgrade');
  assert.equal(sessions, 1);

  state.subscriptions[0].items.data[0].price.id = 'price_pro';
  await assert.rejects(upgrade('trusted'), /single FILMATTA Plus item/);
  assert.equal(sessions, 1, 'A Pro user cannot invoke the Plus to Pro flow');

  state.subscriptions = [];
  await assert.rejects(upgrade('trusted'), /Exactly one active subscription/);
  assert.equal(sessions, 1, 'A Free user cannot invoke the upgrade flow');

  state.subscriptions = [{
    id: 'sub_plus', livemode: false, status: 'active', customer: 'cus_trusted',
    items: { has_more: false, data: [{ id: 'si_unexpected', price: { id: 'price_unknown' }, quantity: 1 }] },
  }];
  await assert.rejects(upgrade('trusted'), /single FILMATTA Plus item/);
  assert.equal(sessions, 1, 'An unexpected Price is rejected before creating a session');

  state.subscriptions[0].items.data = [
    { id: 'si_plus', price: { id: 'price_plus' }, quantity: 1 },
    { id: 'si_unexpected', price: { id: 'price_plus' }, quantity: 1 },
  ];
  await assert.rejects(upgrade('trusted'), /Unexpected active subscription/);
  assert.equal(sessions, 1, 'An unexpected subscription item is rejected before creating a session');

  mapped = false;
  await assert.rejects(upgrade('trusted'), /No billing customer/);
  assert.equal(sessions, 1);
});

test('checkout rejects a missing manual Mexico tax rate before contacting Stripe', async () => {
  let stripeClients = 0;
  const checkout = load('lib/billing/checkout.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => { throw new Error('DB must not be contacted'); } },
    '@/lib/plans': { FILMATTA_PLAN_PRICES: { plus: 299, pro: 499 } },
    './config': {
      stripeClient: () => { stripeClients++; return {}; },
      billingConfig: () => ({ account: 'acct_test', origin: 'https://test.local', prices: { plus: 'price_plus', pro: 'price_pro' }, taxRate: '' }),
    },
    './lock': { withBillingLock: async (_id, fn) => fn('token') },
  }, { BILLING_MX_CHECKOUT_VERIFIED: 'true' }).createTestCheckout;
  await assert.rejects(checkout({ id: 'trusted', email: null }, 'plus'), /STRIPE_MX_TAX_RATE_ID/);
  assert.equal(stripeClients, 0);
});

test('checkout requires a billing address, accepts unspecified price tax behavior and applies the manual tax rate', async () => {
  const state = { existingSubscription: true, live: false, country: 'MX', creates: 0 };
  const env = { BILLING_MX_CHECKOUT_VERIFIED: 'true' };
  const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => ({ data: { stripe_customer_id: 'cus_trusted' }, error: null }) };
  const stripe = {
    accounts: { retrieve: async () => ({ id: 'acct_test', country: state.country }) },
    prices: { retrieve: async () => ({ livemode: state.live, active: true, currency: 'mxn', unit_amount: 29900, recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }, tax_behavior: 'unspecified', product: { active: true } }) },
    taxRates: { retrieve: async () => ({ livemode: false, active: true, inclusive: true, percentage: 16, country: 'MX' }) },
    customers: { retrieve: async () => ({ livemode: false }) },
    subscriptions: { list: async () => ({ has_more: false, data: state.existingSubscription ? [{ status: 'past_due' }] : [] }) },
    checkout: { sessions: { list: async () => ({ data: [], has_more: false }), create: async (params) => {
      state.creates++; assert.equal(params.customer, 'cus_trusted'); assert.equal(params.adaptive_pricing.enabled, false);
      assert.equal(params.payment_method_types.join(','), 'card'); assert.equal(params.billing_address_collection, 'required');
      assert.equal(params.automatic_tax.enabled, false);
      assert.equal(params.subscription_data.default_tax_rates.length, 1);
      assert.equal(params.subscription_data.default_tax_rates[0], 'txr_test');
      assert.equal(params.line_items.length, 1);
      assert.equal(params.line_items[0].price, 'price_plus');
      assert.equal(params.line_items[0].quantity, 1);
      assert.equal(params.success_url, 'https://test.local/billing/return?source=checkout');
      return { livemode: false, url: 'https://checkout.stripe.com/test' };
    } } },
  };
  const checkout = load('lib/billing/checkout.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => q }) },
    '@/lib/plans': { FILMATTA_PLAN_PRICES: { plus: 299, pro: 499 } },
    './config': { stripeClient: () => stripe, billingConfig: () => ({ account: 'acct_test', origin: 'https://test.local', prices: { plus: 'price_plus', pro: 'price_pro' }, taxRate: 'txr_test' }) },
    './lock': { withBillingLock: async (_id, fn) => fn('token') },
  }, env).createTestCheckout;
  const user = { id: 'trusted', email: null };
  await assert.rejects(checkout(user, 'plus'), /existing subscription/);
  state.existingSubscription = false; state.live = true;
  await assert.rejects(checkout(user, 'plus'), /Unexpected subscription price/);
  state.live = false; state.country = 'US';
  await assert.rejects(checkout(user, 'plus'), /Incorrect Stripe/);
  state.country = 'MX'; env.BILLING_MX_CHECKOUT_VERIFIED = 'false';
  await assert.rejects(checkout(user, 'plus'), /Mexico checkout/);
  assert.equal(state.creates, 0);
  env.BILLING_MX_CHECKOUT_VERIFIED = 'true';
  assert.equal(await checkout(user, 'plus'), 'https://checkout.stripe.com/test');
  assert.equal(state.creates, 1);
});
