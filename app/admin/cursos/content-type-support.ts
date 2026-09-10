import "server-only";
import { requireAdmin } from "@/lib/auth/require-admin";

type AdminSupabaseClient = Awaited<
  ReturnType<typeof requireAdmin>
>["supabase"];

export async function getContentTypeSupport(
  supabase: AdminSupabaseClient
): Promise<"available" | "missing" | "error"> {
  const { error } = await supabase.from("courses").select("content_type").limit(0);

  if (!error) {
    return "available";
  }

  if (error.code === "42703") {
    return "missing";
  }

  console.error("Error comprobando content_type en courses:", error);
  return "error";
}
