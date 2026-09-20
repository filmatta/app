import { createClient } from "@/lib/supabase/server";
import { createValidatedMuxContext } from "@/lib/mux/server";
import { assertMuxEnvironmentProvenance } from "@/lib/mux/provenance";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return Response.json({ error: "No disponible." }, { status: 404, headers });
  const db = await createClient();
  const { data: resource, error } = await db.rpc("get_profile_media_resource", {
    p_id: id,
  });
  if (error || !resource)
    return Response.json({ error: "No disponible." }, { status: 404, headers });
  try {
    if (resource.source === "storage") {
      const signed = await db.storage
        .from("profile-media")
        .createSignedUrl(resource.storage_path, 60);
      if (signed.error) throw signed.error;
      return Response.json({ image: signed.data.signedUrl, expiresAt: Date.now() + 60000 }, { headers });
    }
    if (resource.source === "mux") {
      const { mux, environment } = await createValidatedMuxContext();
      assertMuxEnvironmentProvenance(resource, environment);
      if (
        !resource.mux_playback_id ||
        !process.env.MUX_SIGNING_KEY ||
        !process.env.MUX_PRIVATE_KEY
      )
        throw new Error("Unavailable");
      const opts = {
        expiration: "5m",
        keySecret: process.env.MUX_PRIVATE_KEY.replace(/\\n/g, "\n"),
      };
      const [playback, thumbnail] = await Promise.all([
        mux.jwt.signPlaybackId(resource.mux_playback_id, {
          ...opts,
          type: "video",
        }),
        mux.jwt.signPlaybackId(resource.mux_playback_id, {
          ...opts,
          type: "thumbnail",
        }),
      ]);
      return Response.json(
        {
          playbackId: resource.mux_playback_id,
          expiresAt: Date.now() + 300000,
          tokens: { playback, thumbnail },
        },
        { headers },
      );
    }
    return Response.json({ image: resource.url }, { headers });
  } catch {
    return Response.json(
      { error: "Media no disponible. Inténtalo de nuevo." },
      { status: 503, headers },
    );
  }
}
