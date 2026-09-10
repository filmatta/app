"use client";

import { useFormStatus } from "react-dom";

export default function EnrollButton({ label = "Inscribirme" }: { label?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Inscribiendo…" : label}
    </button>
  );
}
