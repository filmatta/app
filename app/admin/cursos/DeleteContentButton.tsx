"use client";

import { useEffect, useState } from "react";
import LoadingButton from "@/components/ui/LoadingButton";
import {
  deleteCourseLesson,
  deleteCourseModule,
} from "./content-actions";

type DeleteContentButtonProps =
  | {
      kind: "module";
      courseId: string;
      moduleId: string;
      title: string;
      disabled?: boolean;
    }
  | {
      kind: "lesson";
      courseId: string;
      moduleId: string;
      lessonId: string;
      title: string;
      disabled?: boolean;
    };

export default function DeleteContentButton(props: DeleteContentButtonProps) {
  const [open, setOpen] = useState(false);
  const isModule = props.kind === "module";
  const deleteAction = isModule
    ? deleteCourseModule.bind(null, props.courseId, props.moduleId)
    : deleteCourseLesson.bind(
        null,
        props.courseId,
        props.moduleId,
        props.lessonId
      );

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={props.disabled}
        title={
          props.disabled ? "Guarda primero los cambios pendientes" : undefined
        }
        className="rounded-full border border-red-500/20 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-35"
      >
        Eliminar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-${props.kind}-title`}
        >
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111111] p-8 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-300/70">
              Eliminar {isModule ? "módulo" : "lección"}
            </p>

            <h2
              id={`delete-${props.kind}-title`}
              className="mt-5 text-3xl font-semibold tracking-tight"
            >
              ¿Seguro?
            </h2>

            <p className="mt-4 leading-7 text-white/50">
              Vas a eliminar <span className="font-medium text-white">{props.title}</span>.
              {isModule && " También se eliminarán todas sus lecciones."}
            </p>

            <p className="mt-3 text-sm text-white/30">
              Esta acción no se puede deshacer.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <form action={deleteAction} className="flex-1">
                <DeleteSubmitButton />
              </form>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-white/15 px-6 py-3 font-medium text-white/60 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DeleteSubmitButton() {
  return (
    <LoadingButton
      type="submit"
      loadingText="Eliminando…"
      className="w-full rounded-full bg-red-500 px-6 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Sí, eliminar
    </LoadingButton>
  );
}
