"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Project } from "@/lib/networking/types";
import {
  parseProjectForm,
  PROJECT_UUID_PATTERN,
  type ProjectIntent,
} from "@/lib/projects/form";
import { createClient } from "@/lib/supabase/server";

const PROJECT_FIELDS =
  "id,slug,title,summary,description,cover_image_path,project_type,client_name,share_client_name,client_type,city,work_area,shooting_schedule,economic_mode,date_window,starts_on,ends_on,dates_confirmed,roles,requirements,status,lifecycle_status,visibility,operational_status,updated_at";

type ExistingProject = {
  id: string;
  slug: string;
  cover_image_path: string | null;
  lifecycle_status: Project["lifecycle_status"];
  visibility: Project["visibility"];
};

export type ProjectActionResult =
  | { ok: true; project: Project; message: string; redirectTo?: string }
  | { ok: false; error: string };

export async function saveProject(
  projectId: string | null,
  formData: FormData,
): Promise<ProjectActionResult> {
  if (projectId !== null && !PROJECT_UUID_PATTERN.test(projectId)) {
    return { ok: false, error: "No encontramos este proyecto." };
  }
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return { ok: false, error: "Inicia sesión para guardar el proyecto." };
  }

  let existing: ExistingProject | null = null;
  if (projectId) {
    const result = await supabase
      .from("projects")
      .select("id,slug,cover_image_path,lifecycle_status,visibility")
      .eq("id", projectId)
      .eq("owner_id", auth.data.user.id)
      .maybeSingle();
    if (result.error) {
      logProjectError("Error cargando el proyecto antes de guardar", result.error);
      return { ok: false, error: "No pudimos preparar el proyecto para guardar." };
    }
    if (!result.data) return { ok: false, error: "No encontramos este proyecto o no tienes permiso para editarlo." };
    existing = result.data as ExistingProject;
  }

  const state = transitionState(parsed.value.intent, existing);
  const payload = {
    ...parsed.value.values,
    lifecycle_status: state.lifecycle,
    visibility: state.visibility,
  };
  const saved = await supabase.rpc("save_my_project_v15", {
    p_id: projectId,
    p_data: payload,
  });
  if (saved.error || typeof saved.data !== "string") {
    logProjectError("Error guardando Project V1.5", saved.error);
    return {
      ok: false,
      error:
        saved.error?.code === "PGRST202"
          ? "Projects V1.5 aún no está configurado en la base de datos."
          : "No pudimos guardar. Revisa los campos y tus permisos sobre el proyecto.",
    };
  }

  const coverResult = await updateProjectCover({
    supabase,
    userId: auth.data.user.id,
    projectId: saved.data,
    previousPath: existing?.cover_image_path ?? null,
    cover: parsed.value.cover,
    removeCover: parsed.value.removeCover,
  });
  const result = await supabase
    .from("projects")
    .select(PROJECT_FIELDS)
    .eq("id", saved.data)
    .eq("owner_id", auth.data.user.id)
    .single();
  if (result.error || !result.data) {
    logProjectError("Proyecto guardado pero no recargado", result.error);
    return { ok: false, error: "El proyecto se guardó. Actualiza la página para verlo." };
  }

  const project = result.data as Project;
  revalidateProjectPaths(existing?.slug, project.slug, project.id);
  return {
    ok: true,
    project,
    message: coverResult.warning ?? projectActionMessage(parsed.value.intent),
    redirectTo:
      parsed.value.intent === "create-opportunity"
        ? `/mis-oportunidades/nueva?project=${project.id}`
        : projectId === null
          ? `/mis-proyectos/${project.id}/editar?created=1`
          : parsed.value.intent === "archive"
            ? "/mis-proyectos?archived=1"
            : undefined,
  };
}

export async function convertOpportunityToProject(opportunityId: string) {
  if (!PROJECT_UUID_PATTERN.test(opportunityId)) {
    redirect("/mis-oportunidades?conversion_error=1");
  }
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    redirect(`/acceso?next=${encodeURIComponent(`/mis-oportunidades/${opportunityId}/editar`)}`);
  }
  const result = await supabase.rpc("convert_my_opportunity_to_project", {
    p_opportunity_id: opportunityId,
  });
  if (result.error || typeof result.data !== "string") {
    logProjectError("Error convirtiendo Opportunity en Project", result.error);
    redirect(`/mis-oportunidades/${opportunityId}/editar?conversion_error=1`);
  }
  revalidatePath("/mis-proyectos");
  revalidatePath("/mis-oportunidades");
  revalidatePath(`/mis-oportunidades/${opportunityId}/editar`);
  redirect(`/mis-proyectos/${result.data}/editar?converted=1`);
}

function transitionState(intent: ProjectIntent, existing: ExistingProject | null) {
  if (intent === "publish") return { lifecycle: "active" as const, visibility: "public" as const };
  if (intent === "unpublish") return { lifecycle: "active" as const, visibility: "private" as const };
  if (intent === "archive") return { lifecycle: "archived" as const, visibility: "private" as const };
  if (intent === "restore") return { lifecycle: "draft" as const, visibility: "private" as const };
  return {
    lifecycle: existing?.lifecycle_status ?? ("draft" as const),
    visibility: existing?.visibility ?? ("private" as const),
  };
}

function projectActionMessage(intent: ProjectIntent) {
  return {
    save: "Cambios guardados",
    publish: "Proyecto publicado",
    unpublish: "Proyecto despublicado",
    archive: "Proyecto archivado",
    restore: "Proyecto reactivado como borrador",
    "create-opportunity": "Proyecto guardado",
  }[intent];
}

async function updateProjectCover({
  supabase,
  userId,
  projectId,
  previousPath,
  cover,
  removeCover,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  projectId: string;
  previousPath: string | null;
  cover: File | null;
  removeCover: boolean;
}): Promise<{ ok: true; warning?: string }> {
  if (!cover && !removeCover) return { ok: true };
  let newPath: string | null = null;
  if (cover) {
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[cover.type];
    newPath = `${userId}/${projectId}/${crypto.randomUUID()}.${extension}`;
    const upload = await supabase.storage.from("project-covers").upload(newPath, cover, {
      contentType: cover.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (upload.error) {
      logProjectError("Error subiendo portada de Project", upload.error);
      return { ok: true, warning: "Proyecto guardado sin portada. Puedes volver a intentar subirla." };
    }
  }

  const update = await supabase
    .from("projects")
    .update({ cover_image_path: newPath })
    .eq("id", projectId)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();
  if (update.error || !update.data) {
    if (newPath) await supabase.storage.from("project-covers").remove([newPath]);
    logProjectError("Error asociando portada de Project", update.error);
    return { ok: true, warning: "Proyecto guardado; la portada anterior se conservó." };
  }
  if (previousPath && previousPath !== newPath) {
    const removed = await supabase.storage.from("project-covers").remove([previousPath]);
    if (removed.error) logProjectError("No se pudo limpiar la portada anterior", removed.error);
  }
  return { ok: true };
}

function revalidateProjectPaths(previousSlug: string | undefined, slug: string, id: string) {
  for (const path of ["/mis-proyectos", "/proyectos", `/mis-proyectos/${id}/editar`, `/proyectos/${slug}`]) {
    revalidatePath(path);
  }
  if (previousSlug && previousSlug !== slug) revalidatePath(`/proyectos/${previousSlug}`);
}

function logProjectError(message: string, error: { code?: string; message?: string } | null) {
  console.error(message, { code: error?.code ?? "unknown", message: error?.message ?? "Unknown database error" });
}
