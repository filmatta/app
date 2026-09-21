"use server";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_PREFERENCES, parseProjectPreferences } from "@/lib/profiles/project-preferences";
export async function loadProjectPreferences() {
  const db = await createClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return { error: "Inicia sesión para ver tus preferencias." };
  const result = await db.from("profile_private_settings").select("project_preferences,publish_project_preferences").eq("owner_id", auth.user.id).maybeSingle();
  if (result.error) return { error: "No pudimos cargar las preferencias. No se han modificado." };
  return { data: result.data?.project_preferences ? parseProjectPreferences(result.data.project_preferences) : EMPTY_PREFERENCES, published: Boolean(result.data?.publish_project_preferences) };
}
export async function saveProjectPreferences(input: unknown, published: boolean) {
  const parsed = parseProjectPreferences(input);
  if (!parsed || typeof published !== "boolean") return { error: "Revisa las preferencias." };
  const db = await createClient();
  const { data: auth, error } = await db.auth.getUser();
  if (error || !auth.user) return { error: "Inicia sesión para guardar." };
  const result = await db.rpc("save_my_project_preferences_visibility", { p_preferences: parsed, p_publish: published });
  return result.error ? { error: "No pudimos guardar tus preferencias." } : { data: parsed };
}
