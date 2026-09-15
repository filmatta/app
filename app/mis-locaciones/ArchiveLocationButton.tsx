"use client";

import { useFormStatus } from "react-dom";

export default function ArchiveLocationButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (
          !window.confirm(
            "¿Archivar esta locación? Dejará de ser pública y podrás reactivarla después."
          )
        ) {
          event.preventDefault();
        }
      }}
      className="rounded-full border border-amber-400/20 px-5 py-2.5 text-sm font-medium text-amber-200 transition hover:bg-amber-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Archivando…" : "Archivar locación"}
    </button>
  );
}
