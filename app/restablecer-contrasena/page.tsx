import Link from "next/link";
import { updateRecoveredPassword } from "@/app/cuenta/actions";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafeNextPath(params.next ?? null, "/cuenta");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims?.sub);

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link href="/" className="text-xl font-black tracking-[0.25em]">
            FILMATTA
          </Link>
          <Link href="/cuenta" className="text-sm text-white/50 hover:text-white">
            Mi cuenta
          </Link>
        </div>
      </header>

      <section className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Seguridad de cuenta
        </p>
        <h1 className="text-5xl font-semibold tracking-[-0.04em]">
          Nueva contraseña
        </h1>

        {hasSession ? (
          <>
            <p className="mt-4 leading-7 text-white/45">
              Elige una contraseña nueva de al menos 8 caracteres.
            </p>
            <form action={updateRecoveredPassword} className="mt-9 space-y-5">
              <input type="hidden" name="next" value={nextPath} />
              <PasswordField
                id="password"
                name="password"
                label="Nueva contraseña"
              />
              <PasswordField
                id="password_confirmation"
                name="password_confirmation"
                label="Confirmar contraseña"
              />
              {params.error && (
                <p className="text-sm text-red-300">{params.error}</p>
              )}
              <button
                type="submit"
                className="w-full rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85"
              >
                Guardar contraseña
              </button>
            </form>
          </>
        ) : (
          <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.025] p-6">
            <p className="leading-7 text-white/55">
              Este enlace ya no es válido o la sesión de recuperación terminó.
            </p>
            <Link
              href={`/recuperar-contrasena?next=${encodeURIComponent(nextPath)}`}
              className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
            >
              Solicitar otro enlace
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

function PasswordField({
  id,
  name,
  label,
}: {
  id: string;
  name: string;
  label: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm text-white/60">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        minLength={8}
        required
        autoComplete="new-password"
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 outline-none transition focus:border-white/30"
      />
    </div>
  );
}
