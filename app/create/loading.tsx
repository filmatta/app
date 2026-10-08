export default function CreateLoading() {
  return <main className="min-h-screen bg-[#080808] px-5 py-12 text-white">
    <div className="mx-auto max-w-5xl" role="status" aria-live="polite">
      <p className="text-sm text-white/60">FILMATTA Create</p>
      <h1 className="mt-8 text-3xl font-semibold">Abriendo tus proyectos…</h1>
      <p className="mt-3 text-white/60">Estamos recuperando tu guion y los módulos asociados.</p>
    </div>
  </main>;
}
