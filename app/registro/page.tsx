import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "@/app/auth/actions";
import { getViewer } from "@/lib/auth/get-viewer";
import { getSafePostAuthPath } from "@/lib/auth/safe-next-path";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = getSafePostAuthPath(params.next ?? null);
  const viewer = await getViewer();

  if (viewer) {
    redirect(nextPath);
  }

  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

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
          FILMATTA Learn
        </p>

        <h1 className="text-5xl font-semibold tracking-[-0.04em]">
          Crea tu cuenta en FILMATTA
        </h1>

        <p className="mt-4 leading-7 text-white/45">
          Empieza a aprender, guarda tus cursos y construye poco a poco tu
          identidad profesional.
        </p>

        <form action={signUp} className="mt-10 space-y-5">
          <input type="hidden" name="next" value={nextPath} />

          <Field label="Nombre" htmlFor="full_name">
            <input
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              className={inputClass}
              placeholder="Tu nombre"
            />
          </Field>

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

          <Field label="Contraseña" htmlFor="password">
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              className={inputClass}
              placeholder="Mínimo 8 caracteres"
            />
          </Field>

          {params.error && <p className="text-sm text-red-400">{params.error}</p>}

          <button
            type="submit"
            className="w-full rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85"
          >
            Crear cuenta
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-white/40">
          ¿Ya tienes cuenta?{" "}
          <Link
            href={loginHref}
            className="font-medium text-white hover:underline"
          >
            Iniciar sesión
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
