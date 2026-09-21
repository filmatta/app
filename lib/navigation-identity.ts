import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/get-viewer";

// Identity only: never use reel covers, video thumbnails or auth avatars.
export const getNavigationIdentity = cache(async (viewer: Viewer | null) => {
  if (!viewer) return {};
  const client = await createClient();
  const { data } = await client.from("professional_profiles").select("display_name,presentation").eq("user_id", viewer.id).maybeSingle();
  const portrait = data?.presentation as { portrait_media_id?: string; portrait_url?: string; stage_name?: string } | null;
  return { accountName: portrait?.stage_name || data?.display_name || viewer.displayName,
    accountPortrait: { id: portrait?.portrait_media_id, url: portrait?.portrait_url } };
});
