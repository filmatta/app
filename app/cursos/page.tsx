import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import {
  getLearnContentType,
  type LearnContentType,
} from "@/lib/learn/content-type";
import { createClient } from "@/lib/supabase/server";

type CatalogContent = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  cover_image_url: string | null;
  category: string | null;
  level: string | null;
  duration_minutes: number | null;
  featured: boolean;
  content_type?: unknown;
};

export default async function CursosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published")
    .order("sort_order", { ascending: true });
  const publishedContent = (data ?? []) as CatalogContent[];
  const courses = publishedContent.filter(
    (item) => getLearnContentType(item) === "course"
  );
  const quickGuides = publishedContent.filter(
    (item) => getLearnContentType(item) === "quick_guide"
  );

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/", label: "← Volver" }} />

      <section className="mx-auto max-w-7xl px-6 pb-20 pt-20 lg:px-8 lg:pb-28 lg:pt-24">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          FILMATTA Learn
        </p>
        <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          Aprender
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-white/50">
          Desarrolla habilidades prácticas para el audiovisual, la creatividad
          y tu carrera profesional con contenido pensado para aplicar en el
          trabajo real.
        </p>

        <nav
          aria-label="Contenido para aprender"
          className="mt-9 flex flex-wrap gap-3"
        >
          <SectionLink href="#cursos">Cursos</SectionLink>
          <SectionLink href="#guias-rapidas">Guías rápidas</SectionLink>
        </nav>
      </section>

      <CatalogSection
        id="cursos"
        headingId="courses-heading"
        eyebrow="Formación estructurada"
        title="Cursos"
        description="Recorre módulos y lecciones diseñados para desarrollar una habilidad completa paso a paso."
      >
        {error ? (
          <CatalogError />
        ) : courses.length > 0 ? (
          <ContentGrid>
            {courses.map((item) => (
              <ContentCard key={item.id} item={item} contentType="course" />
            ))}
          </ContentGrid>
        ) : (
          <EmptyRow>Todavía no hay cursos publicados.</EmptyRow>
        )}
      </CatalogSection>

      <CatalogSection
        id="guias-rapidas"
        headingId="quick-guides-heading"
        eyebrow="Soluciones concretas · 10–40 minutos"
        title="Guías rápidas"
        description="Tutoriales breves y específicos para resolver una necesidad concreta de tu trabajo creativo o profesional."
      >
        {error ? null : quickGuides.length > 0 ? (
          <ContentGrid>
            {quickGuides.map((item) => (
              <ContentCard
                key={item.id}
                item={item}
                contentType="quick_guide"
              />
            ))}
          </ContentGrid>
        ) : (
          <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] px-7 py-12 sm:px-10 sm:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/30">
              Próximamente
            </p>
            <p className="mt-4 max-w-2xl text-xl leading-8 text-white/65 sm:text-2xl">
              Estamos preparando guías rápidas para resolver tareas concretas
              en pocos minutos.
            </p>
          </div>
        )}
      </CatalogSection>
    </main>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.06] hover:text-white"
    >
      {children}
    </Link>
  );
}

function CatalogSection({
  id,
  headingId,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  headingId: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-8 border-t border-white/10"
    >
      <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/30">
            {eyebrow}
          </p>
          <h2
            id={headingId}
            className="mt-4 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl"
          >
            {title}
          </h2>
          <p className="mt-4 leading-7 text-white/45">{description}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function ContentGrid({ children }: { children: React.ReactNode }) {
  return <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function ContentCard({
  item,
  contentType,
}: {
  item: CatalogContent;
  contentType: LearnContentType;
}) {
  const isQuickGuide = contentType === "quick_guide";

  return (
    <Link
      href={`/cursos/${item.slug}`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] transition duration-300 hover:-translate-y-1 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      <div className="relative aspect-video overflow-hidden bg-white/[0.04]">
        {item.cover_image_url ? (
          <img
            src={item.cover_image_url}
            alt={item.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.25em] text-white/15">
            FILMATTA
          </div>
        )}

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {isQuickGuide && (
            <span className="rounded-full border border-blue-300/20 bg-black/65 px-3 py-1 text-xs text-blue-100 backdrop-blur">
              Guía rápida
            </span>
          )}
        </div>
        {item.featured && (
          <span className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs backdrop-blur">
            Destacado
          </span>
        )}
      </div>

      <div className="flex min-h-[300px] flex-col p-7">
        <span className="text-xs uppercase tracking-[0.2em] text-white/35">
          {item.category}
        </span>
        <div className="mt-auto">
          <div className="mb-4 flex gap-3 text-xs text-white/35">
            {item.level && <span>{item.level}</span>}
            {item.duration_minutes && (
              <>
                {item.level && <span>•</span>}
                <span>{formatDuration(item.duration_minutes)}</span>
              </>
            )}
          </div>
          <h3 className="text-3xl font-semibold tracking-tight">{item.title}</h3>
          <p className="mt-4 line-clamp-3 leading-7 text-white/45">
            {item.short_description}
          </p>
          <span className="mt-8 inline-block text-sm font-semibold text-white/70 transition group-hover:text-white">
            Ver {isQuickGuide ? "guía" : "curso"} →
          </span>
        </div>
      </div>
    </Link>
  );
}

function CatalogError() {
  return (
    <div className="mt-12 rounded-xl border border-red-500/30 p-6 text-red-300">
      No pudimos cargar el contenido de Aprender en este momento.
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="mt-12 border-y border-white/10 py-10 text-white/40">{children}</p>;
}

function formatDuration(minutes: number) {
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}
