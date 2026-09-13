import "server-only";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { billingConfig, stripeClient } from "./config";
import { withBillingLock } from "./lock";
import type { BillingPlan } from "./policy";

export async function createTestCheckout(user: { id: string; email: string | null }, plan: BillingPlan) {
  const config = billingConfig();
  // Hosted Checkout cannot constrain billing countries using allowed_countries.
  // The operator must first validate the MX-only Radar rule in this sandbox.
  if (process.env.BILLING_MX_CHECKOUT_VERIFIED !== "true") throw new Error("Mexico checkout gate is not verified");
  if (!/^txr_[a-zA-Z0-9]+$/.test(config.taxRate)) {
    throw new Error("Configure STRIPE_MX_TAX_RATE_ID with a Stripe test tax rate");
  }
  const stripe = stripeClient();
  const [account, price, tax] = await Promise.all([
    stripe.accounts.retrieve(config.account), stripe.prices.retrieve(config.prices[plan], { expand: ["product"] }),
    stripe.taxRates.retrieve(config.taxRate),
  ]);
  if (!config.account || account.id !== config.account || account.country !== "MX") throw new Error("Incorrect Stripe test account");
  if (price.livemode || !price.active || price.currency !== "mxn" || price.unit_amount !== FILMATTA_PLAN_PRICES[plan] * 100 ||
      price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed" ||
      typeof price.product === "string" || price.product.deleted || !price.product.active) {
    throw new Error("Unexpected subscription price");
  }
  if (tax.livemode || !tax.active || !tax.inclusive || tax.percentage !== 16 || tax.country !== "MX") {
    throw new Error("Configure an inclusive Mexico 16 percent test tax rate");
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
    { idempotencyKey: `filmatta-test-customer-${user.id}` });
    if (customer.livemode) throw new Error("Live customer rejected");
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
    if (customer.deleted || customer.livemode) throw new Error("Customer unavailable");
    const subscriptions = await stripe.subscriptions.list({ customer: trustedCustomerId, status: "all", limit: 100 });
    if (subscriptions.has_more || subscriptions.data.some((s) => !["canceled", "incomplete_expired"].includes(s.status))) {
      throw new Error("Manage the existing subscription before creating another");
    }
    const sessions = await stripe.checkout.sessions.list({ customer: trustedCustomerId, status: "open", limit: 100 });
    if (sessions.has_more) throw new Error("Too many checkout sessions");
    for (const session of sessions.data) {
      if (!session.livemode && session.metadata?.filmatta_plan === plan && session.url) return session.url;
      // Reusing a different plan would charge the wrong price. Let it expire.
      throw new Error("An unfinished checkout already exists");
    }
    const session = await stripe.checkout.sessions.create({ mode: "subscription", customer: trustedCustomerId,
      adaptive_pricing: { enabled: false },
      line_items: [{ price: config.prices[plan], quantity: 1 }], payment_method_types: ["card"],
      billing_address_collection: "required", customer_update: { address: "auto", name: "auto" },
      automatic_tax: { enabled: false }, subscription_data: { default_tax_rates: [config.taxRate] },
      allow_promotion_codes: false, locale: "es", expires_at: Math.floor(Date.now() / 1000) + 1800,
      metadata: { filmatta_plan: plan },
      success_url: `${config.origin}/cuenta/suscripcion?checkout=returned`,
      cancel_url: `${config.origin}/cuenta/suscripcion?checkout=canceled`,
      custom_text: { submit: { message: "Solo México. Suscripción de prueba; IVA incluido. Usa únicamente tarjetas de prueba." } },
    }, { idempotencyKey: `filmatta-test-checkout-${randomUUID()}` });
    if (session.livemode || !session.url) throw new Error("Checkout unavailable");
    return session.url;
  });
}

export async function createTestPortal(userId: string) {
  const config = billingConfig();
  if (!config.portal.startsWith("bpc_")) throw new Error("Portal not configured");
  const { data, error } = await createAdminClient().from("billing_customers")
    .select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("No billing customer");
  const stripe = stripeClient();
  const customer = await stripe.customers.retrieve(data.stripe_customer_id);
  if (customer.deleted || customer.livemode) throw new Error("Invalid customer");
  const portal = await stripe.billingPortal.configurations.retrieve(config.portal, {
    expand: ["features.subscription_update.products"],
  });
  assertPortalConfiguration(portal, config.prices);
  const session = await stripe.billingPortal.sessions.create({ customer: customer.id, configuration: config.portal,
    return_url: `${config.origin}/cuenta/suscripcion` });
  const destination = new URL(session.url);
  if (destination.protocol !== "https:" || destination.hostname !== "billing.stripe.com") {
    throw new Error("Unexpected portal destination");
  }
  return session.url;
}

export async function createTestProUpgradePortal(userId: string) {
  const config = billingConfig();
  if (!config.portal.startsWith("bpc_")) throw new Error("Portal not configured");

  const { data, error } = await createAdminClient().from("billing_customers")
    .select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("No billing customer");

  const stripe = stripeClient();
  const [account, customer, portal, subscriptions] = await Promise.all([
    stripe.accounts.retrieve(config.account),
    stripe.customers.retrieve(data.stripe_customer_id),
    stripe.billingPortal.configurations.retrieve(config.portal, {
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
    throw new Error("Incorrect Stripe test account");
  }
  if (customer.deleted || customer.livemode || customer.id !== data.stripe_customer_id) {
    throw new Error("Invalid customer");
  }
  assertPortalConfiguration(portal, config.prices);

  if (subscriptions.has_more || subscriptions.data.length !== 1) {
    throw new Error("Exactly one active subscription is required");
  }
  const subscription = subscriptions.data[0];
  const subscriptionCustomer =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  if (
    subscription.livemode ||
    subscription.status !== "active" ||
    subscriptionCustomer !== customer.id ||
    subscription.items.has_more ||
    subscription.items.data.length !== 1
  ) {
    throw new Error("Unexpected active subscription");
  }

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
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    configuration: config.portal,
    return_url: returnUrl,
    flow_data: {
      type: "subscription_update_confirm",
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [{ id: item.id, price: config.prices.pro, quantity: 1 }],
      },
      after_completion: {
        type: "redirect",
        redirect: { return_url: returnUrl },
      },
    },
  });
  const destination = new URL(session.url);
  if (
    session.livemode ||
    destination.protocol !== "https:" ||
    destination.hostname !== "billing.stripe.com"
  ) {
    throw new Error("Unexpected portal destination");
  }
  return session.url;
}

function assertPortalConfiguration(
  portal: Stripe.BillingPortal.Configuration,
  prices: Record<BillingPlan, string>
) {
  const update = portal.features.subscription_update;
  const products = update.products ?? [];
  const allowedUpdates = [...update.default_allowed_updates].sort();
  const allowedPrices = products.flatMap((product) => product.prices).sort();
  const expectedPrices = [prices.plus, prices.pro].sort();
  const productIds = new Set(products.map((product) => product.product));
  const scheduleConditions = update.schedule_at_period_end.conditions.map((condition) => condition.type);

  if (
    portal.livemode ||
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
    scheduleConditions.length !== 1 ||
    scheduleConditions[0] !== "decreasing_item_amount" ||
    portal.features.customer_update.enabled
  ) {
    throw new Error("Portal configuration is outside the FILMATTA Plus and Pro policy");
  }
}
