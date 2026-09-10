import Link from "next/link";
import AdminHeader from "@/app/admin/AdminHeader";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getLearnContentType,
  getLearnContentTypeLabel,
  type LearnContentType,
} from "@/lib/learn/content-type";
import DeleteCourseButton from "./DeleteCourseButton";

type ContentFilter = "all" | LearnContentType;

export default async function AdminCursosPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const [{ supabase }, params] = await Promise.all([requireAdmin(), searchParams]);
  const activeFilter = getContentFilter(params.type);
  const { data: content, error } = await supabase
    .from("courses")
    .select("*")
    .order("sort_order", { ascending: true });
  const filteredContent = (content ?? []).filter((item) => {
    return activeFilter === "all" || getLearnContentType(item) === activeFilter;
  });

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <AdminHeader />

      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
              Administración · Aprender
            </p>
            <h1 className="text-5xl font-semibold tracking-[-0.04em]">
              Contenido de Aprender
            </h1>
            <p className="mt-4 text-white/45">
              Administra cursos y guías rápidas desde un mismo catálogo.
            </p>
          </div>

          <Link
            href="/admin/cursos/nuevo"
            className="w-fit rounded-full bg-white px-6 py-3 font-semibold text-black transition hover:bg-white/85"
          >
            + Nuevo contenido
          </Link>
        </div>

        <nav aria-label="Filtrar contenido" className="mt-10 flex flex-wrap gap-2">
          <FilterLink href="/admin/cursos" active={activeFilter === "all"}>
            Todos
          </FilterLink>
          <FilterLink
            href="/admin/cursos?type=course"
            active={activeFilter === "course"}
          >
            Cursos
          </FilterLink>
          <FilterLink
            href="/admin/cursos?type=quick_guide"
            active={activeFilter === "quick_guide"}
          >
            Guías rápidas
          </FilterLink>
        </nav>

        {error && (
          <div className="mt-10 rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-red-300">
            No pudimos cargar el contenido de Aprender.
          </div>
        )}

        <div className="mt-10 overflow-hidden rounded-2xl border border-white/10">
          {filteredContent.map((item) => {
            const contentType = getLearnContentType(item);

            return (
              <div
                key={item.id}
                className="flex flex-col gap-6 border-b border-white/10 p-6 last:border-b-0 md:flex-row md:items-center"
              >
                <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-white/[0.04] md:w-40">
                  {item.cover_image_url ? (
                    <img
                      src={item.cover_image_url}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-white/15">
                      FILMATTA
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold">{item.title}</h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        contentType === "quick_guide"
                          ? "bg-blue-400/10 text-blue-200"
                          : "bg-white/[0.07] text-white/50"
                      }`}
                    >
                      {getLearnContentTypeLabel(contentType)}
                    </span>
                    <StatusBadge status={item.status} />
                    {item.featured && (
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40">
                        Destacado
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-white/35">/cursos/{item.slug}</p>
                  {item.category && (
                    <p className="mt-2 text-sm text-white/30">
                      {item.category}
                      {item.level ? ` · ${item.level}` : ""}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/cursos/${item.id}`}
                    className="rounded-full border border-white/15 px-5 py-2 text-sm transition hover:bg-white/10"
                  >
                    Editar
                  </Link>
                  <DeleteCourseButton
                    id={item.id}
                    title={item.title}
                    contentLabel={
                      contentType === "quick_guide" ? "guía rápida" : "curso"
                    }
                  />
                </div>
              </div>
            );
          })}

          {filteredContent.length === 0 && !error && (
            <div className="p-10 text-white/40">
              {activeFilter === "quick_guide"
                ? "Todavía no hay guías rápidas. Podrás crearlas cuando se aplique la migración de content_type."
                : activeFilter === "course"
                  ? "Todavía no hay cursos."
                  : "Todavía no hay contenido en Aprender."}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function getContentFilter(value: string | undefined): ContentFilter {
  return value === "course" || value === "quick_guide" ? value : "all";
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        active
          ? "border-white bg-white text-black"
          : "border-white/10 text-white/50 hover:border-white/20 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs ${
        status === "published"
          ? "bg-green-500/10 text-green-300"
          : status === "archived"
            ? "bg-orange-500/10 text-orange-300"
            : "bg-white/5 text-white/40"
      }`}
    >
      {status === "published"
        ? "Público"
        : status === "archived"
          ? "Archivado"
          : "Privado"}
    </span>
  );
}
