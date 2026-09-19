import "server-only";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { assertExpectedStripeMode, billingConfig, stripeClient } from "./config";
import { withBillingLock } from "./lock";
import type { BillingPlan } from "./policy";

const LIVE_SMOKE_TEST_COUPON_NAME = "FILMATTA First Live Smoke Test";
const LIVE_SMOKE_TEST_COUPON_AMOUNT = 25_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUPON_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export async function createCheckout(user: { id: string; email: string | null }, plan: BillingPlan) {
  const config = billingConfig();
  // Hosted Checkout cannot constrain billing countries using allowed_countries.
  // The operator must first validate the MX-only Radar rule in this sandbox.
  if (process.env.BILLING_MX_CHECKOUT_VERIFIED !== "true") throw new Error("Mexico checkout gate is not verified");
  if (!/^txr_[a-zA-Z0-9]+$/.test(config.taxRate)) {
    throw new Error("Configure STRIPE_MX_TAX_RATE_ID");
  }
  const stripe = stripeClient();
  const smokeTestCouponId = resolveLiveSmokeTestCouponId(user.id, plan, config.mode);
  const [account, price, tax, smokeTestCoupon] = await Promise.all([
    stripe.accounts.retrieve(config.account), stripe.prices.retrieve(config.prices[plan], { expand: ["product"] }),
    stripe.taxRates.retrieve(config.taxRate),
    smokeTestCouponId ? stripe.coupons.retrieve(smokeTestCouponId) : Promise.resolve(null),
  ]);
  if (!config.account || account.id !== config.account || account.country !== "MX") throw new Error("Incorrect Stripe account");
  assertExpectedStripeMode(price, config);
  assertExpectedStripeMode(tax, config);
  if (!price.active || price.currency !== "mxn" || price.unit_amount !== FILMATTA_PLAN_PRICES[plan] * 100 ||
      price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed" ||
      typeof price.product === "string" || price.product.deleted || !price.product.active) {
    throw new Error("Unexpected subscription price");
  }
  assertExpectedStripeMode(price.product, config);
  if (!tax.active || !tax.inclusive || tax.percentage !== 16 || tax.country !== "MX") {
    throw new Error("Configure an inclusive Mexico 16 percent tax rate");
  }
  if (smokeTestCoupon) {
    assertExpectedStripeMode(smokeTestCoupon, config);
    if (smokeTestCoupon.id !== smokeTestCouponId ||
        !smokeTestCoupon.valid || smokeTestCoupon.name !== LIVE_SMOKE_TEST_COUPON_NAME ||
        smokeTestCoupon.amount_off !== LIVE_SMOKE_TEST_COUPON_AMOUNT || smokeTestCoupon.currency !== "mxn" ||
        smokeTestCoupon.duration !== "once" || smokeTestCoupon.percent_off !== null ||
        smokeTestCoupon.times_redeemed !== 0 ||
        (smokeTestCoupon.applies_to && !smokeTestCoupon.applies_to.products.includes(price.product.id))) {
      throw new Error("Unexpected Live smoke test coupon");
    }
  }
  const db = createAdminClient();
  const { data: existing, error } = await db.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  let customerId = existing?.stripe_customer_id as string | undefined;
  if (!customerId) {
    // Only an authenticated server action calls this function. Never map users
    // by email or accept customer/subscription identifiers from form inputs.
    const customer = await stripe.customers.create({ email: user.email ?? undefined,
      metadata: { filmatta_user_id: user.id }, address: { country: "MX" } },
    { idempotencyKey: `filmatta-${config.mode}-customer-${user.id}` });
    assertExpectedStripeMode(customer, config);
    const { error: insertError } = await db.from("billing_customers").upsert({ user_id: user.id,
      stripe_customer_id: customer.id }, { onConflict: "user_id", ignoreDuplicates: true });
    if (insertError) throw insertError;
    const { data: mapped, error: mapError } = await db.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).single();
    if (mapError) throw mapError;
    customerId = mapped.stripe_customer_id;
  }
  const trustedCustomerId = customerId!;
  return withBillingLock(trustedCustomerId, async () => {
    const customer = await stripe.customers.retrieve(trustedCustomerId);
    if (customer.deleted) throw new Error("Customer unavailable");
    assertExpectedStripeMode(customer, config);
    const subscriptions = await stripe.subscriptions.list({ customer: trustedCustomerId, status: "all", limit: 100 });
    if (subscriptions.has_more || subscriptions.data.some((s) => !["canceled", "incomplete_expired"].includes(s.status))) {
      throw new Error("Manage the existing subscription before creating another");
    }
    const sessions = await stripe.checkout.sessions.list({ customer: trustedCustomerId, status: "open", limit: 100 });
    if (sessions.has_more) throw new Error("Too many checkout sessions");
    for (const session of sessions.data) {
      assertExpectedStripeMode(session, config);
      const sessionCouponId = session.metadata?.filmatta_smoke_test_coupon ?? null;
      if (session.metadata?.filmatta_plan === plan &&
          sessionCouponId === (smokeTestCoupon?.id ?? null) && session.url) return session.url;
      // Reusing a different plan would charge the wrong price. Let it expire.
      throw new Error("An unfinished checkout already exists");
    }
    const session = await stripe.checkout.sessions.create({ mode: "subscription", customer: trustedCustomerId,
      adaptive_pricing: { enabled: false },
      line_items: [{ price: config.prices[plan], quantity: 1 }], payment_method_types: ["card"],
      billing_address_collection: "required", customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: false }, subscription_data: { default_tax_rates: [config.taxRate] },
      ...(smokeTestCoupon
        ? { discounts: [{ coupon: smokeTestCoupon.id }] }
        : { allow_promotion_codes: false }),
      locale: "es", expires_at: Math.floor(Date.now() / 1000) + 1800,
      metadata: { filmatta_plan: plan,
        ...(smokeTestCoupon ? { filmatta_smoke_test_coupon: smokeTestCoupon.id } : {}) },
      success_url: `${config.origin}/billing/return?source=checkout`,
      cancel_url: `${config.origin}/cuenta/suscripcion?checkout=canceled`,
      custom_text: { submit: { message: config.mode === "test"
        ? "Solo México. Suscripción de prueba; IVA incluido. Usa únicamente tarjetas de prueba."
        : "Disponible únicamente en México. IVA incluido." } },
    }, { idempotencyKey: `filmatta-${config.mode}-checkout-${randomUUID()}` });
    assertExpectedStripeMode(session, config);
    if (!session.url) throw new Error("Checkout unavailable");
    return session.url;
  });
}

function resolveLiveSmokeTestCouponId(userId: string, plan: BillingPlan, mode: "test" | "live") {
  if (mode !== "live" || plan !== "plus") return null;
  const qaUserId = process.env.STRIPE_LIVE_SMOKE_TEST_QA_USER_ID?.trim() ?? "";
  if (!qaUserId || userId !== qaUserId) return null;
  const couponId = process.env.STRIPE_LIVE_SMOKE_TEST_COUPON_ID?.trim() ?? "";
  if (!UUID_PATTERN.test(qaUserId) || !COUPON_ID_PATTERN.test(couponId)) {
    throw new Error("Invalid Live smoke test discount configuration");
  }
  return couponId;
}

export async function createPortal(userId: string) {
  const config = billingConfig();
  const portalConfiguration = config.portals.admin;
  if (!portalConfiguration.startsWith("bpc_")) throw new Error("Admin portal not configured");
  const { data, error } = await createAdminClient().from("billing_customers")
    .select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("No billing customer");
  const stripe = stripeClient();
  const [account, customer] = await Promise.all([
    stripe.accounts.retrieve(config.account),
    stripe.customers.retrieve(data.stripe_customer_id),
  ]);
  if (account.id !== config.account || account.country !== "MX") {
    throw new Error("Incorrect Stripe account");
  }
  if (customer.deleted) throw new Error("Invalid customer");
  assertExpectedStripeMode(customer, config);
  const portal = await stripe.billingPortal.configurations.retrieve(portalConfiguration, {
    expand: ["features.subscription_update.products"],
  });
  assertAdminPortalConfiguration(portal, config);
  const session = await stripe.billingPortal.sessions.create({ customer: customer.id, configuration: portalConfiguration,
    return_url: `${config.origin}/billing/portal-return` });
  const destination = new URL(session.url);
  if (destination.protocol !== "https:" || destination.hostname !== "billing.stripe.com") {
    throw new Error("Unexpected portal destination");
  }
  assertExpectedStripeMode(session, config);
  return session.url;
}

export async function createCancellationPortal(userId: string) {
  const config = billingConfig();
  const portalConfiguration = config.portals.admin;
  if (!portalConfiguration.startsWith("bpc_")) throw new Error("Admin portal not configured");

  const { data, error } = await createAdminClient().from("billing_customers")
    .select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("No billing customer");

  return withBillingLock(data.stripe_customer_id, async () => {
    const stripe = stripeClient();
    const [account, customer, portal, subscriptions] = await Promise.all([
      stripe.accounts.retrieve(config.account),
      stripe.customers.retrieve(data.stripe_customer_id),
      stripe.billingPortal.configurations.retrieve(portalConfiguration, {
        expand: ["features.subscription_update.products"],
      }),
      stripe.subscriptions.list({
        customer: data.stripe_customer_id,
        status: "active",
        limit: 2,
        expand: ["data.items.data.price"],
      }),
    ]);

    if (!config.account || account.id !== config.account || account.country !== "MX") {
      throw new Error("Incorrect Stripe account");
    }
    if (
      customer.deleted ||
      customer.id !== data.stripe_customer_id
    ) {
      throw new Error("Invalid customer");
    }
    assertExpectedStripeMode(customer, config);
    assertAdminPortalConfiguration(portal, config);

    if (subscriptions.has_more || subscriptions.data.length !== 1) {
      throw new Error("Exactly one active subscription is required");
    }
    const subscription = subscriptions.data[0];
    const subscriptionCustomer =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    if (
      subscription.status !== "active" ||
      subscriptionCustomer !== customer.id ||
      subscription.cancel_at_period_end ||
      subscription.cancel_at !== null ||
      subscription.pause_collection ||
      subscription.pending_update ||
      subscription.schedule ||
      subscription.items.has_more ||
      subscription.items.data.length !== 1
    ) {
      throw new Error("Unexpected active subscription");
    }

    const item = subscription.items.data[0];
    const price = item.price;
    if (typeof price === "string") {
      throw new Error("Subscription price was not expanded");
    }
    const plan =
      price.id === config.prices.plus
        ? "plus"
        : price.id === config.prices.pro
          ? "pro"
          : null;
    if (
      !plan ||
      item.quantity !== 1 ||
      !price.active ||
      price.currency !== "mxn" ||
      price.unit_amount !== FILMATTA_PLAN_PRICES[plan] * 100 ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== "licensed"
    ) {
      throw new Error("Unexpected subscription price");
    }
    assertExpectedStripeMode(subscription, config);
    assertExpectedStripeMode(price, config);

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      configuration: portalConfiguration,
      return_url: `${config.origin}/cuenta/suscripcion`,
      flow_data: {
        type: "subscription_cancel",
        subscription_cancel: { subscription: subscription.id },
        after_completion: {
          type: "redirect",
          redirect: {
            return_url: `${config.origin}/billing/return?source=cancel`,
          },
        },
      },
    });
    const destination = new URL(session.url);
    if (
      destination.protocol !== "https:" ||
      destination.hostname !== "billing.stripe.com"
    ) {
      throw new Error("Unexpected portal destination");
    }
    assertExpectedStripeMode(session, config);
    return session.url;
  });
}

export async function createProUpgradePortal(userId: string) {
  const config = billingConfig();
  const portalConfiguration = config.portals.upgrade;
  if (!portalConfiguration.startsWith("bpc_")) throw new Error("Upgrade portal not configured");

  const { data, error } = await createAdminClient().from("billing_customers")
    .select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("No billing customer");

  const stripe = stripeClient();
  const [account, customer, portal, subscriptions] = await Promise.all([
    stripe.accounts.retrieve(config.account),
    stripe.customers.retrieve(data.stripe_customer_id),
    stripe.billingPortal.configurations.retrieve(portalConfiguration, {
      expand: ["features.subscription_update.products"],
    }),
    stripe.subscriptions.list({
      customer: data.stripe_customer_id,
      status: "active",
      limit: 2,
      expand: ["data.items.data.price"],
    }),
  ]);

  if (!config.account || account.id !== config.account || account.country !== "MX") {
    throw new Error("Incorrect Stripe account");
  }
  if (customer.deleted || customer.id !== data.stripe_customer_id) {
    throw new Error("Invalid customer");
  }
  assertExpectedStripeMode(customer, config);
  assertUpgradePortalConfiguration(portal, config);

  if (subscriptions.has_more || subscriptions.data.length !== 1) {
    throw new Error("Exactly one active subscription is required");
  }
  const subscription = subscriptions.data[0];
  const subscriptionCustomer =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  if (
    subscription.status !== "active" ||
    subscriptionCustomer !== customer.id ||
    subscription.items.has_more ||
    subscription.items.data.length !== 1
  ) {
    throw new Error("Unexpected active subscription");
  }

  assertExpectedStripeMode(subscription, config);
  const item = subscription.items.data[0];
  const currentPriceId =
    typeof item.price === "string" ? item.price : item.price.id;
  if (
    !subscription.id.startsWith("sub_") ||
    !item.id.startsWith("si_") ||
    currentPriceId !== config.prices.plus ||
    item.quantity !== 1
  ) {
    throw new Error("Only a single FILMATTA Plus item can be upgraded");
  }

  const returnUrl = `${config.origin}/planes`;
  const completedReturnUrl = `${config.origin}/billing/return?source=upgrade`;
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    configuration: portalConfiguration,
    return_url: returnUrl,
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [{ id: item.id, price: config.prices.pro, quantity: 1 }],
      },
      after_completion: {
        type: "redirect",
        redirect: { return_url: completedReturnUrl },
      },
    },
  });
  const destination = new URL(session.url);
  if (
    destination.protocol !== "https:" ||
    destination.hostname !== "billing.stripe.com"
  ) {
    throw new Error("Unexpected portal destination");
  }
  assertExpectedStripeMode(session, config);
  return session.url;
}

function assertUpgradePortalConfiguration(
  portal: Stripe.BillingPortal.Configuration,
  config: ReturnType<typeof billingConfig>
) {
  const { prices } = config;
  const update = portal.features.subscription_update;
  const products = update.products ?? [];
  const allowedUpdates = [...update.default_allowed_updates].sort();
  const allowedPrices = products.flatMap((product) => product.prices).sort();
  const expectedPrices = [prices.plus, prices.pro].sort();
  const productIds = new Set(products.map((product) => product.product));
  const scheduleConditions = update.schedule_at_period_end.conditions.map((condition) => condition.type);

  if (
    !portal.active ||
    !update.enabled ||
    allowedUpdates.length !== 1 ||
    allowedUpdates[0] !== "price" ||
    products.length !== 2 ||
    productIds.size !== 2 ||
    products.some((product) => product.adjustable_quantity.enabled || product.prices.length !== 1) ||
    allowedPrices.length !== expectedPrices.length ||
    allowedPrices.some((price, index) => price !== expectedPrices[index]) ||
    update.proration_behavior !== "always_invoice" ||
    (update.billing_cycle_anchor !== null && update.billing_cycle_anchor !== "unchanged") ||
    (config.mode === "test"
      ? scheduleConditions.length !== 1 || scheduleConditions[0] !== "decreasing_item_amount"
      : scheduleConditions.length !== 0) ||
    portal.features.customer_update.enabled ||
    !portal.features.payment_method_update.enabled ||
    (config.mode === "live" &&
      (portal.features.invoice_history.enabled ||
        portal.features.subscription_cancel.enabled))
  ) {
    throw new Error("Portal configuration is outside the FILMATTA Plus and Pro policy");
  }
  assertExpectedStripeMode(portal, config);
}

function assertAdminPortalConfiguration(
  portal: Stripe.BillingPortal.Configuration,
  config: ReturnType<typeof billingConfig>
) {
  const update = portal.features.subscription_update;
  const cancellation = portal.features.subscription_cancel;
  if (
    !portal.active ||
    portal.features.customer_update.enabled ||
    !portal.features.payment_method_update.enabled ||
    !portal.features.invoice_history.enabled ||
    update.enabled ||
    update.default_allowed_updates.length !== 0 ||
    (update.products?.length ?? 0) !== 0 ||
    !cancellation.enabled ||
    cancellation.mode !== "at_period_end" ||
    cancellation.proration_behavior !== "none"
  ) {
    throw new Error("Admin portal configuration is outside FILMATTA policy");
  }
  assertExpectedStripeMode(portal, config);
}
