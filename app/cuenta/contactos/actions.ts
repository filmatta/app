"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notifyNewProfileContact } from "@/lib/contacts/email";
import {
  CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN, CONTACT_REPORT_MAX, CONTACT_REPORT_MIN,
  parseContactInput, validUuid,
} from "@/lib/contacts/validation";

export type ContactActionState = { error: string };

export async function sendProfileContact(_previous: ContactActionState, form: FormData): Promise<ContactActionState> {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) return { error: "Inicia sesión para contactar." };
  const parsed = parseContactInput(form);
  if (!parsed.ok) return { error: parsed.error };
  const { data: id, error } = await supabase.rpc("send_profile_contact", {
    p_slug: parsed.slug, p_contact_type: parsed.contactType, p_message: parsed.message,
  });
  if (error || typeof id !== "string") {
    if (error?.code === "23505") return { error: "Ya enviaste una consulta reciente a este perfil. Revísala en Contactos." };
    if (error?.code === "22023") return { error: "Alcanzaste un límite temporal o el mensaje no es válido. Inténtalo más tarde." };
    return { error: "No pudimos enviar la consulta. El perfil puede no estar disponible para contacto." };
  }
  await notifyNewProfileContact(id, data.user.id);
  revalidatePath("/cuenta/contactos");
  redirect(`/cuenta/contactos/${id}?sent=1`);
}

export async function markProfileContactRead(id: string) {
  if (!validUuid(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.rpc("mark_profile_contact_read", { p_id: id });
  revalidatePath("/cuenta/contactos");
  revalidatePath(`/cuenta/contactos/${id}`);
}

export async function respondProfileContact(_previous: ContactActionState, form: FormData): Promise<ContactActionState> {
  const id = String(form.get("id") ?? ""), message = String(form.get("message") ?? "").trim();
  if (!validUuid(id) || message.length < CONTACT_MESSAGE_MIN || message.length > CONTACT_MESSAGE_MAX)
    return { error: "Escribe una respuesta de entre 20 y 3 000 caracteres." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Inicia sesión para responder." };
  const { data, error } = await supabase.rpc("respond_profile_contact", { p_id: id, p_message: message });
  if (error || data !== true) return { error: "No pudimos guardar la respuesta. Puede que esta consulta ya tenga una respuesta." };
  revalidatePath("/cuenta/contactos");
  revalidatePath(`/cuenta/contactos/${id}`);
  return { error: "" };
}

export async function manageProfileContact(_previous: ContactActionState, form: FormData): Promise<ContactActionState> {
  const id = String(form.get("id") ?? ""), action = String(form.get("action") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!validUuid(id) || !["archive", "report"].includes(action)) return { error: "La acción no es válida." };
  if (action === "report" && (reason.length < CONTACT_REPORT_MIN || reason.length > CONTACT_REPORT_MAX))
    return { error: "Describe el motivo con entre 3 y 500 caracteres." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { error: "Inicia sesión para continuar." };
  const { data, error } = await supabase.rpc("manage_profile_contact", {
    p_id: id, p_action: action, p_reason: action === "report" ? reason : null,
  });
  if (error || data !== true) return { error: "No pudimos actualizar esta consulta." };
  revalidatePath("/cuenta/contactos");
  if (action === "archive") redirect("/cuenta/contactos?archived=1");
  revalidatePath(`/cuenta/contactos/${id}`);
  return { error: "" };
}
