import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { createClient } from "@/lib/supabase/server";

export default async function CursosPage() {
  const supabase = await createClient();

  const { data: courses, error } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/", label: "← Volver" }} />

      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Aprende
        </p>

        <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          Cursos para llevar tus ideas a la pantalla.
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-8 text-white/50">
          Aprende producción audiovisual con conocimientos diseñados para
          llevarse directamente a proyectos reales.
        </p>

        {error && (
          <div className="mt-12 rounded-xl border border-red-500/30 p-6 text-red-300">
            Error cargando cursos: {error.message}
          </div>
        )}

        <div className="mt-20 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses?.map((course) => (
            <Link
              key={course.id}
              href={`/cursos/${course.slug}`}
              className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] transition duration-300 hover:-translate-y-1 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <div className="relative aspect-video overflow-hidden bg-white/[0.04]">
                {course.cover_image_url ? (
                  <img
                    src={course.cover_image_url}
                    alt={course.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.25em] text-white/15">
                    FILMATTA
                  </div>
                )}

                {course.featured && (
                  <span className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs backdrop-blur">
                    Destacado
                  </span>
                )}
              </div>

              <div className="flex min-h-[300px] flex-col p-7">
                <span className="text-xs uppercase tracking-[0.2em] text-white/35">
                  {course.category}
                </span>

                <div className="mt-auto">
                  <div className="mb-4 flex gap-3 text-xs text-white/35">
                    {course.level && <span>{course.level}</span>}

                    {course.duration_minutes && (
                      <>
                        <span>•</span>
                        <span>
                          {Math.round(course.duration_minutes / 60)} h
                        </span>
                      </>
                    )}
                  </div>

                  <h2 className="text-3xl font-semibold tracking-tight">
                    {course.title}
                  </h2>

                  <p className="mt-4 line-clamp-3 leading-7 text-white/45">
                    {course.short_description}
                  </p>

                  <span className="mt-8 inline-block text-sm font-semibold text-white/70 transition group-hover:text-white">
                    Ver curso →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {!error && courses?.length === 0 && (
          <p className="mt-16 text-white/40">
            Todavía no hay cursos publicados.
          </p>
        )}
      </section>
    </main>
  );
}
