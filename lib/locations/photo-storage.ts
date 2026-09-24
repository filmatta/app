import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCATION_PHOTO_BUCKET } from "@/lib/locations/media";

type CleanupRow = { id: string; storage_path: string | null };

export async function cleanupLocationPhotoRows(
  db: SupabaseClient,
  admin: SupabaseClient,
  locationId: string,
) {
  const claimed = await db.rpc("claim_my_location_photo_cleanup", {
    p_location_id: locationId,
  });
  if (claimed.error) return { error: claimed.error };
  for (const row of (claimed.data ?? []) as CleanupRow[]) {
    const removed = row.storage_path
      ? await admin.storage.from(LOCATION_PHOTO_BUCKET).remove([row.storage_path])
      : { error: null };
    await admin.rpc("attest_location_photo_deletion", {
      p_id: row.id,
      p_success: !removed.error,
    });
  }
  return { error: null };
}

export async function deleteLocationPhotoObject(
  admin: SupabaseClient,
  photoId: string,
  storagePath: string | null,
) {
  const removed = storagePath
    ? await admin.storage.from(LOCATION_PHOTO_BUCKET).remove([storagePath])
    : { error: null };
  await admin.rpc("attest_location_photo_deletion", {
    p_id: photoId,
    p_success: !removed.error,
  });
  return !removed.error;
}
