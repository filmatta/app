import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function withBillingLock<T>(customerId: string, work: (token: string) => Promise<T>) {
  const db = createAdminClient();
  const { data: token, error } = await db.rpc("claim_billing_customer", { p_customer: customerId });
  if (error || !token) throw new Error("Billing busy; retry later");
  try { return await work(token as string); }
  finally {
    await db.rpc("release_billing_customer", { p_customer: customerId, p_token: token });
  }
}
