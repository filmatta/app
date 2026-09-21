"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export async function setProfileFollow(slug: string, following: boolean) {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,120}$/.test(slug) || typeof following !== "boolean") return { error: "Perfil no disponible." };
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { error: "Inicia sesión para seguir este perfil." };
  const result = await db.rpc("set_profile_follow", { p_slug: slug, p_follow: following });
  if (result.error) return { error: "No pudimos guardar el cambio. Inténtalo de nuevo." };
  revalidatePath(`/perfiles/${slug}`);
  return { following: Boolean(result.data) };
}
