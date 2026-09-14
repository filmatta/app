import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { billingConfig, stripeClient } from "./config";
import { withBillingLock } from "./lock";

const DOWNGRADE_OPERATION = "pro_to_plus";
const TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "canceled",
  "incomplete_expired",
]);

export type ProToPlusDowngradeState = {
  customerId: string;
  subscriptionId: string;
  currentPeriodStart: string;
  effectiveAt: string;
  scheduled: boolean;
  scheduleId: string | null;
};

type BillingConfig = ReturnType<typeof billingConfig>;

type DowngradeContext = {
  config: BillingConfig;
  stripe: Stripe;
  customerId: string;
  subscription: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
  currentPeriodStart: number;
  currentPeriodEnd: number;
};

export async function getProToPlusDowngradeState(
  userId: string
): Promise<ProToPlusDowngradeState> {
  const config = billingConfig();
  const customerId = await getBillingCustomerId(userId);
  const stripe = stripeClient();
  const context = await resolveDowngradeContext(config, stripe, customerId);
  const schedule = await retrieveAttachedSchedule(context);

  if (schedule && !isExpectedDowngradeSchedule(schedule, context)) {
    throw new Error("Unknown subscription schedule");
  }

  return toPublicState(context, schedule?.id ?? null);
}

export async function scheduleDowngradeToPlus(
  userId: string
): Promise<ProToPlusDowngradeState> {
  const config = billingConfig();
  const customerId = await getBillingCustomerId(userId);

  return withBillingLock(customerId, async () => {
    const stripe = stripeClient();
    const context = await resolveDowngradeContext(config, stripe, customerId);
    const attached = await retrieveAttachedSchedule(context);

    if (attached && isExpectedDowngradeSchedule(attached, context)) {
      return toPublicState(context, attached.id);
    }

    const generation = await resolveDowngradeGeneration(context);
    const createKey = downgradeIdempotencyKey("create", context, generation);
    let schedule: Stripe.SubscriptionSchedule;

    if (attached) {
      // from_subscription cannot accept metadata. Replaying our stable create
      // request is the only safe way to prove that an unmarked, one-phase
      // schedule came from an earlier FILMATTA attempt whose update failed.
      try {
        schedule = await stripe.subscriptionSchedules.create(
          { from_subscription: context.subscription.id },
          { idempotencyKey: createKey }
        );
      } catch {
        throw new Error("Unknown subscription schedule");
      }
      if (schedule.id !== attached.id) {
        throw new Error("Subscription schedule identity mismatch");
      }
    } else {
      schedule = await stripe.subscriptionSchedules.create(
        { from_subscription: context.subscription.id },
        { idempotencyKey: createKey }
      );
    }

    if (!isRecoverableMirrorSchedule(schedule, context)) {
      throw new Error("Subscription schedule cannot be recovered safely");
    }

    await stripe.subscriptionSchedules.update(
      schedule.id,
      {
        end_behavior: "release",
        metadata: {
          filmatta_change: DOWNGRADE_OPERATION,
          filmatta_subscription_id: context.subscription.id,
          filmatta_effective_at: String(context.currentPeriodEnd),
        },
        proration_behavior: "none",
        phases: [
          {
            start_date: context.currentPeriodStart,
            end_date: context.currentPeriodEnd,
            items: [{ price: context.config.prices.pro, quantity: 1 }],
            automatic_tax: { enabled: false },
            default_tax_rates: [context.config.taxRate],
            discounts: [],
            proration_behavior: "none",
          },
          {
            duration: { interval: "month", interval_count: 1 },
            items: [{ price: context.config.prices.plus, quantity: 1 }],
            automatic_tax: { enabled: false },
            default_tax_rates: [context.config.taxRate],
            discounts: [],
            proration_behavior: "none",
          },
        ],
      },
      {
        idempotencyKey: downgradeIdempotencyKey(
          "update",
          context,
          generation
        ),
      }
    );

    const verified = await stripe.subscriptionSchedules.retrieve(schedule.id);
    if (!isExpectedDowngradeSchedule(verified, context)) {
      throw new Error("Stripe did not persist the expected downgrade schedule");
    }

    return toPublicState(context, verified.id);
  });
}

export async function releaseScheduledDowngrade(
  userId: string
): Promise<void> {
  const config = billingConfig();
  const customerId = await getBillingCustomerId(userId);

  await withBillingLock(customerId, async () => {
    const stripe = stripeClient();
    const context = await resolveDowngradeContext(config, stripe, customerId);
    const schedule = await retrieveAttachedSchedule(context);
    if (!schedule || !isExpectedDowngradeSchedule(schedule, context)) {
      throw new Error("No FILMATTA downgrade is scheduled");
    }

    const released = await stripe.subscriptionSchedules.release(
      schedule.id,
      { preserve_cancel_date: false },
      {
        idempotencyKey: downgradeIdempotencyKey(
          "release",
          context,
          schedule.id
        ),
      }
    );
    if (
      released.livemode ||
      released.status !== "released" ||
      released.released_subscription !== context.subscription.id
    ) {
      throw new Error("Subscription schedule was not released safely");
    }

    const current = await resolveDowngradeContext(config, stripe, customerId);
    if (expandableId(current.subscription.schedule)) {
      throw new Error("Subscription still has an attached schedule");
    }
  });
}

async function getBillingCustomerId(userId: string) {
  const { data, error } = await createAdminClient()
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("No billing customer");
  return data.stripe_customer_id as string;
}

async function resolveDowngradeContext(
  config: BillingConfig,
  stripe: Stripe,
  customerId: string
): Promise<DowngradeContext> {
  if (!/^txr_[a-zA-Z0-9]+$/.test(config.taxRate)) {
    throw new Error("Configure STRIPE_MX_TAX_RATE_ID");
  }

  const [account, customer, plusPrice, proPrice, taxRate, subscriptions] =
    await Promise.all([
      stripe.accounts.retrieve(config.account),
      stripe.customers.retrieve(customerId),
      stripe.prices.retrieve(config.prices.plus, { expand: ["product"] }),
      stripe.prices.retrieve(config.prices.pro, { expand: ["product"] }),
      stripe.taxRates.retrieve(config.taxRate),
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
    customer.id !== customerId ||
    customer.address?.country !== "MX"
  ) {
    throw new Error("Invalid Stripe test customer");
  }
  assertPlanPrice(plusPrice, config.prices.plus, FILMATTA_PLAN_PRICES.plus);
  assertPlanPrice(proPrice, config.prices.pro, FILMATTA_PLAN_PRICES.pro);
  if (expandableId(plusPrice.product) === expandableId(proPrice.product)) {
    throw new Error("FILMATTA Plus and Pro must use separate Stripe products");
  }
  if (
    taxRate.livemode ||
    !taxRate.active ||
    !taxRate.inclusive ||
    taxRate.percentage !== 16 ||
    taxRate.country !== "MX"
  ) {
    throw new Error("Invalid Mexico test tax rate");
  }
  if (subscriptions.has_more) {
    throw new Error("Subscription reconciliation limit exceeded");
  }

  const nonTerminal = subscriptions.data.filter(
    (subscription) => !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)
  );
  if (nonTerminal.length !== 1 || nonTerminal[0].status !== "active") {
    throw new Error("Exactly one active subscription is required");
  }

  const subscription = nonTerminal[0];
  const subscriptionCustomer = expandableId(subscription.customer);
  if (
    subscription.livemode ||
    subscriptionCustomer !== customerId ||
    subscription.cancel_at_period_end ||
    subscription.cancel_at !== null ||
    subscription.pending_update ||
    subscription.pause_collection ||
    subscription.trial_end !== null ||
    subscription.items.has_more ||
    subscription.items.data.length !== 1 ||
    (subscription.discounts?.length ?? 0) !== 0
  ) {
    throw new Error("Unexpected active subscription");
  }

  const item = subscription.items.data[0];
  const itemPrice = item.price;
  const currentPeriodStart = item.current_period_start;
  const currentPeriodEnd = item.current_period_end;
  if (
    item.quantity !== 1 ||
    itemPrice.id !== config.prices.pro ||
    itemPrice.livemode ||
    itemPrice.currency !== "mxn" ||
    itemPrice.recurring?.interval !== "month" ||
    itemPrice.recurring.interval_count !== 1 ||
    !Number.isFinite(currentPeriodStart) ||
    !Number.isFinite(currentPeriodEnd) ||
    currentPeriodStart >= currentPeriodEnd ||
    currentPeriodEnd <= Date.now() / 1000
  ) {
    throw new Error("Only a single active FILMATTA Pro item can be downgraded");
  }

  return {
    config,
    stripe,
    customerId,
    subscription,
    item,
    currentPeriodStart,
    currentPeriodEnd,
  };
}

function assertPlanPrice(price: Stripe.Price, expectedId: string, amount: number) {
  const product = typeof price.product === "string" ? null : price.product;
  if (
    price.id !== expectedId ||
    price.livemode ||
    !price.active ||
    price.currency !== "mxn" ||
    price.unit_amount !== amount * 100 ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    !product ||
    product.deleted ||
    !product.active
  ) {
    throw new Error("Unexpected subscription price");
  }
}

async function retrieveAttachedSchedule(context: DowngradeContext) {
  const scheduleId = expandableId(context.subscription.schedule);
  return scheduleId
    ? context.stripe.subscriptionSchedules.retrieve(scheduleId)
    : null;
}

async function resolveDowngradeGeneration(context: DowngradeContext) {
  const schedules = await context.stripe.subscriptionSchedules.list({
    customer: context.customerId,
    released_at: { gte: context.currentPeriodStart },
    limit: 100,
  });
  if (schedules.has_more) {
    throw new Error("Subscription schedule history limit exceeded");
  }

  const released = schedules.data
    .filter((schedule) => isReleasedDowngradeSchedule(schedule, context))
    .sort((left, right) => {
      const timestamp = (left.released_at ?? 0) - (right.released_at ?? 0);
      return timestamp || left.id.localeCompare(right.id);
    });

  return released.at(-1)?.id ?? "initial";
}

function isReleasedDowngradeSchedule(
  schedule: Stripe.SubscriptionSchedule,
  context: DowngradeContext
) {
  if (
    schedule.livemode ||
    schedule.status !== "released" ||
    expandableId(schedule.customer) !== context.customerId ||
    schedule.released_subscription !== context.subscription.id ||
    schedule.end_behavior !== "release" ||
    schedule.metadata?.filmatta_change !== DOWNGRADE_OPERATION ||
    schedule.metadata?.filmatta_subscription_id !== context.subscription.id ||
    schedule.metadata?.filmatta_effective_at !== String(context.currentPeriodEnd) ||
    schedule.phases.length !== 2
  ) {
    return false;
  }

  const [current, future] = schedule.phases;
  return (
    isPhase(current, {
      price: context.config.prices.pro,
      start: context.currentPeriodStart,
      end: context.currentPeriodEnd,
      taxRate: context.config.taxRate,
    }) &&
    isPhase(future, {
      price: context.config.prices.plus,
      start: context.currentPeriodEnd,
      end: addBillingMonth(context.currentPeriodEnd),
      taxRate: context.config.taxRate,
    })
  );
}

function isRecoverableMirrorSchedule(
  schedule: Stripe.SubscriptionSchedule,
  context: DowngradeContext
) {
  const metadata = schedule.metadata ?? {};
  const metadataKeys = Object.keys(metadata);
  return (
    isScheduleBaseValid(schedule, context) &&
    schedule.end_behavior === "release" &&
    schedule.phases.length === 1 &&
    metadataKeys.length === 0 &&
    isMirrorPhase(schedule.phases[0], {
      price: context.config.prices.pro,
      start: context.currentPeriodStart,
      end: context.currentPeriodEnd,
      taxRate: context.config.taxRate,
    })
  );
}

function isMirrorPhase(
  phase: Stripe.SubscriptionSchedule.Phase,
  expected: { price: string; start: number; end: number; taxRate: string }
) {
  return (
    phase.start_date === expected.start &&
    phase.end_date === expected.end &&
    phase.items.length === 1 &&
    expandableId(phase.items[0].price) === expected.price &&
    phase.items[0].quantity === 1 &&
    phase.automatic_tax?.enabled === false &&
    (phase.discounts?.length ?? 0) === 0 &&
    exactIds(phase.default_tax_rates, [expected.taxRate])
  );
}

function isExpectedDowngradeSchedule(
  schedule: Stripe.SubscriptionSchedule,
  context: DowngradeContext
) {
  if (
    !isScheduleBaseValid(schedule, context) ||
    schedule.end_behavior !== "release" ||
    schedule.metadata?.filmatta_change !== DOWNGRADE_OPERATION ||
    schedule.metadata?.filmatta_subscription_id !== context.subscription.id ||
    schedule.metadata?.filmatta_effective_at !== String(context.currentPeriodEnd) ||
    schedule.phases.length !== 2 ||
    schedule.current_phase?.start_date !== context.currentPeriodStart ||
    schedule.current_phase.end_date !== context.currentPeriodEnd
  ) {
    return false;
  }

  const [current, future] = schedule.phases;
  return (
    isPhase(current, {
      price: context.config.prices.pro,
      start: context.currentPeriodStart,
      end: context.currentPeriodEnd,
      taxRate: context.config.taxRate,
    }) &&
    isPhase(future, {
      price: context.config.prices.plus,
      start: context.currentPeriodEnd,
      end: addBillingMonth(context.currentPeriodEnd),
      taxRate: context.config.taxRate,
    })
  );
}

function isScheduleBaseValid(
  schedule: Stripe.SubscriptionSchedule,
  context: DowngradeContext
) {
  return (
    !schedule.livemode &&
    schedule.status === "active" &&
    expandableId(schedule.customer) === context.customerId &&
    expandableId(schedule.subscription) === context.subscription.id
  );
}

function isPhase(
  phase: Stripe.SubscriptionSchedule.Phase,
  expected: { price: string; start: number; end: number; taxRate: string }
) {
  return (
    phase.start_date === expected.start &&
    phase.end_date === expected.end &&
    phase.proration_behavior === "none" &&
    phase.automatic_tax?.enabled === false &&
    phase.items.length === 1 &&
    expandableId(phase.items[0].price) === expected.price &&
    phase.items[0].quantity === 1 &&
    (phase.discounts?.length ?? 0) === 0 &&
    exactIds(phase.default_tax_rates, [expected.taxRate])
  );
}

function exactIds(
  values: Array<string | { id: string }> | null | undefined,
  expected: string[]
) {
  const ids = (values ?? []).map((value) => expandableId(value)).sort();
  const expectedIds = [...expected].sort();
  return (
    ids.length === expectedIds.length &&
    ids.every((value, index) => value === expectedIds[index])
  );
}

function expandableId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function addBillingMonth(timestamp: number) {
  const current = new Date(timestamp * 1000);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const targetMonth = month === 11 ? 0 : month + 1;
  const targetYear = month === 11 ? year + 1 : year;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return Math.floor(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(current.getUTCDate(), lastDay),
      current.getUTCHours(),
      current.getUTCMinutes(),
      current.getUTCSeconds()
    ) / 1000
  );
}

function downgradeIdempotencyKey(
  operation: "create" | "update" | "release",
  context: DowngradeContext,
  generation: string
) {
  return `filmatta-test-${DOWNGRADE_OPERATION}-${operation}-${context.subscription.id}-${context.currentPeriodEnd}-${generation}`;
}

function toPublicState(
  context: DowngradeContext,
  scheduleId: string | null
): ProToPlusDowngradeState {
  return {
    customerId: context.customerId,
    subscriptionId: context.subscription.id,
    currentPeriodStart: new Date(context.currentPeriodStart * 1000).toISOString(),
    effectiveAt: new Date(context.currentPeriodEnd * 1000).toISOString(),
    scheduled: Boolean(scheduleId),
    scheduleId,
  };
}
