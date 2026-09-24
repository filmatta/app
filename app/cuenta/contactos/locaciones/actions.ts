"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validUuid } from "@/lib/contacts/validation";

export async function transitionLocationRequest(id: string, action: "accept" | "reject" | "cancel") {
  if (!validUuid(id) || !["accept", "reject", "cancel"].includes(action)) return { error: "Acción no válida." };
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Inicia sesión para continuar." };
  const result = await db.rpc("transition_location_contact_request", { p_id: id, p_action: action });
  if (result.error) {
    if (result.error.code === "LCN01") return { error: "Configura al menos un email, teléfono, WhatsApp o Instagram en la locación antes de aceptar." };
    return { error: "No pudimos actualizar la solicitud. Puede haber vencido o la locación ya no estar publicada." };
  }
  for (const path of ["/cuenta", "/cuenta/contactos/locaciones", `/cuenta/contactos/locaciones/${id}`, "/mis-locaciones"]) revalidatePath(path);
  return { state: String(result.data) };
}
