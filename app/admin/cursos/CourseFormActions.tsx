"use client";

import { useEffect, useState } from "react";
import LoadingButton from "@/components/ui/LoadingButton";

export default function CourseFormActions() {
  const [dirty, setDirty] = useState(false);
  const [coordinatedPending, setCoordinatedPending] = useState(false);

  useEffect(() => {
    const form = document.getElementById("course-form");
    const markDirty = () => setDirty(true);
    const syncPending = (event: Event) => {
      setCoordinatedPending(Boolean((event as CustomEvent).detail));
    };

    form?.addEventListener("input", markDirty);
    form?.addEventListener("change", markDirty);
    window.addEventListener("filmatta:course-save-pending", syncPending);

    return () => {
      form?.removeEventListener("input", markDirty);
      form?.removeEventListener("change", markDirty);
      window.removeEventListener("filmatta:course-save-pending", syncPending);
    };
  }, []);

  return (
    <div className="sticky top-4 z-20 flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-[#111111]/95 p-4 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:px-5">
      <div>
        <p className="text-sm font-medium text-white/75">
          {dirty ? "Cambios sin guardar" : "Datos generales actualizados"}
        </p>
        <p className="mt-1 text-xs text-white/35">
          {dirty
            ? "Guarda para aplicar los cambios del formulario."
            : "Edita cualquier campo para activar el guardado."}
        </p>
      </div>

      <LoadingButton
        type="submit"
        disabled={!dirty}
        loading={coordinatedPending}
        loadingText="Guardando…"
        className="shrink-0 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
      >
        Guardar cambios
      </LoadingButton>
    </div>
  );
}
