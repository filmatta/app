import { createMuxClient } from "@/lib/mux/server";
import {
  assertMuxEnvironment,
  getMuxEnvironmentExpectation,
} from "@/lib/mux/environment";
import { syncMuxAsset, syncMuxUpload } from "@/lib/mux/sync-asset";
import {
  portfolioId,
  syncPortfolioAsset,
  syncPortfolioUpload,
  markPortfolioAssetDeleted,
} from "@/lib/profiles/mux-media";
import { createAdminClient } from "@/lib/supabase/admin";
import { BodyReadError, readBoundedBody, validateContentLength } from "@/lib/security/bounded-body";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    validateContentLength(request.headers, MAX_WEBHOOK_BYTES);
  } catch (error) {
    return Response.json({ error: "Body inválido." }, { status: error instanceof BodyReadError ? error.status : 400 });
  }
  if (!request.headers.get("mux-signature")) {
    return Response.json({ error: "Firma inválida." }, { status: 400 });
  }
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook no configurado." }, { status: 503 });
  let event;
  try {
    const body = await readBoundedBody(request, MAX_WEBHOOK_BYTES);
    event = await createMuxClient().webhooks.unwrap(body, request.headers, secret);
  } catch (error) {
    if (error instanceof BodyReadError) {
      return Response.json({ error: "Body inválido." }, { status: error.status });
    }
    console.warn("Mux webhook rejected", { reason: "invalid-signature" });
    return Response.json({ error: "Firma inválida." }, { status: 400 });
  }

  let expectedEnvironment;
  try {
    expectedEnvironment = getMuxEnvironmentExpectation();
  } catch {
    console.error("Mux webhook rejected", { reason: "environment-not-configured" });
    return Response.json({ error: "Webhook no configurado." }, { status: 503 });
  }

  if (!event.environment?.id || event.environment.id !== expectedEnvironment.id) {
    console.warn("Mux webhook rejected", { reason: "wrong-environment" });
    return Response.json({ error: "Environment inválido." }, { status: 403 });
  }

  console.info("Mux webhook received", { type: event.type, eventId: event.id });
  if (
    event.type !== "video.upload.asset_created" &&
    event.type !== "video.asset.created" &&
    event.type !== "video.asset.ready" &&
    event.type !== "video.asset.errored" &&
    event.type !== "video.asset.deleted" &&
    event.type !== "video.upload.cancelled" &&
    event.type !== "video.upload.errored"
  ) {
    console.info("Mux webhook skipped", { reason: "unsupported-event", type: event.type });
    return Response.json({ received: true });
  }

  const mux = createMuxClient();
  try {
    await assertMuxEnvironment(mux);
  } catch {
    console.error("Mux webhook rejected", { reason: "environment-validation-failed" });
    return Response.json({ error: "Environment no disponible." }, { status: 503 });
  }

  try {
    const supabase = createAdminClient();

    if (event.type === "video.asset.deleted") {
      await markPortfolioAssetDeleted(event.data.id, expectedEnvironment);
      return Response.json({ received: true });
    }

    if (
      event.type === "video.upload.cancelled" ||
      event.type === "video.upload.errored"
    ) {
      await syncPortfolioUpload(event.data.id);
      return Response.json({ received: true });
    }

    if (event.type === "video.upload.asset_created") {
      const upload = await mux.video.uploads.retrieve(event.data.id);
      if (portfolioId(upload.new_asset_settings?.passthrough)) {
        await syncPortfolioUpload(upload.id);
        console.info("Mux portfolio webhook handled", { eventId: event.id, type: event.type });
        return Response.json({ received: true });
      }
      const result = await syncMuxUpload(
        supabase,
        mux,
        upload,
        expectedEnvironment,
      );
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
    if (portfolioId(asset.passthrough)) {
      await syncPortfolioAsset(asset.id);
      console.info("Mux portfolio webhook handled", { eventId: event.id, type: event.type });
      return Response.json({ received: true });
    }
    const result = asset.upload_id
      ? await syncMuxUpload(
          supabase,
          mux,
          await mux.video.uploads.retrieve(asset.upload_id),
          expectedEnvironment,
          asset,
        )
      : await syncMuxAsset(supabase, asset, expectedEnvironment);
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
