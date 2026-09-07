import Link from "next/link";

const features = [
  {
    number: "01",
    title: "Aprende",
    description:
      "Cursos creados para el mundo audiovisual real: cámara, iluminación, edición, producción, cine y contenido.",
    href: "/cursos",
    label: "Explorar cursos",
  },
  {
    number: "02",
    title: "Conecta",
    description:
      "Encuentra directores, fotógrafos, editores, músicos, productores y otros profesionales creativos.",
    href: "/comunidad",
    label: "Explorar comunidad",
  },
  {
    number: "03",
    title: "Trabaja",
    description:
      "Descubre proyectos, colaboraciones, convocatorias y oportunidades dentro de la industria audiovisual.",
    href: "/oportunidades",
    label: "Ver oportunidades",
  },
  {
    number: "04",
    title: "Muéstrate",
    description:
      "Construye un perfil profesional donde tu trabajo, experiencia y especialidades hablen por ti.",
    href: "/perfiles",
    label: "Ver perfiles",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      {/* NAVBAR */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link
            href="/"
            className="text-xl font-black tracking-[0.25em]"
          >
            FILMATTA
          </Link>

          <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            <Link href="/cursos" className="transition hover:text-white">
              Cursos
            </Link>
            <Link href="/comunidad" className="transition hover:text-white">
              Comunidad
            </Link>
            <Link
              href="/oportunidades"
              className="transition hover:text-white"
            >
              Oportunidades
            </Link>
            <Link href="/perfiles" className="transition hover:text-white">
              Profesionales
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden px-4 py-2 text-sm text-white/70 transition hover:text-white sm:block"
            >
              Entrar
            </Link>

            <Link
              href="/registro"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto flex min-h-[78vh] max-w-7xl flex-col justify-center px-6 py-24 lg:px-8">
        <div className="mb-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
          <span className="h-px w-10 bg-white/30" />
          Plataforma audiovisual
        </div>

        <h1 className="max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-7xl lg:text-8xl">
          Aprende.
          <br />
          Conecta.
          <br />
          <span className="text-white/35">Haz que suceda.</span>
        </h1>

        <div className="mt-10 flex max-w-3xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-xl text-lg leading-8 text-white/55">
            FILMATTA reúne educación, profesionales y oportunidades en un solo
            lugar para quienes hacen cine, video, música y contenido
            audiovisual.
          </p>

          <Link
            href="/registro"
            className="inline-flex w-fit items-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black transition hover:scale-[1.02]"
          >
            Únete a FILMATTA
            <span>→</span>
          </Link>
        </div>
      </section>

      {/* FEATURES */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
          <div className="mb-16">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
              Todo en un mismo lugar
            </p>

            <h2 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Una plataforma hecha para la industria creativa.
            </h2>
          </div>

          <div className="grid border-l border-t border-white/10 md:grid-cols-2">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="group min-h-[330px] border-b border-r border-white/10 p-8 transition hover:bg-white/[0.04] sm:p-10"
              >
                <div className="flex h-full flex-col">
                  <span className="mb-16 text-xs tracking-[0.25em] text-white/30">
                    {feature.number}
                  </span>

                  <h3 className="mb-4 text-3xl font-semibold">
                    {feature.title}
                  </h3>

                  <p className="max-w-md leading-7 text-white/50">
                    {feature.description}
                  </p>

                  <Link
                    href={feature.href}
                    className="mt-auto pt-10 text-sm font-semibold text-white/80 transition group-hover:text-white"
                  >
                    {feature.label} →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl gap-16 px-6 py-28 lg:grid-cols-2 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
              FILMATTA
            </p>
          </div>

          <div>
            <p className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              No necesitas otra red social.
              <span className="text-white/35">
                {" "}
                Necesitas un lugar donde aprender, encontrar a la gente correcta
                y construir proyectos.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-28 text-center lg:px-8">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
            Tu siguiente proyecto puede empezar aquí
          </p>

          <h2 className="mx-auto max-w-4xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
            Crea. Aprende.
            <br />
            Encuentra a tu gente.
          </h2>

          <Link
            href="/registro"
            className="mt-10 inline-flex rounded-full bg-white px-8 py-4 font-semibold text-black transition hover:scale-[1.02]"
          >
            Crear mi perfil
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 px-6 py-10 text-sm text-white/35 sm:flex-row lg:px-8">
          <span className="font-bold tracking-[0.2em] text-white">
            FILMATTA
          </span>

          <span>© 2026 FILMATTA</span>
        </div>
      </footer>
    </main>
  );
}