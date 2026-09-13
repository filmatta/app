import { billingConfig, billingEnabled, stripeClient } from "@/lib/billing/config";
import { reconcileBillingEvent } from "@/lib/billing/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!billingEnabled()) return new Response("Billing disabled", { status: 503 });
  let config: ReturnType<typeof billingConfig>;
  try { config = billingConfig(); } catch { return new Response("Billing unavailable", { status: 503 }); }
  if (!config.webhookSecret.startsWith("whsec_")) return new Response("Webhook unavailable", { status: 503 });
  if (Number(request.headers.get("content-length")) > 1_000_000) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1_000_000) return new Response(null, { status: 413 });
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, request.headers.get("stripe-signature") ?? "", config.webhookSecret);
  } catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.livemode || event.account) return new Response("Unsupported event scope", { status: 400 });
  try {
    await reconcileBillingEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe event reconciliation failed", {
      eventId: event.id,
      type: event.type,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { name: "UnknownError" },
    });
    return new Response("Retry event", { status: 500 });
  }
}
