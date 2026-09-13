import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const CLAIM_ATTEMPTS = 12;
const CLAIM_RETRY_DELAY_MS = 250;

export async function withBillingLock<T>(customerId: string, work: (token: string) => Promise<T>) {
  const db = createAdminClient();
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const { data: token, error } = await db.rpc("claim_billing_customer", { p_customer: customerId });
    if (error) throw error;
    if (token) {
      try { return await work(token as string); }
      finally {
        await db.rpc("release_billing_customer", { p_customer: customerId, p_token: token });
      }
    }
    if (attempt + 1 < CLAIM_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, CLAIM_RETRY_DELAY_MS));
    }
  }
  throw new Error("Billing busy; retry later");
}
