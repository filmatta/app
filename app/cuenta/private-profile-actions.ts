"use server";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_CONTACT, parsePrivateContact, type PrivateContact } from "@/lib/profiles/private-contact";
export async function loadPrivateContact(): Promise<{ data: PrivateContact } | { error: string }> {
  const db = await createClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return { error: "Inicia sesión para consultar tus datos privados." };
  const result = await db.from("profile_private_settings").select("instagram_username,whatsapp_e164,preferred_contact,contact_visibility").eq("owner_id", auth.user.id).maybeSingle();
  if (result.error) return { error: "No pudimos cargar tus datos de contacto. Inténtalo de nuevo." };
  return { data: result.data ? parsePrivateContact(result.data) ?? EMPTY_CONTACT : EMPTY_CONTACT };
}
export async function savePrivateContact(input: unknown) {
  const parsed = parsePrivateContact(input);
  if (!parsed) return { error: "Revisa Instagram y el formato internacional de WhatsApp." };
  const db = await createClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return { error: "Inicia sesión para guardar tus datos." };
  const saved = await db.rpc("save_my_private_contact", { p_data: parsed });
  if (saved.error) return { error: "No pudimos guardar los datos privados." };
  return { data: parsed };
}
