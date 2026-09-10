import Link from "next/link";
import AdminHeader from "@/app/admin/AdminHeader";
import VisibilitySwitch from "@/components/admin/VisibilitySwitch";
import { requireAdmin } from "@/lib/auth/require-admin";
import { COURSE_CATEGORIES, COURSE_LEVELS } from "@/lib/course-options";
import { getContentTypeSupport } from "../content-type-support";
import { createCourse } from "../actions";

export default async function NuevoCursoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ supabase }, params] = await Promise.all([requireAdmin(), searchParams]);
  const contentTypeSupport = await getContentTypeSupport(supabase);
  const contentTypesAvailable = contentTypeSupport === "available";

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <AdminHeader />
      <section className="mx-auto max-w-3xl px-6 py-20">
        <Link
          href="/admin/cursos"
          className="inline-flex w-fit rounded-full border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
        >
          ← Contenido de Aprender
        </Link>

        <h1 className="mt-10 text-5xl font-semibold tracking-tight">
          Nuevo contenido
        </h1>

        {params.error && (
          <div className="mt-8 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
            {params.error}
          </div>
        )}

        <form action={createCourse} className="mt-12 space-y-7">
          <fieldset
            aria-describedby={
              contentTypesAvailable ? undefined : "content-type-help"
            }
          >
            <legend className="mb-3 text-sm text-white/50">
              Tipo de contenido
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <ContentTypeOption
                value="course"
                title="Curso"
                description="Contenido estructurado en módulos y lecciones."
                enabled={contentTypesAvailable}
                defaultChecked
              />
              <ContentTypeOption
                value="quick_guide"
                title="Guía rápida"
                description="Tutorial breve para resolver una tarea concreta."
                enabled={contentTypesAvailable}
              />
            </div>
            {!contentTypesAvailable && (
              <p
                id="content-type-help"
                className="mt-3 text-xs leading-5 text-amber-200/65"
              >
                {contentTypeSupport === "missing"
                  ? "Aplica primero la migración de content_type para habilitar las guías rápidas. Los cursos actuales siguen funcionando."
                  : "No pudimos verificar content_type. El selector queda deshabilitado para evitar una escritura insegura."}
              </p>
            )}
          </fieldset>

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

         <Field label="Portada">
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

          <VisibilitySwitch id="new-content-public" />

          <label className="flex items-center gap-3 text-sm text-white/60">
            <input
              name="featured"
              type="checkbox"
              className="size-4"
            />
            Destacar este contenido
          </label>

          <div className="border-t border-white/10 pt-8">
            <button
              type="submit"
              className="rounded-full bg-white px-8 py-4 font-semibold text-black transition hover:bg-white/85"
            >
              Crear contenido
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

function ContentTypeOption({
  value,
  title,
  description,
  enabled,
  defaultChecked = false,
}: {
  value: "course" | "quick_guide";
  title: string;
  description: string;
  enabled: boolean;
  defaultChecked?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-5 transition ${
        enabled
          ? "cursor-pointer hover:border-white/25 hover:bg-white/[0.04]"
          : "cursor-not-allowed opacity-55"
      }`}
    >
      <input
        type="radio"
        name={enabled ? "content_type" : undefined}
        value={value}
        defaultChecked={defaultChecked}
        disabled={!enabled}
        className="mt-1 size-4 shrink-0 accent-white"
      />
      <span>
        <span className="block font-semibold text-white/80">{title}</span>
        <span className="mt-2 block text-sm leading-6 text-white/40">
          {description}
        </span>
      </span>
    </label>
  );
}
