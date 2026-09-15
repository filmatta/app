import "server-only";
import Stripe from "stripe";
import { billingModeEnabled, type BillingMode } from "./policy";

const LIVE_ORIGIN = "https://app.filmatta.com";

export function billingEnabled() { return billingModeEnabled(process.env); }

export function billingMode(): BillingMode | null {
  return billingEnabled() ? configuredMode() : null;
}

function configuredMode(): BillingMode {
  const mode = process.env.BILLING_MODE;
  if (mode !== "test" && mode !== "live") {
    throw new Error("BILLING_MODE must be test or live");
  }
  return mode;
}

export function billingAccessConfig() {
  if (!billingEnabled()) throw new Error("Billing mode is disabled or invalid for this deployment");
  const mode = configuredMode();
  const project = mode === "test"
    ? process.env.BILLING_TEST_SUPABASE_PROJECT_REF
    : process.env.BILLING_LIVE_SUPABASE_PROJECT_REF;
  if (!project || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname !== `${project}.supabase.co`) {
    throw new Error(`Billing requires the explicitly selected ${mode} Supabase project`);
  }
  return { mode, project, livemode: mode === "live" } as const;
}

export function billingConfig() {
  const access = billingAccessConfig();
  const { mode, livemode } = access;
  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  const validSecret = mode === "test"
    ? secret.startsWith("sk_test_") || secret.startsWith("rk_test_")
    : secret.startsWith("sk_live_");
  if (!validSecret) {
    throw new Error(`Stripe credential does not match Billing ${mode} mode`);
  }
  const origin = new URL(process.env.BILLING_APP_URL ?? "");
  const exactOrigin = origin.origin === process.env.BILLING_APP_URL;
  const validTestOrigin = mode === "test" && origin.origin !== LIVE_ORIGIN &&
    (origin.protocol === "https:" || (origin.protocol === "http:" && origin.hostname === "localhost"));
  const validLiveOrigin = mode === "live" && origin.origin === LIVE_ORIGIN;
  if (!exactOrigin || (!validTestOrigin && !validLiveOrigin)) {
    throw new Error("Invalid billing origin");
  }
  const prices = {
    plus: process.env.STRIPE_PLUS_PRICE_ID ?? "",
    pro: process.env.STRIPE_PRO_PRICE_ID ?? "",
  };
  if (!Object.values(prices).every((id) => /^price_[a-zA-Z0-9]+$/.test(id)) || prices.plus === prices.pro) {
    throw new Error(`Configure two distinct ${mode} prices`);
  }
  const portals = {
    admin: process.env.STRIPE_ADMIN_PORTAL_CONFIGURATION_ID ?? "",
    upgrade: process.env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID ?? "",
  };
  if (Object.values(portals).some((id) => id && !/^bpc_[a-zA-Z0-9]+$/.test(id)) ||
      (portals.admin && portals.admin === portals.upgrade)) {
    throw new Error("Configure distinct admin and upgrade portals");
  }
  const taxRate = process.env.STRIPE_MX_TAX_RATE_ID ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (mode === "live" &&
      (!/^txr_[a-zA-Z0-9]+$/.test(taxRate) ||
        !portals.admin ||
        !portals.upgrade ||
        !webhookSecret.startsWith("whsec_"))) {
    throw new Error("Complete Stripe Live Tax, Portal and webhook configuration");
  }
  const account = mode === "test"
    ? process.env.STRIPE_TEST_ACCOUNT_ID ?? ""
    : process.env.STRIPE_LIVE_ACCOUNT_ID ?? "";
  if (!/^acct_[a-zA-Z0-9]+$/.test(account)) {
    throw new Error(`Configure the Stripe ${mode} account`);
  }
  return { mode, livemode, secret, origin: origin.origin, prices,
    taxRate,
    portals,
    webhookSecret,
    account,
  };
}

export function assertExpectedStripeMode(
  value: { livemode: boolean },
  config: Pick<ReturnType<typeof billingConfig>, "livemode">
) {
  if (value.livemode !== config.livemode) {
    throw new Error("Stripe object mode does not match Billing mode");
  }
}

export function stripeClient() {
  return new Stripe(billingConfig().secret, { apiVersion: "2026-08-26.dahlia", maxNetworkRetries: 1, timeout: 10_000 });
}
