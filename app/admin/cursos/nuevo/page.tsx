import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { COURSE_CATEGORIES, COURSE_LEVELS } from "@/lib/course-options";
import { createCourse } from "../actions";

export default async function NuevoCursoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <section className="mx-auto max-w-3xl px-6 py-20">
        <Link
          href="/admin/cursos"
          className="text-sm text-white/40 hover:text-white"
        >
          ← Cursos
        </Link>

        <h1 className="mt-10 text-5xl font-semibold tracking-tight">
          Nuevo curso
        </h1>

        {params.error && (
          <div className="mt-8 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
            {params.error}
          </div>
        )}

        <form action={createCourse} className="mt-12 space-y-7">
          <Field label="Título">
            <input
              name="title"
              required
              className={selectClass}
              placeholder="Fundamentos de Video"
            />
          </Field>

          <Field label="Slug">
            <input
              name="slug"
              className={selectClass}
              placeholder="Se genera automáticamente si lo dejas vacío"
            />
          </Field>

          <Field label="Descripción corta">
            <textarea
              name="short_description"
              className={selectClass}
              rows={3}
            />
          </Field>

          <Field label="Descripción completa">
            <textarea
              name="description"
              className={selectClass}
              rows={7}
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Categoría">
              <select name="category" defaultValue="" className={selectClass}>
                <option value="">Seleccionar</option>
                {COURSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Nivel">
              <select name="level" defaultValue="" className={selectClass}>
                <option value="">Seleccionar</option>
                {COURSE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Duración en minutos">
              <input
                name="duration_minutes"
                type="number"
                min="0"
                className={selectClass}
              />
            </Field>

            <Field label="Orden">
              <input
                name="sort_order"
                type="number"
                defaultValue="0"
                className={selectClass}
              />
            </Field>
          </div>

          <Field label="Instructor">
            <input
              name="instructor"
              className={selectClass}
              placeholder="FILMATTA"
            />
          </Field>

         <Field label="Portada del curso">
  <input
    name="cover_image"
    type="file"
    accept="image/jpeg,image/png,image/webp"
    className="w-full rounded-xl border border-dashed border-white/15 bg-white/[0.025] px-4 py-6 text-sm text-white/50 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:font-semibold file:text-black"
  />

  <p className="mt-2 text-xs text-white/30">
    JPG, PNG o WEBP · máximo 5 MB
  </p>
</Field>

          <Field label="Estado">
            <select
              name="status"
              defaultValue="draft"
              className={selectClass}
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </Field>

          <label className="flex items-center gap-3 text-sm text-white/60">
            <input
              name="featured"
              type="checkbox"
              className="size-4"
            />
            Destacar este curso
          </label>

          <div className="border-t border-white/10 pt-8">
            <button
              type="submit"
              className="rounded-full bg-white px-8 py-4 font-semibold text-black transition hover:bg-white/85"
            >
              Crear curso
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

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
