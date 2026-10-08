"use client";

import Link from "next/link";

export default function CreateError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="min-h-screen bg-[#080808] px-5 py-12 text-white">
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-white/60">FILMATTA Create</p>
      <h1 className="mt-8 text-3xl font-semibold">No pudimos abrir tus proyectos</h1>
      <p className="mt-3 max-w-xl text-white/65">Tu contenido sigue guardado. Comprueba la conexión y vuelve a intentarlo.</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className="rounded-md bg-white px-5 py-3 font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Reintentar</button>
        <Link href="/cuenta" className="rounded-md border border-white/30 px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Volver a mi cuenta</Link>
      </div>
    </div>
  </main>;
}
