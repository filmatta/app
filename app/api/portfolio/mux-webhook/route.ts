import { createMuxClient, createValidatedMuxContext } from "@/lib/mux/server";
import { getMuxEnvironmentExpectation } from "@/lib/mux/environment";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPortfolioAsset, portfolioId } from "@/lib/profiles/mux-media";
import { readBoundedBody } from "@/lib/security/bounded-body";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.MUX_PORTFOLIO_WEBHOOK_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  let event;
  try {
    event = await createMuxClient().webhooks.unwrap(
      await readBoundedBody(request, 1024 * 1024),
      request.headers,
      secret,
    );
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    const expected = getMuxEnvironmentExpectation();
    if (event.environment?.id !== expected.id)
      return new Response(null, { status: 403 });
    if (event.type === "video.asset.deleted") {
      const db = createAdminClient();
      const result = await db
        .from("profile_media")
        .update({ status: "deleted", mux_playback_id: null })
        .eq("mux_asset_id", event.data.id)
        .eq("mux_environment_id", expected.id);
      if (result.error) throw result.error;
    } else if (
      event.type === "video.asset.created" ||
      event.type === "video.asset.ready" ||
      event.type === "video.asset.errored"
    ) {
      await syncPortfolioAsset(event.data.id);
    } else if (event.type === "video.upload.asset_created") {
      const { mux } = await createValidatedMuxContext();
      const upload = await mux.video.uploads.retrieve(event.data.id);
      if (
        portfolioId(upload.new_asset_settings?.passthrough) &&
        upload.asset_id
      )
        await syncPortfolioAsset(upload.asset_id);
    }
    return Response.json({ received: true });
  } catch {
    return new Response(null, { status: 503 });
  }
}
