import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateCourse } from "../actions";

export default async function EditarCursoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const { supabase } = await requireAdmin();

  const { data: course, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !course) {
    notFound();
  }

  const updateCourseWithId = updateCourse.bind(null, id);

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <section className="mx-auto max-w-3xl px-6 py-20">
        <Link
          href="/admin/cursos"
          className="text-sm text-white/40 transition hover:text-white"
        >
          ← Cursos
        </Link>

        <div className="mt-10">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
            Editar curso
          </p>

          <h1 className="text-5xl font-semibold tracking-[-0.04em]">
            {course.title}
          </h1>
        </div>

        {query.error && (
          <div className="mt-8 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
            {query.error}
          </div>
        )}

        <form action={updateCourseWithId} className="mt-12 space-y-7">
          <Field label="Título">
            <input
              name="title"
              required
              defaultValue={course.title ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Slug">
            <input
              name="slug"
              defaultValue={course.slug ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Descripción corta">
            <textarea
              name="short_description"
              defaultValue={course.short_description ?? ""}
              className={inputClass}
              rows={3}
            />
          </Field>

          <Field label="Descripción completa">
            <textarea
              name="description"
              defaultValue={course.description ?? ""}
              className={inputClass}
              rows={7}
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Categoría">
              <input
                name="category"
                defaultValue={course.category ?? ""}
                className={inputClass}
              />
            </Field>

            <Field label="Nivel">
              <select
                name="level"
                defaultValue={course.level ?? ""}
                className={selectClass}
              >
                <option value="">Seleccionar</option>
                <option value="Principiante">Principiante</option>
                <option value="Intermedio">Intermedio</option>
                <option value="Avanzado">Avanzado</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Duración en minutos">
              <input
                name="duration_minutes"
                type="number"
                min="0"
                defaultValue={course.duration_minutes ?? ""}
                className={inputClass}
              />
            </Field>

            <Field label="Orden">
              <input
                name="sort_order"
                type="number"
                defaultValue={course.sort_order ?? 0}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Instructor">
            <input
              name="instructor"
              defaultValue={course.instructor ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Portada del curso">
  {course.cover_image_url && (
    <div className="mb-4 overflow-hidden rounded-2xl border border-white/10">
      <img
        src={course.cover_image_url}
        alt={course.title}
        className="aspect-video w-full object-cover"
      />
    </div>
  )}

  <input
    name="cover_image"
    type="file"
    accept="image/jpeg,image/png,image/webp"
    className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.025] px-4 py-6 text-sm text-white/50 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:font-semibold file:text-black"
  />

  <p className="mt-2 text-xs text-white/30">
    Deja este campo vacío para conservar la portada actual.
  </p>
</Field>

          <Field label="URL de Hotmart">
            <input
              name="hotmart_url"
              defaultValue={course.hotmart_url ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Estado">
            <select
              name="status"
              defaultValue={course.status}
              className={selectClass}
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </Field>

          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/60">
            <input
              name="featured"
              type="checkbox"
              defaultChecked={course.featured}
              className="size-4 accent-white"
            />
            Destacar este curso
          </label>

          <div className="flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row">
            <button
              type="submit"
              className="rounded-full bg-white px-8 py-4 font-semibold text-black transition hover:bg-white/85"
            >
              Guardar cambios
            </button>

            <Link
              href="/admin/cursos"
              className="rounded-full border border-white/15 px-8 py-4 text-center font-medium text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition placeholder:text-white/20 focus:border-white/30";

const selectClass =
  "w-full appearance-none rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition focus:border-white/30";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/50">
        {label}
      </span>

      {children}
    </label>
  );
}