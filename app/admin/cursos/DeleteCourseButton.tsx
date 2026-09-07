"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteCourse } from "./actions";

export default function DeleteCourseButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-red-500/20 px-5 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
      >
        Eliminar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111111] p-8 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-300/70">
              Eliminar curso
            </p>

            <h2 className="mt-5 text-3xl font-semibold tracking-tight">
              ¿Seguro?
            </h2>

            <p className="mt-4 leading-7 text-white/50">
              Vas a eliminar{" "}
              <span className="font-medium text-white">
                {title}
              </span>
              . También se eliminará su portada almacenada.
            </p>

            <p className="mt-3 text-sm text-white/30">
              Esta acción no se puede deshacer.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <form action={deleteCourse} className="flex-1">
                <input type="hidden" name="id" value={id} />

                <DeleteSubmitButton />
              </form>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-white/15 px-6 py-3 font-medium text-white/60 transition hover:bg-white/5 hover:text-white"
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
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-red-500 px-6 py-3 font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Eliminando..." : "Sí, eliminar"}
    </button>
  );
}