"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseServiceForm } from "@/lib/services/form";
import { catalogErrorKind } from "@/lib/catalogs/filters";
import { UUID_PATTERN } from "@/lib/opportunities/form";
export async function saveService(
  _previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user)
    return { error: "Inicia sesión para guardar tu servicio." };
  const parsed = parseServiceForm(form);
  if (!parsed.ok) return { error: parsed.error };
  const { error } = await supabase.rpc("save_my_service", {
    p_id: parsed.id,
    p_data: parsed.values,
    p_status: parsed.status,
  });
  if (error)
    return {
      error:
        catalogErrorKind(error) === "unconfigured"
          ? "La publicación de servicios aún no está configurada."
          : "No pudimos guardar. Comprueba los campos y que el servicio te pertenece.",
    };
  revalidatePath("/marketplace");
  revalidatePath("/marketplace/[slug]", "page");
  revalidatePath("/mis-servicios");
  redirect("/mis-servicios?saved=1");
}
export async function sendServiceInquiry(
  _previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user)
    return { error: "Inicia sesión para enviar una consulta." };
  const slug = String(form.get("slug") ?? ""),
    message = String(form.get("message") ?? "").trim();
  if (
    !/^[a-z0-9-]{3,160}$/.test(slug) ||
    message.length < 20 ||
    message.length > 3000
  )
    return { error: "Describe tu consulta con entre 20 y 3 000 caracteres." };
  const { error } = await supabase.rpc("send_service_inquiry", {
    p_slug: slug,
    p_message: message,
  });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "Ya enviaste una consulta a este servicio. Revísala en tus consultas."
          : catalogErrorKind(error) === "unconfigured"
            ? "Las consultas aún no están configuradas."
            : "No pudimos enviar. Publica tu perfil profesional y comprueba que el servicio sigue disponible. Límite: 10 consultas cada 24 horas.",
    };
  revalidatePath("/mis-servicios/consultas");
  redirect("/mis-servicios/consultas?sent=1");
}
export async function updateInquiry(
  _previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user)
    return { error: "Inicia sesión para responder." };
  const id = String(form.get("id") ?? ""),
    status = String(form.get("status") ?? "");
  if (
    !UUID_PATTERN.test(id) ||
    !["accepted", "declined", "archived"].includes(status)
  )
    return { error: "La respuesta no es válida." };
  const { data: updated, error } = await supabase
    .from("catalog_inquiries")
    .update({ status })
    .eq("id", id)
    .eq("recipient_id", data.user.id)
    .select("id");
  if (error || updated?.length !== 1)
    return { error: "No pudimos actualizar esta consulta." };
  revalidatePath("/mis-servicios/consultas");
  return { error: "" };
}
