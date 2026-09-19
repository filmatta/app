import { redirect } from "next/navigation";
import { requireAdminIdentity } from "@/lib/auth/require-admin";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import AdminMfaForm from "./totp-form";

export default async function AdminVerification({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { supabase } = await requireAdminIdentity();
  const params = await searchParams;
  const safeNext = getSafeNextPath(params.next ?? null, "/admin");
  const next = safeNext.split(/[?#]/)[0] === "/verificar-admin" ? "/admin" : safeNext;
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!error && data?.currentLevel === "aal2" && data.nextLevel === "aal2") redirect(next);
  const factors = await supabase.auth.mfa.listFactors();
  return <main className="mx-auto max-w-lg px-6 py-20 text-white">
    <h1 className="text-3xl font-semibold">Se requiere verificación adicional</h1>
    <p className="my-6 text-white/70">Para administrar FILMATTA, verifica tu identidad con una aplicación de autenticación.</p>
    <AdminMfaForm next={next} factors={(factors.data?.totp ?? []).map(({ id, friendly_name }) => ({ id, name: friendly_name ?? "Autenticador" }))} />
  </main>;
}
