import { createClient } from "@/lib/supabase/server";
import { createValidatedMuxContext } from "@/lib/mux/server";
import {
  parseMediaInput,
  validateUploadDeclaration,
} from "@/lib/profiles/media";
import { readBoundedBody } from "@/lib/security/bounded-body";
import { portfolioRequestOrigin } from "@/lib/profiles/request-origin";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = portfolioRequestOrigin(request);
  if (!origin)
    return Response.json({ error: "Origen no válido." }, { status: 403 });
  const db = await createClient();
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user)
    return Response.json({ error: "Inicia sesión." }, { status: 401 });
  let body;
  try {
    body = JSON.parse(await readBoundedBody(request, 8192));
  } catch {
    return Response.json({ error: "Solicitud no válida." }, { status: 400 });
  }
  const input = parseMediaInput(body.item);
  if (
    !input ||
    !["mux", "storage"].includes(input.source) ||
    !body.file ||
    typeof body.file.name !== "string"
  )
    return Response.json(
      { error: "Revisa los datos del trabajo." },
      { status: 400 },
    );
  const declarationError = validateUploadDeclaration(
    input.media_type === "image" ? "image" : "video",
    body.file,
  );
  if (declarationError)
    return Response.json({ error: declarationError }, { status: 400 });
  if (
    input.source === "mux" &&
    process.env.PORTFOLIO_DIRECT_UPLOADS_ENABLED !== "true"
  )
    return Response.json(
      {
        error:
          "La subida de video está pausada. Puedes pegar un enlace de YouTube o Vimeo.",
      },
      { status: 503 },
    );
  try {
    const context =
      input.source === "mux" ? await createValidatedMuxContext() : null;
    const extension = body.file.name.split(".").pop().toLowerCase();
    const { data: id, error } = await db.rpc("reserve_my_profile_upload", {
      p_data: input,
      p_size: body.file.size,
      p_mime: body.file.type,
      p_extension: extension,
    });
    if (error || !id)
      return Response.json(
        {
          error:
            "No pudimos iniciar la subida. Guarda tu identidad y comprueba que no tengas dos subidas pendientes ni hayas alcanzado la cuota.",
        },
        { status: 429 },
      );
    if (!context)
      return Response.json({
        id,
        path: `${auth.user.id}/${id}/original.${extension}`,
      });
    const upload = await context.mux.video.uploads.create({
      cors_origin: origin,
      timeout: 3600,
      new_asset_settings: {
        playback_policies: ["signed"],
        video_quality: "basic",
        passthrough: `filmatta:portfolio:${id}`,
        meta: { external_id: id, creator_id: auth.user.id },
        test: context.environment.type !== "production",
      },
    });
    const bound = await db.rpc("bind_my_profile_upload", {
      p_id: id,
      p_upload: upload.id,
      p_environment: context.environment.id,
      p_environment_type: context.environment.type,
    });
    if (bound.error || !upload.url || !upload.url.startsWith("https://")) {
      await context.mux.video.uploads.cancel(upload.id);
      return Response.json(
        {
          error: "No pudimos preparar una subida segura. Inténtalo más tarde.",
        },
        { status: 503 },
      );
    }
    return Response.json(
      { id, uploadUrl: upload.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: "El servicio de subida no está disponible. Inténtalo más tarde.",
      },
      { status: 503 },
    );
  }
}
