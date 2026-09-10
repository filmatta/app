import Link from "next/link";
import { requestPasswordReset } from "@/app/cuenta/actions";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";

export default async function PasswordRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; sent?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafeNextPath(params.next ?? null, "/cuenta");

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <AuthHeader backHref={`/login?next=${encodeURIComponent(nextPath)}`} />

      <section className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Seguridad de cuenta
        </p>
        <h1 className="text-5xl font-semibold tracking-[-0.04em]">
          Recupera tu contraseña
        </h1>
        <p className="mt-4 leading-7 text-white/45">
          Te enviaremos un enlace seguro para establecer una contraseña nueva.
        </p>

        {params.sent === "1" && (
          <p className="mt-7 rounded-xl border border-green-500/20 bg-green-500/[0.05] p-4 text-sm leading-6 text-green-200">
            Si el correo puede recibir recuperación, encontrarás allí las
            instrucciones en unos minutos.
          </p>
        )}

        <form action={requestPasswordReset} className="mt-9 space-y-5">
          <input type="hidden" name="next" value={nextPath} />
          <div>
            <label htmlFor="email" className="mb-2 block text-sm text-white/60">
              Correo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="correo@ejemplo.com"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85"
          >
            Enviar enlace
          </button>
        </form>
      </section>
    </main>
  );
}

function AuthHeader({ backHref }: { backHref: string }) {
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
        <Link href="/" className="text-xl font-black tracking-[0.25em]">
          FILMATTA
        </Link>
        <Link
          href={backHref}
          className="text-sm text-white/50 transition hover:text-white"
        >
          ← Iniciar sesión
        </Link>
      </div>
    </header>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 outline-none transition placeholder:text-white/20 focus:border-white/30";
