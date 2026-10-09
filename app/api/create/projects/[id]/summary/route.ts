import { createClient } from "@/lib/supabase/server";
import { CreateProjectError, getCreateProjectContext } from "@/lib/create/project";
import { getCreateProjectOverview } from "@/lib/create/overview";
import { getRecentProjectDocuments } from "@/lib/create/recent-documents";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) {
    return Response.json({ message: "Inicia sesión para ver este proyecto." }, { status: 401, headers: noStore });
  }

  try {
    const project = await getCreateProjectContext(db, auth.data.user.id, id);
    const [overview, recentDocuments] = await Promise.all([
      getCreateProjectOverview(db, auth.data.user.id, project),
      getRecentProjectDocuments(db, auth.data.user.id, project),
    ]);
    return Response.json({ project, overview, recentDocuments }, { headers: noStore });
  } catch (error) {
    if (error instanceof CreateProjectError && error.code === "not_found") {
      return Response.json({ message: error.message }, { status: 404, headers: noStore });
    }
    console.error("Unable to load project dashboard summary", error);
    return Response.json({ message: "No pudimos cargar el resumen de este proyecto." }, { status: 500, headers: noStore });
  }
}
