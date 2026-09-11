"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LoadingButton from "@/components/ui/LoadingButton";
import {
  completeLesson,
  startLesson,
} from "@/app/cursos/[slug]/lecciones/[lessonSlug]/actions";

type LessonProgressControlsProps = {
  courseId: string;
  lessonId: string;
  courseSlug: string;
  lessonSlug: string;
  started: boolean;
  completed: boolean;
  nextLesson: {
    href: string;
    title: string;
  } | null;
  courseHref: string;
};

export default function LessonProgressControls({
  courseId,
  lessonId,
  courseSlug,
  lessonSlug,
  started,
  completed,
  nextLesson,
  courseHref,
}: LessonProgressControlsProps) {
  const router = useRouter();
  const startAttempted = useRef(false);
  const [startPending, startTransition] = useTransition();
  const [completionPending, setCompletionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedLessonId, setCompletedLessonId] = useState<string | null>(
    completed ? lessonId : null
  );
  const isCompleted = completed || completedLessonId === lessonId;
  const pending = startPending || completionPending;

  useEffect(() => {
    if (started || isCompleted || startAttempted.current) {
      return;
    }

    startAttempted.current = true;
    startTransition(async () => {
      const result = await startLesson(
        courseId,
        lessonId,
        courseSlug,
        lessonSlug
      );

      if (!result.ok) {
        setError(result.error ?? "No pudimos guardar tu progreso.");
        return;
      }

      router.refresh();
    });
  }, [courseId, courseSlug, isCompleted, lessonId, lessonSlug, router, started]);

  async function markComplete() {
    setError(null);
    setCompletionPending(true);
    const result = await completeLesson(
      courseId,
      lessonId,
      courseSlug,
      lessonSlug
    );

    if (!result.ok) {
      setError(result.error ?? "No pudimos guardar tu progreso.");
      setCompletionPending(false);
      return;
    }

    setCompletedLessonId(lessonId);
    setCompletionPending(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <p
            aria-live="polite"
            className={`flex items-center gap-2 text-sm font-medium ${
              isCompleted ? "text-emerald-300" : "text-white/75"
            }`}
          >
            {isCompleted && (
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-400/10">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-4 fill-none stroke-current"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              </span>
            )}
            {isCompleted
              ? "Lección completada"
              : started
                ? "Progreso guardado"
                : pending
                  ? "Guardando tu punto de inicio…"
                  : "Lista para comenzar"}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/35">
            {isCompleted
              ? "Puedes volver cuando quieras; tu avance queda guardado."
              : "FILMATTA recordará esta lección para que continúes desde aquí."}
          </p>
        </div>

        {isCompleted ? (
          <Link
            href={nextLesson?.href ?? courseHref}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            {nextLesson ? "Continuar a la siguiente lección" : "Volver al temario"}
            <span aria-hidden="true" className="ml-2">
              →
            </span>
          </Link>
        ) : (
          <LoadingButton
            type="button"
            onClick={markComplete}
            loading={pending}
            loadingText="Guardando…"
            className="shrink-0 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-wait disabled:bg-white/10 disabled:text-white/40"
          >
            Marcar como completada
          </LoadingButton>
        )}
      </div>

      {isCompleted && nextLesson && (
        <p className="mt-4 text-xs text-white/35">
          Siguiente: {nextLesson.title}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
    </div>
  );
}
