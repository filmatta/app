import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import DeleteCourseButton from "./DeleteCourseButton";

export default async function AdminCursosPage() {
  const { supabase } = await requireAdmin();

  const { data: courses, error } = await supabase
    .from("courses")
    .select("*")
    .order("sort_order", { ascending: true });

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link
            href="/admin"
            className="text-xl font-black tracking-[0.25em]"
          >
            FILMATTA
          </Link>

          <span className="text-xs uppercase tracking-[0.2em] text-white/35">
            CMS
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
              Administración
            </p>

            <h1 className="text-5xl font-semibold tracking-[-0.04em]">
              Cursos
            </h1>

            <p className="mt-4 text-white/45">
              Administra el catálogo de FILMATTA.
            </p>
          </div>

          <Link
            href="/admin/cursos/nuevo"
            className="w-fit rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-white/85"
          >
            + Nuevo curso
          </Link>
        </div>

        {error && (
          <div className="mt-10 rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-red-300">
            Error cargando cursos: {error.message}
          </div>
        )}

        <div className="mt-14 overflow-hidden rounded-2xl border border-white/10">
          {courses?.map((course) => (
            <div
              key={course.id}
              className="flex flex-col gap-6 border-b border-white/10 p-6 last:border-b-0 md:flex-row md:items-center"
            >
              {/* PORTADA */}
              <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-white/[0.04] md:w-40">
                {course.cover_image_url ? (
                  <img
                    src={course.cover_image_url}
                    alt={course.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-white/15">
                    FILMATTA
                  </div>
                )}
              </div>

              {/* INFO */}
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">
                    {course.title}
                  </h2>

                  <span
                    className={`rounded-full px-3 py-1 text-xs ${
                      course.status === "published"
                        ? "bg-green-500/10 text-green-300"
                        : course.status === "archived"
                          ? "bg-orange-500/10 text-orange-300"
                          : "bg-white/5 text-white/40"
                    }`}
                  >
                    {course.status === "published"
                      ? "Publicado"
                      : course.status === "archived"
                        ? "Archivado"
                        : "Borrador"}
                  </span>

                  {course.featured && (
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40">
                      Destacado
                    </span>
                  )}
                </div>

                <p className="text-sm text-white/35">
                  /cursos/{course.slug}
                </p>

                {course.category && (
                  <p className="mt-2 text-sm text-white/30">
                    {course.category}
                    {course.level ? ` · ${course.level}` : ""}
                  </p>
                )}
              </div>

              {/* ACCIONES */}
              <div className="flex items-center gap-3">
                <Link
                  href={`/admin/cursos/${course.id}`}
                  className="rounded-full border border-white/15 px-5 py-2 text-sm transition hover:bg-white/10"
                >
                  Editar
                </Link>

                <DeleteCourseButton
                  id={course.id}
                  title={course.title}
                />
              </div>
            </div>
          ))}

          {!courses?.length && !error && (
            <div className="p-10 text-white/40">
              Todavía no hay cursos.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}