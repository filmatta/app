import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { billingConfig, stripeClient } from "./config";
import type { BillingPlan } from "./policy";

const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
]);

export type ScheduledCancellation = {
  isCancellationScheduled: boolean;
  cancellationEffectiveAt: string | null;
};

export type MyScheduledCancellation = ScheduledCancellation & {
  plan: BillingPlan | null;
};

export function resolveScheduledCancellation(
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
    currentPeriodEnd: string | null;
    canceledAt?: string | null;
  },
  now = Date.now()
): ScheduledCancellation {
  if (subscription.status !== "active") {
    return { isCancellationScheduled: false, cancellationEffectiveAt: null };
  }

  const cancelAt = futureTimestamp(subscription.cancelAt, now);
  const periodEnd = futureTimestamp(subscription.currentPeriodEnd, now);
  const effectiveAt = cancelAt ?? (subscription.cancelAtPeriodEnd ? periodEnd : null);

  return {
    isCancellationScheduled: Boolean(effectiveAt),
    cancellationEffectiveAt: effectiveAt,
  };
}

export async function getMyScheduledCancellation(
  userId: string
): Promise<MyScheduledCancellation> {
  const config = billingConfig();
  const { data, error } = await createAdminClient()
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      plan: null,
      isCancellationScheduled: false,
      cancellationEffectiveAt: null,
    };
  }

  const stripe = stripeClient();
  const [account, customer, subscriptions] = await Promise.all([
    stripe.accounts.retrieve(config.account),
    stripe.customers.retrieve(data.stripe_customer_id),
    stripe.subscriptions.list({
      customer: data.stripe_customer_id,
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
    }),
  ]);

  if (!config.account || account.id !== config.account || account.country !== "MX") {
    throw new Error("Incorrect Stripe test account");
  }
  if (
    customer.deleted ||
    customer.livemode ||
    customer.id !== data.stripe_customer_id
  ) {
    throw new Error("Invalid Stripe test customer");
  }
  if (subscriptions.has_more) {
    throw new Error("Subscription reconciliation limit exceeded");
  }

  const current = subscriptions.data.filter(
    (subscription) => !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)
  );
  if (current.length === 0) {
    return {
      plan: null,
      isCancellationScheduled: false,
      cancellationEffectiveAt: null,
    };
  }
  if (current.length !== 1) {
    throw new Error("Exactly one current subscription is required");
  }

  const subscription = current[0];
  const customerId = expandableId(subscription.customer);
  if (
    subscription.livemode ||
    customerId !== customer.id ||
    subscription.status !== "active" ||
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
  const plan = planForPrice(price.id, config.prices);
  if (
    !plan ||
    item.quantity !== 1 ||
    price.livemode ||
    !price.active ||
    price.currency !== "mxn" ||
    price.unit_amount !== FILMATTA_PLAN_PRICES[plan] * 100 ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new Error("Unexpected subscription price");
  }

  return {
    plan,
    ...resolveScheduledCancellation({
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      cancelAt: toIso(subscription.cancel_at),
      currentPeriodEnd: toIso(item.current_period_end),
      canceledAt: toIso(subscription.canceled_at),
    }),
  };
}

function planForPrice(
  priceId: string,
  prices: Record<BillingPlan, string>
): BillingPlan | null {
  if (priceId === prices.plus) return "plus";
  if (priceId === prices.pro) return "pro";
  return null;
}

function futureTimestamp(value: string | null, now: number) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now
    ? new Date(timestamp).toISOString()
    : null;
}

function toIso(value: number | null | undefined) {
  return value && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function expandableId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}
