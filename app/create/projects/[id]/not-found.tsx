import Link from "next/link";

export default function CreateProjectNotFound() {
  return <main className="min-h-screen bg-[#080808] px-5 py-12 text-white">
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold">Proyecto no disponible</h1>
      <p className="mt-3 text-white/65">El enlace puede estar desactualizado o este proyecto no está en tu cuenta.</p>
      <Link href="/create" className="mt-6 inline-block rounded-md border border-white/30 px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Ver mis proyectos</Link>
    </div>
  </main>;
}
