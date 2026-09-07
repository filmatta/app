import Link from "next/link";
import { login } from "@/app/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link href="/" className="text-xl font-black tracking-[0.25em]">
            FILMATTA
          </Link>

          <Link
            href="/"
            className="text-sm text-white/50 transition hover:text-white"
          >
            ← Volver
          </Link>
        </div>
      </header>

      <section className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          FILMATTA
        </p>

        <h1 className="text-5xl font-semibold tracking-[-0.04em]">
          Bienvenido de vuelta.
        </h1>

        <p className="mt-4 text-white/45">
          Entra a tu cuenta para continuar.
        </p>

        <form action={login} className="mt-10 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm text-white/60"
            >
              Correo
            </label>

            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 outline-none transition focus:border-white/30"
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm text-white/60"
            >
              Contraseña
            </label>

            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 outline-none transition focus:border-white/30"
              placeholder="••••••••"
            />
          </div>

          {params.error && (
            <p className="text-sm text-red-400">{params.error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85"
          >
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}