import { PROJECT_UUID_PATTERN } from "@/lib/projects/form";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PROJECT_UUID_PATTERN.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const project = await supabase.from("projects")
    .select("cover_image_path,lifecycle_status,visibility,create_enabled")
    .eq("id", id).maybeSingle();
  if (project.error || !project.data?.cover_image_path) return new Response("Not found", { status: 404 });
  const file = await supabase.storage.from("project-covers").download(project.data.cover_image_path);
  if (file.error || !file.data) return new Response("Not found", { status: 404 });
  const isPublic = !project.data.create_enabled
    && project.data.lifecycle_status === "active" && project.data.visibility === "public";
  return new Response(file.data, {
    headers: {
      "Content-Type": file.data.type || "application/octet-stream",
      "Cache-Control": isPublic ? "public, max-age=3600, stale-while-revalidate=86400" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
