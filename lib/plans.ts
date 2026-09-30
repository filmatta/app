import { PLAN_DEFINITIONS } from "@/lib/entitlements/catalog";

// Compatibility export for legacy Billing/Learn copy. New plan surfaces consume
// getPlanCatalog() so configured database prices can override these fallbacks.
export const FILMATTA_PLAN_PRICES = {
  free: PLAN_DEFINITIONS.free.currentPriceMxn,
  starter: PLAN_DEFINITIONS.starter.currentPriceMxn,
  plus: PLAN_DEFINITIONS.plus.currentPriceMxn,
  pro: PLAN_DEFINITIONS.pro.currentPriceMxn,
  pro_plus: PLAN_DEFINITIONS.pro_plus.currentPriceMxn,
  business: PLAN_DEFINITIONS.pro_plus.currentPriceMxn,
} as const;
