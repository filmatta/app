import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
const concepts = {
  writer: {
    name: "FILMATTA Writer",
    title: "Escribe tu historia. Mira más allá de las páginas.",
    description:
      "Estamos construyendo un espacio para escribir, importar y revisar guiones, entender su estructura y conectar sus necesidades de producción. La creatividad sigue siendo tuya.",
    sections: [
      [
        "Tu guion, con estructura.",
        "La dirección de producto parte de un espacio de escritura que ayude a ordenar escenas y seguir el desarrollo del relato.",
      ],
      [
        "Escenas y personajes a la vista.",
        "Buscamos dar claridad a la información del guion y a las relaciones que sostienen una historia.",
      ],
      [
        "Asistencia que acompaña, no sustituye.",
        "La visión es ofrecer apoyo a la revisión y la continuidad. Las decisiones creativas y la autoría siguen siendo tuyas.",
      ],
    ],
    steps: [
      "Escribir con claridad.",
      "Revisar con contexto.",
      "Comprender lo que necesita la historia.",
    ],
    connection: "De las páginas al equipo.",
    connectionText:
      "Un guion también plantea necesidades de talento y espacios. Explora hoy los perfiles audiovisuales de FILMATTA.",
    href: "/perfiles",
    link: "Explorar profesionales",
    note: "Esta página presenta la dirección del producto. El editor, la importación, la exportación y el análisis asistido todavía no están disponibles.",
  },
  "production-assistant": {
    name: "Production Assistant",
    title: "De la idea a una producción organizada.",
    description:
      "Una herramienta en desarrollo para relacionar escenas, equipo, talento, locaciones y pendientes sin perder el contexto del proyecto.",
    sections: [
      [
        "Identifica lo que necesita tu producción.",
        "La visión parte de reunir las necesidades de cada escena con información comprensible para el equipo.",
      ],
      [
        "Relaciona personas y recursos.",
        "Queremos conectar el contexto de una producción con sus disciplinas, espacios y servicios.",
      ],
      [
        "Mantén a la vista lo que falta.",
        "El objetivo es ayudar a reconocer decisiones pendientes sin perder el panorama del proyecto.",
      ],
    ],
    steps: [
      "Entender las necesidades.",
      "Relacionar los recursos.",
      "Revisar lo que sigue pendiente.",
    ],
    connection: "Los recursos ya tienen un lugar.",
    connectionText:
      "Mientras construimos esta herramienta, puedes explorar espacios publicados y evaluar sus condiciones para tu rodaje.",
    href: "/locaciones",
    link: "Explorar locaciones",
    note: "Esta página presenta una visión en desarrollo. No ofrece planificación automática, presupuestos inteligentes, call sheets ni gestión operativa de proyectos.",
  },
} as const;
export default function ProductVision({
  product,
}: {
  product: keyof typeof concepts;
}) {
  const c = concepts[product];
  const writer = product === "writer";
  return (
    <div className="editorial-page">
      <SiteHeader contextLink={{ href: "/tools", label: "← Tools" }} />
      <main>
        <section className="editorial-container grid gap-12 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">Tools / {c.name}</p>
            <p className="mt-5 inline-block border border-[#BFC0D7]/40 px-3 py-2 text-xs uppercase tracking-widest text-[#BFC0D7]">
              En desarrollo
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              {c.title}
            </h1>
            <p className="mt-7 text-lg leading-8 text-white/70">
              {c.description}
            </p>
            <a className="editorial-secondary mt-7" href="#vision">
              Conocer {c.name} ↓
            </a>
          </div>
          {writer ? (
            <div className="border-y border-white/20 py-8">
              <p className="text-xs uppercase tracking-widest text-[#BFC0D7]">
                Orden / Claridad / Autoría
              </p>
              <div className="my-10 space-y-8 border-l border-white/20 pl-7">
                {["Una escena.", "Una decisión.", "Tu historia."].map(
                  (line, i) => (
                    <p
                      key={line}
                      className="text-3xl tracking-tight sm:text-5xl"
                    >
                      <span className="mr-4 align-middle text-xs text-white/50">
                        0{i + 1}
                      </span>
                      {line}
                    </p>
                  ),
                )}
              </div>
              <p className="text-sm leading-7 text-white/65">
                Una dirección de producto para acompañar el proceso de
                escritura.
              </p>
            </div>
          ) : (
            <figure>
              <Image
                src="/images/editorial/monitor.webp"
                width={1800}
                height={1200}
                alt="Equipo revisando una escena en un monitor de rodaje"
                className="aspect-[4/3] w-full object-cover"
                sizes="(min-width:1024px) 50vw, 100vw"
              />
              <figcaption className="mt-4 text-xs leading-6 text-white/60">
                El contexto de la producción, siempre a la vista. Fotografía
                editorial de cottonbro studio / Pexels.
              </figcaption>
            </figure>
          )}
          <p className="border-l-2 border-[#BFC0D7] pl-5 text-sm leading-7 text-white/70 lg:col-span-2">
            {c.note}
          </p>
        </section>
        <section
          id="vision"
          className="editorial-container grid gap-9 border-t border-white/15 py-12 md:grid-cols-3"
        >
          {c.sections.map(([title, description], i) => (
            <article key={title}>
              <p className="eyebrow">0{i + 1}</p>
              <h2 className="mt-5 text-2xl leading-tight">{title}</h2>
              <p className="mt-5 leading-8 text-white/65">{description}</p>
            </article>
          ))}
        </section>
        <section className="editorial-container grid gap-10 border-t border-white/15 py-12 md:grid-cols-2">
          <div>
            <p className="eyebrow">Cómo queremos acompañarte</p>
            <h2 className="mt-5 text-3xl">Un proceso con continuidad.</h2>
          </div>
          <ol className="space-y-5">
            {c.steps.map((step, i) => (
              <li className="border-b border-white/15 pb-5 text-xl" key={step}>
                <span className="mr-5 text-sm text-[#BFC0D7]">0{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>
        <section className="editorial-connection">
          <div className="editorial-container">
            <h2>{c.connection}</h2>
            <p>{c.connectionText}</p>
            <Link className="editorial-secondary" href={c.href}>
              {c.link} ↗
            </Link>
          </div>
        </section>
        <section className="editorial-container py-16">
          <p className="eyebrow">Herramientas que puedes usar hoy</p>
          <h2 className="mt-5 text-4xl">Un cálculo menos pendiente.</h2>
          <Link className="editorial-primary mt-7" href="/tools/utilidades">
            Ver utilidades disponibles →
          </Link>
        </section>
      </main>
    </div>
  );
}
