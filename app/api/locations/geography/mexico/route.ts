import { getMexicoLocalities, getMexicoMunicipalities } from "@/lib/locations/geography";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const level = params.get("level");
  const region = params.get("region") ?? "";
  const municipality = params.get("municipality") ?? "";

  try {
    if (level === "municipalities") {
      const items = await getMexicoMunicipalities(region);
      if (!items.length) return Response.json({ error: "Entidad no válida." }, { status: 400 });
      return catalogResponse(items);
    }
    if (level === "localities") {
      const items = await getMexicoLocalities(region, municipality);
      if (!items.length) return Response.json({ error: "Municipio o localidad no disponible." }, { status: 400 });
      return catalogResponse(items);
    }
    return Response.json({ error: "Consulta no válida." }, { status: 400 });
  } catch (error) {
    console.error("Location geography catalog failed", {
      level,
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json({ error: "El catálogo geográfico no está disponible. Inténtalo de nuevo." }, { status: 503 });
  }
}

function catalogResponse(items: unknown[]) {
  return Response.json({ items }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
