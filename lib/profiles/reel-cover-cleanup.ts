import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Only explicitly discarded dedicated covers. Book/identity assets are never eligible.
export async function cleanDiscardedReelCovers(ownerId?: string) {
  const db = createAdminClient();
  if (!ownerId) {
    const queued = await db.rpc("queue_expired_reel_covers");
    if (queued.error) throw Error("No se pudo comprobar portadas abandonadas.");
  }
  let query = db.from("profile_media").select("id,owner_id,storage_path,derivative_path")
    .eq("purpose", "reel_cover").eq("status", "deleted").eq("visibility", "archived")
    .not("cleanup_after", "is", null).limit(50);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query;
  if (error) throw Error("No se pudo comprobar la limpieza de portadas.");
  for (const row of data ?? []) {
    const prefix = `${row.owner_id}/${row.id}/`;
    const paths = [row.storage_path, row.derivative_path].filter((p): p is string => Boolean(p));
    if (paths.some(p => !p.startsWith(prefix))) throw Error("Ruta de portada no válida.");
    if (paths.length) {
      const removed = await db.storage.from("profile-media").remove(paths);
      if (removed.error) throw Error("Limpieza de portada pendiente de reintento.");
    }
    const cleared = await db.from("profile_media").update({ cleanup_after: null })
      .eq("id", row.id).eq("purpose", "reel_cover").eq("status", "deleted");
    if (cleared.error) throw Error("Limpieza de portada pendiente de confirmar.");
  }
  return data?.length ?? 0;
}
