import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { billingConfig, stripeClient } from "./config";
import { withBillingLock } from "./lock";
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

type BillingConfig = ReturnType<typeof billingConfig>;

type CancellationContext = MyScheduledCancellation & {
  customerId: string;
  subscription: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
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
  const customerId = await getBillingCustomerId(userId);
  if (!customerId) return emptyCancellation();

  const context = await resolveCancellationContext(
    config,
    stripeClient(),
    customerId
  );
  return context ? toPublicCancellation(context) : emptyCancellation();
}

export async function keepScheduledSubscription(
  userId: string
): Promise<MyScheduledCancellation> {
  const config = billingConfig();
  const customerId = await getBillingCustomerId(userId);
  if (!customerId) throw new Error("No billing customer");

  return withBillingLock(customerId, async () => {
    const stripe = stripeClient();
    const context = await resolveCancellationContext(config, stripe, customerId);
    if (!context) throw new Error("No current subscription");
    if (!context.isCancellationScheduled || !context.cancellationEffectiveAt) {
      throw new Error("No scheduled cancellation");
    }

    const cancellationUpdate: Stripe.SubscriptionUpdateParams =
      context.subscription.cancel_at_period_end
        ? {
            cancel_at_period_end: false,
            proration_behavior: "none",
          }
        : {
            cancel_at: "",
            proration_behavior: "none",
          };

    await stripe.subscriptions.update(
      context.subscription.id,
      cancellationUpdate,
      {
        idempotencyKey: [
          "filmatta-test-keep",
          context.subscription.id,
          Math.floor(Date.parse(context.cancellationEffectiveAt) / 1000),
          context.subscription.canceled_at ?? 0,
        ].join("-"),
      }
    );

    const verified = await resolveCancellationContext(config, stripe, customerId);
    if (!verified) {
      throw new Error("Stripe did not preserve the current subscription");
    }
    if (
      verified.subscription.id !== context.subscription.id ||
      verified.customerId !== context.customerId ||
      verified.item.id !== context.item.id ||
      verified.item.price.id !== context.item.price.id ||
      verified.item.quantity !== context.item.quantity ||
      verified.plan !== context.plan ||
      verified.isCancellationScheduled ||
      verified.subscription.cancel_at !== null ||
      verified.subscription.cancel_at_period_end
    ) {
      throw new Error("Stripe did not remove the scheduled cancellation safely");
    }

    return toPublicCancellation(verified);
  });
}

async function getBillingCustomerId(userId: string) {
  const { data, error } = await createAdminClient()
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data?.stripe_customer_id as string | undefined) ?? null;
}

async function resolveCancellationContext(
  config: BillingConfig,
  stripe: Stripe,
  customerId: string
): Promise<CancellationContext | null> {
  const [account, customer, subscriptions] = await Promise.all([
    stripe.accounts.retrieve(config.account),
    stripe.customers.retrieve(customerId),
    stripe.subscriptions.list({
      customer: customerId,
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
    customer.id !== customerId
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
    return null;
  }
  if (current.length !== 1) {
    throw new Error("Exactly one current subscription is required");
  }

  const subscription = current[0];
  const subscriptionCustomerId = expandableId(subscription.customer);
  if (
    subscription.livemode ||
    subscriptionCustomerId !== customer.id ||
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

  const cancellation = resolveScheduledCancellation({
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: toIso(subscription.cancel_at),
    currentPeriodEnd: toIso(item.current_period_end),
    canceledAt: toIso(subscription.canceled_at),
  });

  return {
    customerId,
    subscription,
    item,
    plan,
    ...cancellation,
  };
}

function toPublicCancellation({
  plan,
  isCancellationScheduled,
  cancellationEffectiveAt,
}: CancellationContext): MyScheduledCancellation {
  return { plan, isCancellationScheduled, cancellationEffectiveAt };
}

function emptyCancellation(): MyScheduledCancellation {
  return {
    plan: null,
    isCancellationScheduled: false,
    cancellationEffectiveAt: null,
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
