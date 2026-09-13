import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingConfig, stripeClient } from "./config";
import { paidAccessUntil, type BillingPlan } from "./policy";
import { withBillingLock } from "./lock";

function id(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}
function assertTest(value: { livemode: boolean }) {
  if (value.livemode) throw new Error("Live Stripe object rejected");
}

export const BILLING_EVENTS = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "customer.subscription.paused", "customer.subscription.resumed", "customer.updated", "customer.deleted",
  "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required",
  "invoice.finalization_failed", "invoice.voided", "invoice.marked_uncollectible",
  "charge.refunded", "charge.dispute.created", "charge.dispute.closed",
]);

export async function reconcileBillingEvent(event: Stripe.Event) {
  assertTest(event);
  if (!BILLING_EVENTS.has(event.type)) return;
  const stripe = stripeClient();
  const object = event.data.object;
  let customer: string | null = null;
  let extraInvoice: string | null = null;
  if (object.object === "customer") customer = object.id;
  else if (object.object === "dispute") {
    const charge = await stripe.charges.retrieve(id(object.charge)!);
    assertTest(charge);
    customer = id(charge.customer);
  } else if ("customer" in object) customer = id(object.customer);
  if (object.object === "invoice") extraInvoice = object.id;
  // Refresh historical invoices affected by a refund/dispute, too.
  if (object.object === "charge" || object.object === "dispute") {
    const chargeId = object.object === "charge" ? object.id : id(object.charge);
    const { data, error } = await createAdminClient().from("billing_payments")
      .select("stripe_invoice_id").eq("stripe_charge_id", chargeId).limit(1).maybeSingle();
    if (error) throw error;
    extraInvoice = data?.stripe_invoice_id ?? null;
  }
  if (!customer) return;
  const db = createAdminClient();
  const { data: owner, error } = await db.from("billing_customers")
    .select("user_id").eq("stripe_customer_id", customer).maybeSingle();
  if (error) throw error;
  // User identity never comes from event metadata or a browser-provided ID.
  if (!owner) return;
  const customerId = customer;
  await withBillingLock(customerId, async (token) => {
    const { data: processed, error: eventError } = await db.from("billing_events")
      .select("stripe_event_id").eq("stripe_event_id", event.id).maybeSingle();
    if (eventError) throw eventError;
    if (processed) return;
    const currentCustomer = await stripe.customers.retrieve(customerId);
    if (currentCustomer.deleted) {
      const { error: deletionError } = await db.rpc("apply_billing_snapshot", {
        p_customer: customerId, p_token: token, p_event: event.id, p_event_type: "customer.deleted",
        p_subscriptions: [], p_invoices: [], p_payments: [], p_entitlements: [],
      });
      if (deletionError) throw deletionError;
      return;
    }
    assertTest(currentCustomer);
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (subscriptions.has_more) throw new Error("Subscription reconciliation limit exceeded");
    const prices = billingConfig().prices;
    const invoiceIds = new Set<string>();
    if (extraInvoice) invoiceIds.add(extraInvoice);
    subscriptions.data.forEach((s) => { const invoice = id(s.latest_invoice); if (invoice) invoiceIds.add(invoice); });
    const invoices: Array<{
      id: string; subscription: string | null; status: string | null; currency: string;
      amount_due: number; amount_paid: number; subtotal: number; total: number; tax: number; country: string | null;
    }> = [];
    const payments: Array<{
      id: string; invoice: string; intent: string | null; charge: string | null; status: string;
      amount_paid: number; amount_refunded: number; disputed: boolean; currency: string;
    }> = [];
    const evidence = new Map<string, {
      paid: boolean;
      reversed: boolean;
      country: string | null;
      paidPeriods: Map<string, number>;
    }>();
    for (const invoiceId of invoiceIds) {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      assertTest(invoice);
      if (id(invoice.customer) !== customerId) throw new Error("Invoice owner mismatch");
      if (invoice.currency !== "mxn") continue; // Unknown currency never grants access.
      const invoicePayments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 100,
        expand: ["data.payment.payment_intent.latest_charge", "data.payment.charge"] });
      if (invoicePayments.has_more || invoice.lines.has_more) throw new Error("Invoice reconciliation limit exceeded");
      let reversed = false;
      let paidByCard = false;
      for (const payment of invoicePayments.data) {
        assertTest(payment);
        const intent = payment.payment.payment_intent;
        const chargeValue = payment.payment.charge ?? (typeof intent === "object" ? intent.latest_charge : null);
        const charge = typeof chargeValue === "string" ? await stripe.charges.retrieve(chargeValue) : chargeValue;
        if (charge) assertTest(charge);
        let disputed = charge?.disputed ?? false;
        if (disputed && charge) {
          const disputes = await stripe.disputes.list({ charge: charge.id, limit: 100 });
          if (disputes.has_more) throw new Error("Dispute reconciliation limit exceeded");
          disputed = disputes.data.length === 0 || disputes.data.some((d) => !["won", "warning_closed"].includes(d.status));
        }
        const invalidPayment = Boolean(charge && (charge.refunded || disputed));
        reversed ||= invalidPayment;
        paidByCard ||= Boolean(payment.status === "paid" && charge?.paid &&
          charge.payment_method_details?.type === "card" && charge.billing_details.address?.country === "MX" && !invalidPayment);
        payments.push({ id: payment.id, invoice: invoice.id, intent: id(intent), charge: id(charge),
          status: payment.status, amount_paid: payment.amount_paid ?? 0,
          amount_refunded: charge?.amount_refunded ?? 0, disputed, currency: payment.currency });
      }
      const subscription = id(invoice.parent?.subscription_details?.subscription);
      // A positive recurring line establishes paid service for its exact Price.
      // This includes an upgrade proration after Stripe has collected it.
      const paidPeriods = new Map<string, number>();
      for (const line of invoice.lines.data) {
        const priceDetails = line.pricing?.type === "price_details"
          ? line.pricing.price_details
          : null;
        if (line.amount <= 0 || line.parent?.type !== "subscription_item_details" ||
            !priceDetails) continue;
        const priceId = id(priceDetails.price);
        if (!priceId) continue;
        paidPeriods.set(priceId, Math.max(paidPeriods.get(priceId) ?? 0, line.period.end));
      }
      evidence.set(invoice.id, { paid: invoice.status === "paid" && invoice.amount_paid > 0 && paidByCard,
        reversed, country: invoice.customer_address?.country ?? null,
        paidPeriods });
      invoices.push({ id: invoice.id, subscription, status: invoice.status, currency: invoice.currency,
        amount_due: invoice.amount_due, amount_paid: invoice.amount_paid, subtotal: invoice.subtotal,
        total: invoice.total, tax: (invoice.total_taxes ?? []).reduce((total, tax) => total + tax.amount, 0),
        country: invoice.customer_address?.country ?? null });
    }
    const entitlements: Array<{ subscription: string; plan: BillingPlan; valid_until: string }> = [];
    const snapshots = subscriptions.data.map((subscription) => {
      assertTest(subscription);
      const item = subscription.items.data[0];
      const price = item?.price;
      const plan: BillingPlan | null = price?.id === prices.pro ? "pro" : price?.id === prices.plus ? "plus" : null;
      const knownPrice = Boolean(plan && price && !price.livemode && price.currency === "mxn" &&
        price.recurring?.interval === "month" && price.recurring.interval_count === 1 &&
        item.quantity === 1 && subscription.items.data.length === 1 && !subscription.items.has_more);
      const invoice = evidence.get(id(subscription.latest_invoice) ?? "");
      const validUntil = paidAccessUntil({ status: subscription.status, paused: Boolean(subscription.pause_collection),
        knownPrice, country: currentCustomer.address?.country === "MX" ? invoice?.country ?? null : null,
        invoicePaid: invoice?.paid ?? false, reversed: invoice?.reversed ?? false,
        periodEnd: item?.current_period_end ?? 0,
        paidPeriodEnd: price ? invoice?.paidPeriods.get(price.id) ?? 0 : 0 });
      if (plan && validUntil) entitlements.push({ subscription: subscription.id, plan, valid_until: validUntil });
      return { id: subscription.id, plan, price: price?.id ?? null, status: subscription.status,
        period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end };
    });
    const { error: syncError } = await db.rpc("apply_billing_snapshot", {
      p_customer: customerId, p_token: token, p_event: event.id, p_event_type: event.type,
      p_subscriptions: snapshots, p_invoices: invoices, p_payments: payments, p_entitlements: entitlements,
    });
    if (syncError) throw syncError;
  });
}
