import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Summary, Project } from "@/lib/networking/types";
export async function getAccountDashboard(userId: string) {
 const db = await createClient();
 const [profile, summary, active, pending, latest, locations] = await Promise.all([
  db.from("professional_profiles").select("is_public,slug,display_name,presentation").eq("user_id", userId).maybeSingle(),
  db.rpc("get_my_network_summary"),
  db.from("projects").select("id", { count: "exact", head: true }).eq("owner_id",userId).neq("lifecycle_status","archived").eq("operational_status","active"),
  db.from("projects").select("id", { count: "exact", head: true }).eq("owner_id",userId).neq("lifecycle_status","archived").eq("operational_status","pending_confirmation"),
  db.from("projects").select("id,slug,title,summary,description,cover_image_path,project_type,client_name,share_client_name,client_type,city,work_area,shooting_schedule,economic_mode,date_window,starts_on,ends_on,dates_confirmed,roles,requirements,status,lifecycle_status,visibility,operational_status,updated_at").eq("owner_id",userId).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
  db.from("locations").select("id",{count:"exact",head:true}).eq("owner_id",userId).eq("status","published"),
 ]);
 return { profile: profile.error ? undefined : profile.data,
  summary: summary.error ? null : summary.data as Summary | null,
  active: active.error ? null : active.count, pending: pending.error ? null : pending.count,
  latest: latest.error ? null : latest.data as (Project & {updated_at:string}) | null,
  locations: locations.error ? null : locations.count,
  partial: [profile,summary,active,pending,latest,locations].some(r=>Boolean(r.error)) };
}
