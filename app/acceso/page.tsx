import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { getSafePostAuthPath } from "@/lib/auth/safe-next-path";

type AccessPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  const params = await searchParams;
  const nextPath = getSafePostAuthPath(params.next ?? null, "/cuenta");
  const viewer = await getViewer();

  if (viewer) {
    redirect(nextPath);
  }

  const encodedNextPath = encodeURIComponent(nextPath);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080808] px-6 py-12 text-white">
      <div className="w-full max-w-xl">
        <Link
          href="/"
          className="mx-auto block w-fit text-xl font-black tracking-[0.25em]"
        >
          FILMATTA
        </Link>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-7 shadow-2xl shadow-black/30 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/35">
            FILMATTA Learn
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Accede para continuar
          </h1>
          <p className="mt-4 max-w-lg leading-7 text-white/50">
            Necesitas una cuenta FILMATTA. Después podrás inscribirte al curso y
            acceder al contenido disponible.
          </p>

          <div className="mt-9 grid gap-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6">
              <p className="font-medium text-white/80">¿Ya tienes cuenta?</p>
              <Link
                href={`/login?next=${encodedNextPath}`}
                className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Iniciar sesión
              </Link>
            </div>

            <div className="rounded-xl border border-white/10 p-5 sm:p-6">
              <p className="font-medium text-white/80">
                ¿Eres nuevo en FILMATTA?
              </p>
              <Link
                href={`/registro?next=${encodedNextPath}`}
                className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-white/15 px-6 py-3.5 text-sm font-semibold text-white/75 transition hover:border-white/25 hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Crear cuenta
              </Link>
            </div>
          </div>
        </section>

        <Link
          href="/cursos"
          className="mx-auto mt-6 block w-fit text-sm text-white/40 transition hover:text-white"
        >
          ← Volver a Aprender
        </Link>
      </div>
    </main>
  );
}
