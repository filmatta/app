import "server-only";
import Stripe from "stripe";
import { testBillingEnabled } from "./policy";

export function billingEnabled() { return testBillingEnabled(process.env); }

export function billingConfig() {
  if (!billingEnabled()) throw new Error("Billing test mode is disabled");
  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  if (!secret.startsWith("sk_test_") && !secret.startsWith("rk_test_")) {
    throw new Error("Only Stripe test credentials are accepted");
  }
  const origin = new URL(process.env.BILLING_APP_URL ?? "");
  if (origin.origin !== process.env.BILLING_APP_URL ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && origin.hostname === "localhost"))) {
    throw new Error("Invalid billing origin");
  }
  const project = process.env.BILLING_TEST_SUPABASE_PROJECT_REF;
  if (!project || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname !== `${project}.supabase.co`) {
    throw new Error("Billing requires an explicitly selected test Supabase project");
  }
  const prices = {
    plus: process.env.STRIPE_PLUS_PRICE_ID ?? "",
    pro: process.env.STRIPE_PRO_PRICE_ID ?? "",
  };
  if (!Object.values(prices).every((id) => /^price_[a-zA-Z0-9]+$/.test(id)) || prices.plus === prices.pro) {
    throw new Error("Configure two distinct test prices");
  }
  return { secret, origin: origin.origin, prices,
    taxRate: process.env.STRIPE_MX_TAX_RATE_ID ?? "",
    portal: process.env.STRIPE_PORTAL_CONFIGURATION_ID ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    account: process.env.STRIPE_TEST_ACCOUNT_ID ?? "",
  };
}

export function stripeClient() {
  return new Stripe(billingConfig().secret, { apiVersion: "2026-08-26.dahlia", maxNetworkRetries: 1, timeout: 10_000 });
}
