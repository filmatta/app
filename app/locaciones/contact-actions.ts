"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LocationContactActionState = { error: string; requestId?: string };

export async function sendLocationContactRequest(
  _previous: LocationContactActionState,
  form: FormData,
): Promise<LocationContactActionState> {
  const slug = String(form.get("slug") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const idempotencyKey = String(form.get("idempotency_key") ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || message.length < 20 || message.length > 500 || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return { error: "Escribe un mensaje de entre 20 y 500 caracteres." };
  }
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Inicia sesión para contactar." };
  const result = await db.rpc("send_location_contact_request", {
    p_slug: slug,
    p_message: message,
    p_idempotency_key: idempotencyKey,
  });
  if (result.error || typeof result.data !== "string") {
    if (result.error?.code === "LCC01") return { error: "No tienes créditos de Locaciones disponibles." };
    if (result.error?.code === "LCN01") return { error: "Esta locación no tiene un canal de contacto disponible." };
    if (result.error?.code === "LCP01") return { error: "La política de créditos de Locaciones para tu plan todavía está pendiente." };
    return { error: "No pudimos enviar la solicitud. La locación puede haber dejado de estar disponible." };
  }
  revalidatePath("/cuenta/contactos/locaciones");
  revalidatePath(`/locaciones/${slug}`);
  return { error: "", requestId: result.data };
}
