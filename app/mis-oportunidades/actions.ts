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
  revalidatePath("/oportunidades");
  revalidatePath("/oportunidades/[slug]", "page");
  revalidatePath("/mis-oportunidades");
  redirect("/mis-oportunidades?saved=1");
}
