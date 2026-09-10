import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/auth/actions";
import { getViewer } from "@/lib/auth/get-viewer";
import { getSafePostAuthPath } from "@/lib/auth/safe-next-path";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafePostAuthPath(params.next ?? null);
  const viewer = await getViewer();

  if (viewer) {
    redirect(nextPath);
  }

  const registerHref = `/registro?next=${encodeURIComponent(nextPath)}`;
  const recoveryHref = `/recuperar-contrasena?next=${encodeURIComponent(nextPath)}`;

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link href="/" className="text-xl font-black tracking-[0.25em]">
            FILMATTA
          </Link>

          <Link
            href={nextPath}
            className="text-sm text-white/50 transition hover:text-white"
          >
            ← Volver
          </Link>
        </div>
      </header>

      <section className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-16">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          FILMATTA
        </p>

        <h1 className="text-5xl font-semibold tracking-[-0.04em]">
          Bienvenido de vuelta
        </h1>

        <p className="mt-4 text-white/45">
          Inicia sesión para continuar.
        </p>

        {params.message && (
          <p className="mt-6 rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-sm leading-6 text-green-200">
            {params.message}
          </p>
        )}

        <form action={login} className="mt-10 space-y-5">
          <input type="hidden" name="next" value={nextPath} />

          <Field label="Correo" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              placeholder="correo@ejemplo.com"
            />
          </Field>

          <div className="-mt-2 text-right">
            <Link
              href={recoveryHref}
              className="text-sm text-white/45 transition hover:text-white"
            >
              Olvidé mi contraseña
            </Link>
          </div>

          <Field label="Contraseña" htmlFor="password">
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputClass}
              placeholder="••••••••"
            />
          </Field>

          {params.error && <p className="text-sm text-red-400">{params.error}</p>}

          <button
            type="submit"
            className="w-full rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85"
          >
            Iniciar sesión
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-white/40">
          ¿Aún no tienes cuenta?{" "}
          <Link
            href={registerHref}
            className="font-medium text-white hover:underline"
          >
            Crear cuenta
          </Link>
        </p>
      </section>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 outline-none transition placeholder:text-white/20 focus:border-white/30";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm text-white/60">
        {label}
      </label>
      {children}
    </div>
  );
}
