"use client";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { LearnContentType } from "@/lib/learn/content-type";
import AdminToast from "./AdminToast";
import DeleteContentButton from "./DeleteContentButton";
import {
  createCourseLesson,
  createCourseModule,
  saveAllCourseContent,
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
  contentType: LearnContentType;
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
  contentType,
}: CourseContentProps) {
  const contentRef = useRef<HTMLElement>(null);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    variant: "success" | "error";
    notice: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const lessonsByModule = new Map<string, CourseLesson[]>();

  for (const lesson of lessons) {
    const moduleLessons = lessonsByModule.get(lesson.module_id) ?? [];
    moduleLessons.push(lesson);
    lessonsByModule.set(lesson.module_id, moduleLessons);
  }

  const createModuleForCourse = createCourseModule.bind(null, courseId);
  const actionsDisabled = dirty || pending;
  const isQuickGuide = contentType === "quick_guide";

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const courseForm = document.getElementById("course-form");
    const preventCourseSubmit = (event: Event) => {
      event.preventDefault();
      setFeedback({
        message: "Guarda primero los cambios del contenido.",
        variant: "error",
        notice: crypto.randomUUID(),
      });
    };
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    courseForm?.addEventListener("submit", preventCourseSubmit);
    window.addEventListener("beforeunload", warnBeforeLeaving);

    return () => {
      courseForm?.removeEventListener("submit", preventCourseSubmit);
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, [dirty]);

  function markDirty(event: FormEvent<HTMLElement>) {
    const target = event.target as HTMLElement;

    if (target.closest("form[data-content-record]")) {
      setDirty(true);
    }
  }

  function handleExistingRecordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveAllChanges();
  }

  function preventActionWhileDirty(event: FormEvent<HTMLFormElement>) {
    if (!actionsDisabled) {
      return;
    }

    event.preventDefault();
    setFeedback({
      message: "Guarda primero los cambios pendientes.",
      variant: "error",
      notice: crypto.randomUUID(),
    });
  }

  function saveAllChanges() {
    if (!dirty || pending || !contentRef.current) {
      return;
    }

    const payload = {
      modules: [] as Array<Record<string, FormDataEntryValue | boolean>>,
      lessons: [] as Array<Record<string, FormDataEntryValue | boolean>>,
    };
    const editorForms = contentRef.current.querySelectorAll<HTMLFormElement>(
      "form[data-content-record]"
    );

    for (const form of editorForms) {
      const values = Object.fromEntries(new FormData(form).entries());
      const record = {
        id: form.dataset.recordId ?? "",
        ...values,
        is_preview: values.is_preview === "on",
      };

      if (form.dataset.contentRecord === "module") {
        payload.modules.push(record);
      } else if (form.dataset.contentRecord === "lesson") {
        payload.lessons.push(record);
      }
    }

    const actionData = new FormData();
    actionData.set("payload", JSON.stringify(payload));

    startTransition(async () => {
      try {
        const result = await saveAllCourseContent(courseId, actionData);

        setFeedback({
          message: result.message,
          variant: result.ok ? "success" : "error",
          notice: result.notice,
        });

        if (result.ok) {
          setDirty(false);
        }
      } catch {
        setFeedback({
          message: "No se pudieron guardar todos los cambios.",
          variant: "error",
          notice: crypto.randomUUID(),
        });
      }
    });
  }

  return (
    <section
      ref={contentRef}
      id="contenido"
      className="mt-20 scroll-mt-8 border-t border-white/10 pt-16"
      onChangeCapture={markDirty}
    >
      {feedback && (
        <AdminToast
          key={feedback.notice}
          message={feedback.message}
          variant={feedback.variant}
        />
      )}
      <div className="max-w-3xl">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Learn
        </p>
        <h2 className="text-4xl font-semibold tracking-[-0.04em]">
          {isQuickGuide ? "Contenido de la guía" : "Contenido del curso"}
        </h2>
        <p className="mt-4 leading-7 text-white/45">
          {isQuickGuide
            ? "Añade una o pocas lecciones breves para resolver una necesidad concreta. La estructura técnica se gestiona automáticamente."
            : "Organiza módulos y lecciones. El orden se controla manualmente con números; los valores menores aparecen primero."}
        </p>
      </div>

      {!isQuickGuide && (
        <details className="group mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <summary className="cursor-pointer list-none font-semibold text-white/80 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <span className="flex items-center justify-between gap-4">
            + Crear módulo
            <span className="text-white/30 transition group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </span>
        </summary>

        <form
          action={createModuleForCourse}
          onSubmit={preventActionWhileDirty}
          className="mt-7 space-y-5 border-t border-white/10 pt-7"
        >
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

          <button
            type="submit"
            disabled={actionsDisabled}
            title={
              dirty ? "Guarda primero los cambios pendientes" : undefined
            }
            className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Crear módulo
          </button>
        </form>
        </details>
      )}

      <div className="mt-10 space-y-8">
        {modules.map((courseModule, moduleIndex) => {
          const moduleLessons = lessonsByModule.get(courseModule.id) ?? [];
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
              {!isQuickGuide && (
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
                    disabled={actionsDisabled}
                  />
                </div>

                <form
                  data-content-record="module"
                  data-record-id={courseModule.id}
                  onSubmit={handleExistingRecordSubmit}
                  className="space-y-5"
                >
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

                </form>
                </div>
              )}

              <div className="p-6 sm:p-8">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/30">
                      {isQuickGuide ? "Pasos de la guía" : "Lecciones"}
                    </p>
                    <p className="mt-2 text-sm text-white/40">
                      {moduleLessons.length === 1
                        ? isQuickGuide
                          ? "1 paso"
                          : "1 lección"
                        : `${moduleLessons.length} ${isQuickGuide ? "pasos" : "lecciones"}`}
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
                      actionsDisabled={actionsDisabled}
                      onSubmit={handleExistingRecordSubmit}
                      quickGuide={isQuickGuide}
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
                      + Crear {isQuickGuide ? "paso" : "lección"}
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
                    submitLabel={`Crear ${isQuickGuide ? "paso" : "lección"}`}
                    className="mt-6 border-t border-white/10 pt-6"
                    actionsDisabled={actionsDisabled}
                    onSubmit={preventActionWhileDirty}
                    quickGuide={isQuickGuide}
                  />
                </details>
              </div>
            </article>
          );
        })}

        {modules.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-white/35">
            {isQuickGuide
              ? "La guía todavía no tiene su contenedor técnico. Vuelve a crearla después de aplicar la migración o contacta al equipo técnico."
              : "Todavía no hay módulos. Crea el primero para empezar a estructurar el curso."}
          </div>
        )}
      </div>

      <div className="sticky bottom-4 z-20 mt-10 flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-[#111111]/95 p-5 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-white/75">
            {dirty ? "Tienes cambios sin guardar" : "Contenido actualizado"}
          </p>
          <p className="mt-1 text-xs text-white/35">
            {dirty
              ? "Se guardarán juntos todos los módulos y lecciones editados."
              : "Edita cualquier campo para activar el guardado conjunto."}
          </p>
        </div>

        <button
          type="button"
          onClick={saveAllChanges}
          disabled={!dirty || pending}
          className={`${primaryButtonClass} shrink-0 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {pending ? "Guardando..." : "Guardar todos los cambios"}
        </button>
      </div>
    </section>
  );
}

function LessonEditor({
  courseId,
  moduleId,
  lesson,
  position,
  actionsDisabled,
  onSubmit,
  quickGuide,
}: {
  courseId: string;
  moduleId: string;
  lesson: CourseLesson;
  position: number;
  actionsDisabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  quickGuide: boolean;
}) {
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
            disabled={actionsDisabled}
          />
        </div>

        <LessonForm
          lesson={lesson}
          recordId={lesson.id}
          onSubmit={onSubmit}
          quickGuide={quickGuide}
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
  recordId,
  actionsDisabled = false,
  onSubmit,
  quickGuide = false,
}: {
  action?: (formData: FormData) => void | Promise<void>;
  submitLabel?: string;
  lesson?: CourseLesson;
  className?: string;
  recordId?: string;
  actionsDisabled?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  quickGuide?: boolean;
}) {
  return (
    <form
      action={action}
      data-content-record={recordId ? "lesson" : undefined}
      data-record-id={recordId}
      onSubmit={onSubmit}
      className={`space-y-5 ${className}`}
    >
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

        <Field label={quickGuide ? "Número de paso" : "Número de lección"}>
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

      {action && submitLabel && (
        <button
          type="submit"
          disabled={actionsDisabled}
          title={
            actionsDisabled ? "Guarda primero los cambios pendientes" : undefined
          }
          className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {submitLabel}
        </button>
      )}
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
