import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { billingEnabled, billingConfig } from "./config";

export const getBillingAccess = cache(async () => {
  const empty = { regularAccess: false, plan: null as "plus" | "pro" | null };
  if (!billingEnabled()) return empty;
  try {
    billingConfig();
    const supabase = await createClient();
    // RPC derives identity from auth.uid(); no caller-supplied user ID.
    const { data, error } = await supabase.rpc("get_my_billing_plan");
    if (error) throw error;
    return data === "plus" || data === "pro" ? { regularAccess: true, plan: data as "plus" | "pro" } : empty;
  } catch {
    console.error("Billing access unavailable; premium access denied");
    return empty;
  }
});
