import { createMuxClient } from "@/lib/mux/server";
import { syncMuxAsset, syncMuxUpload } from "@/lib/mux/sync-asset";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook no configurado." }, { status: 503 });
  let event;
  try {
    event = await createMuxClient().webhooks.unwrap(await request.text(), request.headers, secret);
  } catch {
    console.warn("Mux webhook rejected", { reason: "invalid-signature" });
    return Response.json({ error: "Firma inválida." }, { status: 400 });
  }
  console.info("Mux webhook received", { type: event.type, eventId: event.id });
  if (
    event.type !== "video.upload.asset_created" &&
    event.type !== "video.asset.created" &&
    event.type !== "video.asset.ready" &&
    event.type !== "video.asset.errored"
  ) {
    console.info("Mux webhook skipped", { reason: "unsupported-event", type: event.type });
    return Response.json({ received: true });
  }
  try {
    const mux = createMuxClient();
    const supabase = createAdminClient();

    if (event.type === "video.upload.asset_created") {
      const upload = await mux.video.uploads.retrieve(event.data.id);
      const result = await syncMuxUpload(supabase, mux, upload);
      console.info("Mux upload webhook handled", {
        eventId: event.id,
        uploadId: upload.id,
        assetId: upload.asset_id ?? null,
        outcome: result.outcome,
        reason: "reason" in result ? result.reason : null,
      });
      return Response.json({ received: true });
    }

    // Retrieve current Mux state so late/duplicate created events cannot regress ready.
    const asset = await mux.video.assets.retrieve(event.data.id);
    const result = asset.upload_id
      ? await syncMuxUpload(
          supabase,
          mux,
          await mux.video.uploads.retrieve(asset.upload_id),
          asset,
        )
      : await syncMuxAsset(supabase, asset);
    console.info("Mux asset webhook handled", {
      eventId: event.id,
      assetId: asset.id,
      uploadId: asset.upload_id ?? null,
      outcome: result.outcome,
      reason: "reason" in result ? result.reason : null,
    });
    return Response.json({ received: true });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? error.code : "sync-failed";
    console.error("Mux webhook update failed", { eventId: event.id, code });
    return Response.json({ error: "No se pudo sincronizar el video." }, { status: 500 });
  }
}
