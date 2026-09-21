"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validUuid } from "@/lib/contacts/validation";
import type { Project, Summary, NetworkNotification } from "@/lib/networking/types";
async function signedClient() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  return !error && data.user ? { db, user: data.user } : null;
}
function refresh() {
  for (const path of ["/mi-perfil", "/mi-red", "/cuenta/contactos", "/notificaciones", "/proyectos"]) revalidatePath(path);
}
export async function saveNetworkingProject(id: string | null, input: unknown): Promise<{ data: Project } | { error: string }> {
  if (id !== null && !validUuid(id)) return { error: "El proyecto no es válido." };
  const session = await signedClient(); if (!session) return { error: "Inicia sesión para guardar." };
  const { data, error } = await session.db.rpc("save_my_networking_project", { p_id: id, p_data: input });
  if (error) return { error: "No pudimos guardar. Revisa los campos y tus permisos sobre el proyecto." };
  const result = await session.db.from("projects").select("*").eq("id", data).eq("owner_id", session.user.id).single();
  if (result.error) return { error: "Proyecto guardado; actualiza la lista para consultarlo." };
  refresh(); return { data: result.data as Project };
}
export async function listAttachableProjects(): Promise<{ data: Project[] } | { error: string }> {
  const s = await signedClient(); if (!s) return { error: "Inicia sesión para ver tus proyectos." };
  const { data, error } = await s.db.from("projects").select("*").eq("owner_id", s.user.id).eq("networking_private", true).eq("status", "draft").order("created_at", { ascending: false }).limit(50);
  return error ? { error: "No pudimos cargar tus proyectos." } : { data: data as Project[] };
}
export async function transitionRequest(id: string, action: "accept" | "reject" | "cancel") {
  if (!validUuid(id) || !["accept", "reject", "cancel"].includes(action)) return { error: "Acción no válida." };
  const s = await signedClient(); if (!s) return { error: "Inicia sesión para continuar." };
  const { data, error } = await s.db.rpc("transition_contact_request", { p_id: id, p_action: action });
  if (error) return { error: "No pudimos actualizar la solicitud. Revisa tus permisos e inténtalo de nuevo." };
  refresh(); revalidatePath(`/cuenta/contactos/${id}`); return { state: String(data) };
}
export async function unfollowNetwork(id: string) {
  if (!validUuid(id)) return { error: "Perfil no válido." };
  const s = await signedClient(); if (!s) return { error: "Inicia sesión para continuar." };
  const { error } = await s.db.rpc("unfollow_my_network_profile", { p_id: id });
  if (error) return { error: "No pudimos dejar de seguir este perfil." };
  refresh(); return { ok: true };
}
export async function loadNetworkNotifications(): Promise<{ summary: Summary; items: NetworkNotification[] } | { error: string }> {
  const s = await signedClient(); if (!s) return { error: "Inicia sesión para consultar notificaciones." };
  const [summary, items] = await Promise.all([s.db.rpc("get_my_network_summary"), s.db.rpc("get_my_network_notifications", { p_page: 1 })]);
  if (summary.error || items.error) return { error: "No pudimos cargar tus notificaciones." };
  return { summary: summary.data as Summary, items: (items.data as NetworkNotification[]).slice(0, 8) };
}
export async function markNetworkNotification(id: string | null) {
  if (id !== null && !validUuid(id)) return { error: "Notificación no válida." };
  const s = await signedClient(); if (!s) return { error: "Inicia sesión para continuar." };
  const { error } = await s.db.rpc("mark_my_network_notification", { p_id: id });
  if (error) return { error: "No pudimos marcar la notificación." };
  revalidatePath("/notificaciones"); return { ok: true };
}
