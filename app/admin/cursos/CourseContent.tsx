import DeleteContentButton from "./DeleteContentButton";
import {
  createCourseLesson,
  createCourseModule,
  updateCourseLesson,
  updateCourseModule,
} from "./content-actions";

type CourseModule = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: string;
};

type CourseLesson = {
  id: string;
  module_id: string;
  title: string;
  slug: string;
  description: string | null;
  duration_minutes: number | null;
  sort_order: number;
  is_preview: boolean;
  status: string;
};

type CourseContentProps = {
  courseId: string;
  modules: CourseModule[];
  lessons: CourseLesson[];
};

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition placeholder:text-white/20 focus:border-white/30";
const selectClass = `${inputClass} appearance-none`;
const primaryButtonClass =
  "rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export default function CourseContent({
  courseId,
  modules,
  lessons,
}: CourseContentProps) {
  const lessonsByModule = new Map<string, CourseLesson[]>();

  for (const lesson of lessons) {
    const moduleLessons = lessonsByModule.get(lesson.module_id) ?? [];
    moduleLessons.push(lesson);
    lessonsByModule.set(lesson.module_id, moduleLessons);
  }

  const createModuleForCourse = createCourseModule.bind(null, courseId);

  return (
    <section
      id="contenido"
      className="mt-20 scroll-mt-8 border-t border-white/10 pt-16"
    >
      <div className="max-w-3xl">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Learn
        </p>
        <h2 className="text-4xl font-semibold tracking-[-0.04em]">
          Contenido del curso
        </h2>
        <p className="mt-4 leading-7 text-white/45">
          Organiza módulos y lecciones. El orden se controla manualmente con
          números; los valores menores aparecen primero.
        </p>
      </div>

      <details className="group mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <summary className="cursor-pointer list-none font-semibold text-white/80 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <span className="flex items-center justify-between gap-4">
            + Crear módulo
            <span className="text-white/30 transition group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </span>
        </summary>

        <form action={createModuleForCourse} className="mt-7 space-y-5 border-t border-white/10 pt-7">
          <Field label="Título">
            <input name="title" required maxLength={200} className={inputClass} />
          </Field>

          <Field label="Descripción">
            <textarea name="description" rows={3} className={inputClass} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Estado">
              <StatusSelect name="status" defaultValue="draft" />
            </Field>
            <Field label="Número de módulo">
              <input
                name="sort_order"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
                className={inputClass}
              />
            </Field>
          </div>

          <button type="submit" className={primaryButtonClass}>
            Crear módulo
          </button>
        </form>
      </details>

      <div className="mt-10 space-y-8">
        {modules.map((courseModule, moduleIndex) => {
          const moduleLessons = lessonsByModule.get(courseModule.id) ?? [];
          const updateModule = updateCourseModule.bind(
            null,
            courseId,
            courseModule.id
          );
          const createLesson = createCourseLesson.bind(
            null,
            courseId,
            courseModule.id
          );

          return (
            <article
              key={courseModule.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.015]"
            >
              <div className="border-b border-white/10 p-6 sm:p-8">
                <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/30">
                      Módulo {moduleIndex + 1}
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold">
                      {courseModule.title}
                    </h3>
                  </div>

                  <DeleteContentButton
                    kind="module"
                    courseId={courseId}
                    moduleId={courseModule.id}
                    title={courseModule.title}
                  />
                </div>

                <form action={updateModule} className="space-y-5">
                  <Field label="Título">
                    <input
                      name="title"
                      required
                      maxLength={200}
                      defaultValue={courseModule.title}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Descripción">
                    <textarea
                      name="description"
                      rows={3}
                      defaultValue={courseModule.description ?? ""}
                      className={inputClass}
                    />
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Estado">
                      <StatusSelect
                        name="status"
                        defaultValue={courseModule.status}
                      />
                    </Field>
                    <Field label="Número de módulo">
                      <input
                        name="sort_order"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={courseModule.sort_order}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <button type="submit" className={primaryButtonClass}>
                    Guardar módulo
                  </button>
                </form>
              </div>

              <div className="p-6 sm:p-8">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/30">
                      Lecciones
                    </p>
                    <p className="mt-2 text-sm text-white/40">
                      {moduleLessons.length === 1
                        ? "1 lección"
                        : `${moduleLessons.length} lecciones`}
                    </p>
                  </div>
                </div>

                <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
                  {moduleLessons.map((lesson, lessonIndex) => (
                    <LessonEditor
                      key={lesson.id}
                      courseId={courseId}
                      moduleId={courseModule.id}
                      lesson={lesson}
                      position={lessonIndex + 1}
                    />
                  ))}

                  {moduleLessons.length === 0 && (
                    <p className="py-6 text-sm text-white/35">
                      Este módulo todavía no tiene lecciones.
                    </p>
                  )}
                </div>

                <details className="group mt-6 rounded-xl border border-dashed border-white/15 p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-white/65 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                    <span className="flex items-center justify-between gap-4">
                      + Crear lección
                      <span
                        className="text-white/30 transition group-open:rotate-45"
                        aria-hidden="true"
                      >
                        +
                      </span>
                    </span>
                  </summary>

                  <LessonForm
                    action={createLesson}
                    submitLabel="Crear lección"
                    className="mt-6 border-t border-white/10 pt-6"
                  />
                </details>
              </div>
            </article>
          );
        })}

        {modules.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-white/35">
            Todavía no hay módulos. Crea el primero para empezar a estructurar el
            curso.
          </div>
        )}
      </div>
    </section>
  );
}

function LessonEditor({
  courseId,
  moduleId,
  lesson,
  position,
}: {
  courseId: string;
  moduleId: string;
  lesson: CourseLesson;
  position: number;
}) {
  const updateLesson = updateCourseLesson.bind(
    null,
    courseId,
    moduleId,
    lesson.id
  );

  return (
    <details className="group py-5">
      <summary className="cursor-pointer list-none marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
        <span className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <span className="min-w-0">
            <span className="mr-3 text-sm text-white/25">{position}.</span>
            <span className="font-medium text-white/80">{lesson.title}</span>
          </span>

          <span className="flex flex-wrap items-center gap-2 text-xs">
            {lesson.is_preview && (
              <span className="rounded-full bg-red-500/10 px-3 py-1 text-red-200">
                Preview
              </span>
            )}
            <StatusBadge status={lesson.status} />
            <span className="text-white/25 transition group-open:rotate-180" aria-hidden="true">
              ↓
            </span>
          </span>
        </span>
      </summary>

      <div className="mt-6 border-t border-white/10 pt-6">
        <div className="mb-5 flex justify-end">
          <DeleteContentButton
            kind="lesson"
            courseId={courseId}
            moduleId={moduleId}
            lessonId={lesson.id}
            title={lesson.title}
          />
        </div>

        <LessonForm
          action={updateLesson}
          submitLabel="Guardar lección"
          lesson={lesson}
        />
      </div>
    </details>
  );
}

function LessonForm({
  action,
  submitLabel,
  lesson,
  className = "",
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  lesson?: CourseLesson;
  className?: string;
}) {
  return (
    <form action={action} className={`space-y-5 ${className}`}>
      <Field label="Título">
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={lesson?.title ?? ""}
          className={inputClass}
        />
      </Field>

      <Field label="Slug">
        <input
          name="slug"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          maxLength={160}
          defaultValue={lesson?.slug ?? ""}
          placeholder="Se genera desde el título si lo dejas vacío"
          className={inputClass}
        />
        <span className="mt-2 block text-xs text-white/30">
          Sólo minúsculas, números y guiones.
        </span>
      </Field>

      <Field label="Descripción">
        <textarea
          name="description"
          rows={3}
          defaultValue={lesson?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Duración en minutos">
          <input
            name="duration_minutes"
            type="number"
            min="0"
            step="1"
            defaultValue={lesson?.duration_minutes ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="Número de lección">
          <input
            name="sort_order"
            type="number"
            min="0"
            step="1"
            defaultValue={lesson?.sort_order ?? 0}
            className={inputClass}
          />
        </Field>

        <Field label="Estado">
          <StatusSelect
            name="status"
            defaultValue={lesson?.status ?? "draft"}
          />
        </Field>
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
        <input
          name="is_preview"
          type="checkbox"
          defaultChecked={lesson?.is_preview ?? false}
          className="size-4 accent-white"
        />
        Permitir preview público
      </label>

      <button type="submit" className={primaryButtonClass}>
        {submitLabel}
      </button>
    </form>
  );
}

function StatusSelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={selectClass}>
      <option value="draft">Borrador</option>
      <option value="published">Publicado</option>
      <option value="archived">Archivado</option>
    </select>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label =
    status === "published"
      ? "Publicado"
      : status === "archived"
        ? "Archivado"
        : "Borrador";

  return (
    <span
      className={`rounded-full px-3 py-1 ${
        status === "published"
          ? "bg-green-500/10 text-green-300"
          : status === "archived"
            ? "bg-orange-500/10 text-orange-300"
            : "bg-white/5 text-white/40"
      }`}
    >
      {label}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/50">{label}</span>
      {children}
    </label>
  );
}
