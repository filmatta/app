import Link from "next/link";

import {
  PAGE_CONTAINER_CLASS_NAME,
  WIDE_PAGE_CONTAINER_CLASS_NAME,
} from "@/lib/page-container";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div
          className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} flex items-center justify-between py-5`}
        >
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

      <section
        className={`${PAGE_CONTAINER_CLASS_NAME} flex min-h-[80vh] flex-col justify-center py-24`}
      >
        <p className="mb-6 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          FILMATTA
        </p>

        <h1 className="max-w-5xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          Oportunidades
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-8 text-white/50">
          Encuentra proyectos, convocatorias, trabajos y colaboraciones.
        </p>

        <div className="mt-12 border-t border-white/10 pt-8 text-sm text-white/30">
          Próximamente.
        </div>
      </section>
    </main>
  );
}
