import Link from "next/link";

export default function Page() {
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

      <section className="mx-auto flex min-h-[80vh] max-w-7xl flex-col justify-center px-6 py-24 lg:px-8">
        <p className="mb-6 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          FILMATTA
        </p>

        <h1 className="max-w-5xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          Únete a FILMATTA
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-8 text-white/50">
          Crea tu perfil y empieza a formar parte de la comunidad.
        </p>

        <div className="mt-12 border-t border-white/10 pt-8 text-sm text-white/30">
          Próximamente.
        </div>
      </section>
    </main>
  );
}
