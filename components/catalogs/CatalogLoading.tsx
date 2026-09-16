export default function CatalogLoading() {
  return (
    <main
      className="min-h-screen bg-[#080808] px-6 py-20 text-white"
      aria-busy="true"
    >
      <p role="status" className="mx-auto max-w-7xl text-sm text-white/70">
        Cargando catálogo…
      </p>
      <div
        aria-hidden="true"
        className="mx-auto mt-10 grid max-w-7xl gap-8 sm:grid-cols-3"
      >
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-52 border-t border-white/20 bg-white/[.025]"
          />
        ))}
      </div>
    </main>
  );
}
