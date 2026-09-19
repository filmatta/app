import { redirect } from "next/navigation";
import { requireAdminIdentity } from "@/lib/auth/require-admin";
import { buildMfaSnapshot } from "@/lib/auth/mfa-state";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import MfaTotpManager from "@/components/auth/MfaTotpManager";

export default async function AdminVerification({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { supabase } = await requireAdminIdentity();
  const params = await searchParams;
  const safeNext = getSafeNextPath(params.next ?? null, "/admin");
  const next = safeNext.split(/[?#]/)[0] === "/verificar-admin" ? "/admin" : safeNext;
  const [factors, assurance] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (
    !assurance.error &&
    assurance.data?.currentLevel === "aal2" &&
    assurance.data.nextLevel === "aal2"
  ) {
    redirect(next);
  }
  const initialSnapshot = buildMfaSnapshot(factors, assurance);

  return <main className="mx-auto max-w-lg px-6 py-20 text-white">
    <h1 className="text-3xl font-semibold">Se requiere verificación adicional</h1>
    <p className="my-6 text-white/70">Para administrar FILMATTA, verifica tu identidad con una aplicación de autenticación.</p>
    <MfaTotpManager next={next} initialSnapshot={initialSnapshot} />
  </main>;
}
