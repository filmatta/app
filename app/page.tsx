import Link from "next/link";
import FilmSetStrip from "@/components/home/FilmSetStrip";
import SiteHeader from "@/components/SiteHeader";
import {
  PAGE_CONTAINER_CLASS_NAME,
  WIDE_PAGE_CONTAINER_CLASS_NAME,
} from "@/lib/page-container";

const ecosystemSteps = [
  ["01", "Profiles"],
  ["02", "Opportunities"],
  ["03", "Learn"],
  ["04", "Locations"],
  ["05", "Business"],
] as const;

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[#080808] text-white">
      <SiteHeader showPrimaryNavigation />

      <section className="relative border-b border-white/10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(255,255,255,0.07),transparent_28%)]" />
        <div
          className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} relative mx-auto flex min-h-[82vh] max-w-[1600px] flex-col justify-center py-20 sm:py-28 lg:py-32`}
        >
          <p className="flex items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-white/45 sm:text-xs">
            <span className="h-px w-8 bg-white/35" />
            Crea · Conecta · Haz que pase
          </p>

          <h1 className="mt-8 max-w-[1200px] text-[clamp(3.4rem,8vw,8.8rem)] font-semibold leading-[0.88] tracking-[-0.065em]">
            El ecosistema de la industria audiovisual.
          </h1>

          <div className="mt-10 grid gap-8 border-t border-white/10 pt-8 lg:grid-cols-12 lg:items-end">
            <p className="max-w-3xl text-lg leading-8 text-white/55 sm:text-xl lg:col-span-7 lg:text-2xl lg:leading-9">
              Crea tu perfil, encuentra oportunidades, aprende y conecta con las
              personas y recursos que hacen posibles los proyectos.
            </p>

            <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
              <Link
                href="/registro"
                className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Únete a FILMATTA <span aria-hidden>→</span>
              </Link>
              <Link
                href="#ecosistema"
                className="inline-flex items-center rounded-full border border-white/15 px-6 py-3.5 text-sm font-semibold text-white/70 transition hover:border-white/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Explorar el ecosistema
              </Link>
            </div>
          </div>

          <ol
            aria-label="Áreas de FILMATTA"
            className="mt-16 grid border-l border-t border-white/10 sm:grid-cols-5 lg:mt-24"
          >
            {ecosystemSteps.map(([number, label]) => (
              <li
                key={label}
                className="flex min-h-20 items-center justify-between gap-4 border-b border-r border-white/10 px-4 py-5 text-xs uppercase tracking-[0.18em] text-white/40 sm:min-h-24 sm:flex-col sm:items-start sm:justify-between"
              >
                <span className="text-white/20">{number}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <FilmSetStrip />

      <div id="ecosistema">
        <section
          aria-labelledby="profiles-heading"
          className="border-b border-emerald-200/10 bg-[#07130d]"
        >
          <div
            className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} mx-auto grid max-w-[1600px] gap-14 py-20 sm:py-28 lg:min-h-[760px] lg:grid-cols-12 lg:items-center lg:py-32`}
          >
            <div className="lg:col-span-5">
              <SectionLabel
                number="01"
                product="FILMATTA Profiles"
                color="text-emerald-300"
              />
              <h2
                id="profiles-heading"
                className="mt-7 max-w-2xl text-5xl font-semibold leading-[0.94] tracking-[-0.05em] sm:text-7xl"
              >
                Muestra lo que sabes hacer.
              </h2>
              <p className="mt-7 max-w-xl text-lg leading-8 text-white/55">
                Crea un perfil profesional con tu book, demo reel, experiencia y
                habilidades. Preséntate de una forma clara y atractiva y
                encuentra nuevas oportunidades en proyectos audiovisuales en
                México.
              </p>
              <PrimaryLink
                href="/perfiles"
                colorClass="bg-emerald-300 text-[#06100a] hover:bg-emerald-200 focus-visible:outline-emerald-200"
              >
                Crear mi perfil
              </PrimaryLink>
            </div>

            <div className="lg:col-span-7 lg:pl-10">
              <div className="relative min-h-[430px] overflow-hidden border border-emerald-200/15 bg-[#0b1b12] p-5 sm:min-h-[520px] sm:p-8">
                <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-emerald-200/15" />
                <div className="absolute -right-4 -top-8 h-44 w-44 rounded-full bg-emerald-300/10" />
                <div className="relative flex h-full min-h-[390px] flex-col justify-between sm:min-h-[456px]">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-300 text-lg font-black text-[#07130d]">
                        F
                      </div>
                      <div>
                        <p className="text-lg font-semibold">
                          Tu perfil profesional
                        </p>
                        <p className="mt-1 text-sm text-emerald-100/45">
                          México · Industria audiovisual
                        </p>
                      </div>
                    </div>
                    <span className="text-xs uppercase tracking-[0.25em] text-emerald-200/40">
                      Profiles
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="border border-emerald-100/10 bg-black/15 p-5 sm:row-span-2 sm:min-h-64">
                      <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/35">
                        Demo reel
                      </p>
                      <div className="mt-12 flex aspect-video items-center justify-center border border-emerald-100/10 bg-emerald-50/[0.03]">
                        <span
                          className="grid h-14 w-14 place-items-center rounded-full border border-emerald-100/25 text-emerald-100/70"
                          aria-hidden
                        >
                          ▶
                        </span>
                      </div>
                    </div>
                    <ProfileMetric label="Book" value="Selección visual" />
                    <ProfileMetric
                      label="Experiencia"
                      value="Créditos y proyectos"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-6">
                    {[
                      "Habilidades",
                      "Disponibilidad",
                      "Experiencia",
                      "Contacto",
                    ].map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-emerald-100/15 px-3 py-1.5 text-xs text-emerald-100/50"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="opportunities-heading"
          className="border-b border-blue-200/10 bg-[#07111f]"
        >
          <div
            className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} mx-auto grid max-w-[1600px] gap-14 py-20 sm:py-28 lg:min-h-[760px] lg:grid-cols-12 lg:items-center lg:py-32`}
          >
            <div className="order-2 lg:order-1 lg:col-span-7 lg:pr-10">
              <div className="border border-blue-200/15 bg-[#0a1729] p-5 sm:p-8">
                <div className="flex items-center justify-between border-b border-blue-100/10 pb-5">
                  <p className="text-xs uppercase tracking-[0.24em] text-blue-200/45">
                    Lo que podrás encontrar
                  </p>
                  <span className="h-2 w-2 rounded-full bg-blue-300 shadow-[0_0_18px_rgba(147,197,253,0.7)]" />
                </div>
                <div>
                  <OpportunityRow
                    type="Casting"
                    title="Roles frente a cámara"
                    meta="Convocatorias para talento"
                  />
                  <OpportunityRow
                    type="Crew"
                    title="Equipos de producción"
                    meta="Llamados por disciplina"
                  />
                  <OpportunityRow
                    type="Prácticas"
                    title="Experiencia en la industria"
                    meta="Espacios para empezar y crecer"
                  />
                  <OpportunityRow
                    type="Colaboración"
                    title="Proyectos independientes"
                    meta="Personas que quieren crear juntas"
                  />
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2 lg:col-span-5">
              <SectionLabel
                number="02"
                product="FILMATTA Opportunities"
                color="text-blue-300"
              />
              <h2
                id="opportunities-heading"
                className="mt-7 max-w-2xl text-5xl font-semibold leading-[0.94] tracking-[-0.05em] sm:text-7xl"
              >
                Encuentra tu próximo proyecto.
              </h2>
              <p className="mt-7 max-w-xl text-lg leading-8 text-white/55">
                Publica o descubre castings, llamados de crew, colaboraciones,
                prácticas y oportunidades para participar en producciones
                audiovisuales en México.
              </p>
              <PrimaryLink
                href="/oportunidades"
                colorClass="bg-blue-300 text-[#06101d] hover:bg-blue-200 focus-visible:outline-blue-200"
              >
                Explorar oportunidades
              </PrimaryLink>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="learn-heading"
          className="border-b border-white/10 bg-[#0b0b0b]"
        >
          <div
            className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} mx-auto max-w-[1600px] py-20 sm:py-28 lg:py-32`}
          >
            <div className="grid gap-12 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-7">
                <SectionLabel
                  number="03"
                  product="FILMATTA Learn"
                  color="text-white/55"
                />
                <h2
                  id="learn-heading"
                  className="mt-7 text-5xl font-semibold leading-[0.94] tracking-[-0.05em] sm:text-7xl"
                >
                  Aprende haciendo.
                </h2>
              </div>
              <div className="lg:col-span-5">
                <p className="max-w-xl text-lg leading-8 text-white/55">
                  Cursos prácticos para desarrollar habilidades de producción
                  audiovisual, cinematografía, edición, sonido y más.
                </p>
                <PrimaryLink
                  href="/cursos"
                  colorClass="bg-white text-black hover:bg-white/85 focus-visible:outline-white"
                >
                  Explorar cursos
                </PrimaryLink>
              </div>
            </div>

            <div className="mt-16 grid border-l border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["01", "Producción"],
                ["02", "Cinematografía"],
                ["03", "Edición"],
                ["04", "Sonido"],
              ].map(([number, title]) => (
                <div
                  key={title}
                  className="min-h-52 border-b border-r border-white/10 p-6 sm:min-h-64 sm:p-8"
                >
                  <p className="text-xs tracking-[0.22em] text-white/20">
                    {number}
                  </p>
                  <p className="mt-24 text-2xl font-medium tracking-[-0.03em] text-white/75 sm:mt-32">
                    {title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="locations-heading"
          className="relative border-b border-orange-100/15 bg-[#7a382d]"
        >
          <div className="absolute inset-y-0 right-0 hidden w-[44%] border-l border-orange-100/15 bg-[#2a1714] lg:block" />
          <div
            className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} relative mx-auto grid max-w-[1600px] gap-14 py-20 sm:py-28 lg:min-h-[760px] lg:grid-cols-12 lg:items-center lg:py-32`}
          >
            <div className="lg:col-span-6">
              <SectionLabel
                number="04"
                product="FILMATTA Locations"
                color="text-orange-100/75"
              />
              <h2
                id="locations-heading"
                className="mt-7 max-w-3xl text-5xl font-semibold leading-[0.94] tracking-[-0.05em] sm:text-7xl"
              >
                Encuentra dónde hacer realidad tu producción.
              </h2>
              <p className="mt-7 max-w-xl text-lg leading-8 text-orange-50/70">
                Descubre casas, estudios, foros, oficinas, exteriores y espacios
                disponibles para proyectos audiovisuales.
              </p>
              <ComingSoon light />
            </div>

            <div className="lg:col-span-6 lg:pl-12">
              <div className="relative aspect-[4/3] overflow-hidden border border-orange-100/20 bg-[#1b1110]">
                <div className="absolute inset-x-0 top-[18%] h-px bg-orange-100/15" />
                <div className="absolute bottom-0 left-[16%] top-0 w-px bg-orange-100/15" />
                <div className="absolute bottom-0 left-[65%] top-[18%] w-px bg-orange-100/15" />
                <div className="absolute bottom-[17%] left-0 right-[35%] h-px bg-orange-100/15" />
                <div className="absolute left-[24%] top-[31%] h-[45%] w-[32%] bg-[#9a4b3d] shadow-[0_22px_70px_rgba(0,0,0,0.35)]" />
                <div className="absolute left-[30%] top-[39%] h-[37%] w-[20%] bg-orange-100/15" />
                <div className="absolute bottom-6 left-6 text-xs uppercase tracking-[0.25em] text-orange-100/45">
                  Espacios para contar historias
                </div>
                <div className="absolute right-5 top-5 rounded-full border border-orange-100/20 px-3 py-1.5 text-xs text-orange-100/60">
                  México
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="business-heading"
          className="border-b border-amber-200/15 bg-[#211708]"
        >
          <div
            className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} mx-auto grid max-w-[1600px] gap-14 py-20 sm:py-28 lg:min-h-[760px] lg:grid-cols-12 lg:items-center lg:py-32`}
          >
            <div className="lg:col-span-5">
              <SectionLabel
                number="05"
                product="FILMATTA Business"
                color="text-amber-300"
              />
              <h2
                id="business-heading"
                className="mt-7 max-w-2xl text-5xl font-semibold leading-[0.94] tracking-[-0.05em] sm:text-7xl"
              >
                Organiza tu producción desde un solo lugar.
              </h2>
              <p className="mt-7 max-w-xl text-lg leading-8 text-amber-50/60">
                Crea proyectos, reúne a tu equipo, encuentra profesionales y
                locaciones, publica castings, llamados y oportunidades y gestiona
                los recursos de tu producción.
              </p>
              <ComingSoon />
            </div>

            <div className="lg:col-span-7 lg:pl-10">
              <div className="border border-amber-200/15 bg-[#171006] p-6 sm:p-10">
                <div className="flex items-center justify-between border-b border-amber-100/10 pb-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-200/40">
                      Producción
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      Todo el proyecto, conectado.
                    </p>
                  </div>
                  <span
                    className="hidden text-4xl text-amber-300 sm:block"
                    aria-hidden
                  >
                    ✦
                  </span>
                </div>
                <div className="grid sm:grid-cols-2">
                  {[
                    ["01", "Proyecto y equipo"],
                    ["02", "Talent Finder"],
                    ["03", "Castings y llamados"],
                    ["04", "Locaciones y recursos"],
                  ].map(([number, title], index) => (
                    <div
                      key={title}
                      className={`min-h-36 border-amber-100/10 p-5 sm:min-h-44 sm:p-6 ${
                        index % 2 === 0 ? "sm:border-r" : ""
                      } ${index < 2 ? "border-b" : ""}`}
                    >
                      <p className="text-xs tracking-[0.22em] text-amber-200/25">
                        {number}
                      </p>
                      <p className="mt-12 text-lg text-amber-50/70">{title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="border-b border-white/10 bg-[#080808]">
        <div
          className={`${PAGE_CONTAINER_CLASS_NAME} py-24 text-center sm:py-32`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
            Tu lugar en la industria
          </p>
          <h2 className="mx-auto mt-6 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] sm:text-7xl">
            Haz que tu próximo proyecto empiece aquí.
          </h2>
          <Link
            href="/registro"
            className="mt-10 inline-flex items-center gap-3 rounded-full bg-white px-7 py-4 font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Crear mi cuenta <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      <footer>
        <div
          className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} mx-auto flex max-w-[1600px] flex-col justify-between gap-6 py-10 text-sm text-white/35 sm:flex-row`}
        >
          <span className="font-bold tracking-[0.2em] text-white">
            FILMATTA
          </span>
          <span>© 2026 FILMATTA</span>
        </div>
      </footer>
    </main>
  );
}

function SectionLabel({
  number,
  product,
  color,
}: {
  number: string;
  product: string;
  color: string;
}) {
  return (
    <div
      className={`flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.25em] ${color}`}
    >
      <span className="opacity-45">{number}</span>
      <span className="h-px w-8 bg-current opacity-35" />
      <span>{product}</span>
    </div>
  );
}

function PrimaryLink({
  href,
  colorClass,
  children,
}: {
  href: string;
  colorClass: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`mt-9 inline-flex items-center gap-3 rounded-full px-6 py-3.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4 ${colorClass}`}
    >
      {children} <span aria-hidden>→</span>
    </Link>
  );
}

function ComingSoon({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`mt-9 inline-flex rounded-full border px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] ${
        light
          ? "border-orange-100/25 text-orange-50/75"
          : "border-amber-200/20 text-amber-200/65"
      }`}
    >
      Próximamente
    </span>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-emerald-100/10 bg-black/15 p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/35">
        {label}
      </p>
      <p className="mt-8 text-lg text-emerald-50/70">{value}</p>
    </div>
  );
}

function OpportunityRow({
  type,
  title,
  meta,
}: {
  type: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="grid gap-4 border-b border-blue-100/10 py-6 last:border-b-0 sm:grid-cols-[8rem_1fr_auto] sm:items-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/70">
        {type}
      </p>
      <div>
        <p className="text-lg font-medium text-white/80">{title}</p>
        <p className="mt-1 text-sm text-blue-100/35">{meta}</p>
      </div>
      <span className="hidden text-blue-200/30 sm:block" aria-hidden>
        ↗
      </span>
    </div>
  );
}
