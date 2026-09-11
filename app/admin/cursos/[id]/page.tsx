import Link from "next/link";
import { notFound } from "next/navigation";
import AdminHeader from "@/app/admin/AdminHeader";
import VisibilitySwitch from "@/components/admin/VisibilitySwitch";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  isCourseCategory,
  isCourseLevel,
} from "@/lib/course-options";
import {
  getLearnContentType,
  getLearnContentTypeLabel,
} from "@/lib/learn/content-type";
import AdminToast from "../AdminToast";
import CourseContent from "../CourseContent";
import CourseFormActions from "../CourseFormActions";
import { updateCourse } from "../actions";

const SUCCESS_MESSAGES: Record<string, string> = {
  "course-created": "Contenido creado. Continúa añadiendo contenido aquí.",
  "course-saved": "Contenido guardado.",
  "module-created": "Módulo creado.",
  "module-updated": "Módulo actualizado.",
  "module-deleted": "Módulo eliminado.",
  "lesson-created": "Lección creada.",
  "lesson-updated": "Lección actualizada.",
  "lesson-deleted": "Lección eliminada.",
};

const QUICK_GUIDE_SUCCESS_MESSAGES: Record<string, string> = {
  "lesson-created": "Paso creado.",
  "lesson-updated": "Paso actualizado.",
  "lesson-deleted": "Paso eliminado.",
};

export default async function EditarCursoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    content_error?: string;
    success?: string;
    notice?: string;
    focus?: string;
  }>;
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

  const contentType = getLearnContentType(course);
  const isQuickGuide = contentType === "quick_guide";

  const [modulesResult, lessonsResult] = await Promise.all([
    supabase
      .from("course_modules")
      .select("id, title, description, sort_order, status")
      .eq("course_id", id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("course_lessons")
      .select(
        "id, module_id, title, slug, description, duration_minutes, sort_order, is_preview, status"
      )
      .eq("course_id", id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  const lessonIds = (lessonsResult.data ?? []).map((lesson) => lesson.id);
  const videosResult = lessonIds.length
    ? await supabase
        .from("lesson_videos")
        .select("lesson_id, status")
        .in("lesson_id", lessonIds)
    : { data: [], error: null };

  if (modulesResult.error) {
    console.error("Error cargando los módulos del curso:", modulesResult.error);
  }

  if (lessonsResult.error) {
    console.error("Error cargando las lecciones del curso:", lessonsResult.error);
  }

  if (videosResult.error) {
    console.error("Error cargando los videos del curso:", videosResult.error);
  }

  const contentLoadError =
    modulesResult.error || lessonsResult.error || videosResult.error
      ? "No se pudo cargar todo el contenido del curso. Inténtalo de nuevo."
      : undefined;
  const errorMessage = contentLoadError ?? query.content_error ?? query.error;
  const successMessage = query.success
    ? isQuickGuide && QUICK_GUIDE_SUCCESS_MESSAGES[query.success]
      ? QUICK_GUIDE_SUCCESS_MESSAGES[query.success]
      : SUCCESS_MESSAGES[query.success]
    : undefined;

  const updateCourseWithId = updateCourse.bind(null, id);

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <AdminHeader />
      {errorMessage && (
        <AdminToast
          key={`error-${query.notice ?? errorMessage}`}
          message={errorMessage}
          variant="error"
        />
      )}

      {!errorMessage && successMessage && (
        <AdminToast
          key={`success-${query.notice ?? query.success}`}
          message={successMessage}
          variant="success"
        />
      )}

      <section className="mx-auto max-w-5xl px-6 py-20">
        <Link
          href="/admin/cursos"
          className="inline-flex w-fit rounded-full border border-white/10 px-4 py-2 text-sm text-white/50 transition hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
        >
          ← Contenido de Aprender
        </Link>

        <div className="mt-10">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
              Editar {isQuickGuide ? "guía rápida" : "curso"}
            </p>

            <span
              className={`mb-4 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${
                isQuickGuide
                  ? "bg-blue-400/10 text-blue-200"
                  : "bg-white/[0.07] text-white/50"
              }`}
            >
              {getLearnContentTypeLabel(contentType)}
            </span>

            <h1 className="text-5xl font-semibold tracking-[-0.04em]">
              {course.title}
            </h1>
          </div>

        </div>

        <form
          id="course-form"
          action={updateCourseWithId}
          className="mt-12 max-w-3xl space-y-7"
        >
          <CourseFormActions />

          <Field label="Tipo de contenido">
            <select
              value={contentType}
              disabled
              aria-describedby="content-type-note"
              className={`${selectClass} cursor-not-allowed opacity-60`}
            >
              <option value="course">Curso</option>
              <option value="quick_guide">Guía rápida</option>
            </select>
            <span
              id="content-type-note"
              className="mt-2 block text-xs leading-5 text-white/35"
            >
              El tipo queda bloqueado después de crear el contenido para evitar
              inconsistencias en su estructura.
            </span>
          </Field>

          <Field label="Título">
            <input
              name="title"
              required
              defaultValue={course.title ?? ""}
              className={inputClass}
            />
          </Field>

          <p className="text-sm text-white/40">URL permanente: /cursos/{course.slug}</p>

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
              <select
                name="category"
                defaultValue={course.category ?? ""}
                className={selectClass}
              >
                <option value="">Seleccionar</option>
                {course.category && !isCourseCategory(course.category) && (
                  <option value={course.category}>
                    {course.category} (actual)
                  </option>
                )}
                {COURSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Nivel">
              <select
                name="level"
                defaultValue={course.level ?? ""}
                className={selectClass}
              >
                <option value="">Seleccionar</option>
                {course.level && !isCourseLevel(course.level) && (
                  <option value={course.level}>{course.level} (actual)</option>
                )}
                {COURSE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <p className="text-sm text-white/40">La duración se calcula a partir de los videos de cada lección/paso.</p>

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

          <Field label="Portada">
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

          <VisibilitySwitch
            id="content-public"
            defaultPublic={course.status === "published"}
            archived={course.status === "archived"}
          />

          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/60">
            <input
              name="featured"
              type="checkbox"
              defaultChecked={course.featured}
              className="size-4 accent-white"
            />
            Destacar este contenido
          </label>

          <div className="flex border-t border-white/10 pt-8">
            <Link
              href="/admin/cursos"
              className="rounded-full border border-white/15 px-6 py-3 text-center text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              Cancelar
            </Link>
          </div>
        </form>

        <CourseContent
          courseId={id}
          modules={modulesResult.data ?? []}
          lessons={lessonsResult.data ?? []}
          videos={videosResult.data ?? []}
          contentType={contentType}
          focusId={query.focus}
        />
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
