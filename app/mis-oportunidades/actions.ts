"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { catalogErrorKind } from "@/lib/catalogs/filters";
import { parseOpportunityForm } from "@/lib/opportunities/form";

export async function saveOpportunity(
  _previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user)
    return { error: "Inicia sesión antes de guardar tu publicación." };
  const parsed = parseOpportunityForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const { error } = await supabase.rpc("save_my_opportunity", {
    p_id: parsed.id,
    p_data: parsed.values,
    p_project_title: parsed.projectTitle || null,
    p_status: parsed.status,
  });
  if (error) {
    console.error("Opportunity save failed", error);
    return {
      error:
        catalogErrorKind(error) === "unconfigured"
          ? "La publicación de oportunidades aún no está configurada."
          : "No pudimos guardar. Revisa los campos y comprueba que esta publicación te pertenece.",
    };
  }
  revalidatePath("/jobs");
  revalidatePath("/oportunidades");
  revalidatePath("/oportunidades/[slug]", "page");
  revalidatePath("/mis-oportunidades");
  redirect("/mis-oportunidades?saved=1");
}

export async function sendJobInquiry(
  _previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user)
    return { error: "Inicia sesión para presentar tu interés." };
  const slug = String(form.get("slug") ?? ""),
    message = String(form.get("message") ?? "").trim();
  if (
    !/^[a-z0-9-]{3,160}$/.test(slug) ||
    message.length < 20 ||
    message.length > 3000
  )
    return { error: "Describe tu interés con entre 20 y 3 000 caracteres." };
  const { error } = await supabase.rpc("send_job_inquiry", {
    p_slug: slug,
    p_message: message,
  });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "Ya enviaste tu interés a este encargo. Revísalo en Consultas privadas."
          : catalogErrorKind(error) === "unconfigured"
            ? "Las consultas aún no están configuradas."
            : "No pudimos enviar. Publica tu perfil y comprueba que la convocatoria sigue abierta. Límite: 10 consultas cada 24 horas.",
    };
  revalidatePath("/mis-servicios/consultas");
  redirect("/mis-servicios/consultas?sent=1");
}
