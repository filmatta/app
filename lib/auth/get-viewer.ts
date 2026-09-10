import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string | null;
  fullName: string | null;
  displayName: string;
  role: string;
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Error cargando el rol del usuario:", profileError);
  }

  const email = user.email ?? null;
  const metadata = isRecord(user.user_metadata) ? user.user_metadata : {};
  const preferredName = [metadata.full_name, metadata.name].find(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );

  return {
    id: user.id,
    email,
    fullName: preferredName?.trim() ?? null,
    displayName: preferredName?.trim() || email?.split("@")[0] || "Estudiante",
    role: profile?.role ?? "user",
  };
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
