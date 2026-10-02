import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CreateDashboardItem = {
  id: string;
  title: string;
  updatedAt: string;
  kind: "writer" | "shotlist";
  href: string;
  relation: string | null;
};

export async function getAccountDashboard(userId: string) {
  const db = await createClient();
  const [scriptsResult, shotlistsResult] = await Promise.all([
    db
      .from("writer_scripts")
      .select("id,title,updated_at")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(8),
    db
      .from("writer_shotlists")
      .select("id,script_id,title,updated_at")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  const scripts: CreateDashboardItem[] = (scriptsResult.data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    updatedAt: String(row.updated_at),
    kind: "writer",
    href: `/writer/${row.id}`,
    relation: null,
  }));
  const shotlists: CreateDashboardItem[] = (shotlistsResult.data ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    updatedAt: String(row.updated_at),
    kind: "shotlist",
    href: `/shotlists/${row.id}`,
    relation: row.script_id ? "Vinculada a Writer" : "Shotlist libre",
  }));

  return {
    scripts,
    shotlists,
    recent: [...scripts, ...shotlists]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 6),
    partial: Boolean(scriptsResult.error || shotlistsResult.error),
  };
}
