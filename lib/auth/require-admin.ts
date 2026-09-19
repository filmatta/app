import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";

// Identity gate for the MFA screen only; it grants no administrative access.
export async function requireAdminIdentity() {
  const supabase = await createClient();

  const { data: claimsData, error } = await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (error || !userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  return {
    supabase,
    userId,
  };
}

export async function requireAdmin(next = "/admin") {
  const identity = await requireAdminIdentity();
  const { data, error } =
    await identity.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data?.currentLevel !== "aal2" || data.nextLevel !== "aal2") {
    redirect(`/verificar-admin?next=${encodeURIComponent(getSafeNextPath(next, "/admin"))}`);
  }
  return identity;
}
