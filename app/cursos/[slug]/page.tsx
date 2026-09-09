import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

type CoursePageProps = {
  params: Promise<{ slug: string }>;
};

const getPublishedCourse = cache(async (slug: string) => {
  const supabase = await createClient();

  const { data: course, error } = await supabase
    .from("courses")
    .select(
      "title, slug, short_description, description, cover_image_url, category, level, duration_minutes, instructor, hotmart_url, featured"
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("Error cargando el curso público:", error);
    return null;
  }

  return course;
});

export async function generateMetadata({
  params,
}: CoursePageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublishedCourse(slug);

  if (!course) {
    return {
      title: "Curso no encontrado",
      robots: { index: false, follow: false },
    };
  }

  const description =
    course.short_description ||
    course.description ||
    `Descubre ${course.title} en FILMATTA.`;

  return {
    title: course.title,
    description,
    openGraph: {
      title: course.title,
      description,
      type: "website",
      images: course.cover_image_url
        ? [{ url: course.cover_image_url, alt: course.title }]
        : undefined,
    },
  };
}

export default async function CursoPage({ params }: CoursePageProps) {
  const { slug } = await params;
  const course = await getPublishedCourse(slug);

  if (!course) {
    notFound();
  }

  const details = [
    course.category && { label: "Categoría", value: course.category },
    course.level && { label: "Nivel", value: course.level },
    course.duration_minutes && {
      label: "Duración",
      value: formatDuration(course.duration_minutes),
    },
    course.instructor && { label: "Instructor", value: course.instructor },
  ].filter((detail): detail is { label: string; value: string } =>
    Boolean(detail)
  );

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link
            href="/"
            className="text-xl font-black tracking-[0.25em]"
          >
            FILMATTA
          </Link>

          <Link
            href="/cursos"
            className="text-sm text-white/50 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            ← Todos los cursos
          </Link>
        </div>
      </header>

      <article>
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-12 lg:px-8 lg:pb-28 lg:pt-16">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-white/[0.04]">
            {course.cover_image_url ? (
              <img
                src={course.cover_image_url}
                alt={`Portada de ${course.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-semibold uppercase tracking-[0.35em] text-white/15">
                FILMATTA
              </div>
            )}

            {course.featured && (
              <span className="absolute right-5 top-5 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs font-medium backdrop-blur-sm">
                Destacado
              </span>
            )}
          </div>

          <div className="grid gap-14 pt-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-24 lg:pt-20">
            <div>
              {course.category && (
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
                  {course.category}
                </p>
              )}

              <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
                {course.title}
              </h1>

              {course.short_description && (
                <p className="mt-8 max-w-3xl text-xl leading-8 text-white/60 sm:text-2xl sm:leading-9">
                  {course.short_description}
                </p>
              )}

              {course.description && (
                <div className="mt-14 border-t border-white/10 pt-10">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/35">
                    Sobre el curso
                  </h2>
                  <p className="mt-6 max-w-3xl whitespace-pre-line text-lg leading-8 text-white/60">
                    {course.description}
                  </p>
                </div>
              )}
            </div>

            <aside className="border-t border-white/10 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              {details.length > 0 && (
                <dl className="space-y-7">
                  {details.map((detail) => (
                    <div key={detail.label}>
                      <dt className="text-xs uppercase tracking-[0.2em] text-white/30">
                        {detail.label}
                      </dt>
                      <dd className="mt-2 text-base text-white/75">
                        {detail.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {course.hotmart_url && (
                <a
                  href={course.hotmart_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-10 inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  Acceder al curso
                </a>
              )}
            </aside>
          </div>
        </div>
      </article>
    </main>
  );
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${remainingMinutes} min`;
}
