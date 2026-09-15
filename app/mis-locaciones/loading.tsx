export default function MyLocationsLoading() {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <div className="border-b border-white/10">
        <div className="mx-auto h-[81px] max-w-7xl px-6 lg:px-8" />
      </div>
      <section
        aria-label="Cargando locaciones"
        aria-busy="true"
        className="mx-auto max-w-7xl animate-pulse px-6 py-16 lg:px-8 lg:py-20"
      >
        <div className="h-3 w-32 rounded bg-white/10" />
        <div className="mt-6 h-14 max-w-sm rounded bg-white/10" />
        <div className="mt-5 h-5 max-w-xl rounded bg-white/[0.07]" />
        <div className="mt-12 overflow-hidden rounded-2xl border border-white/10">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="border-b border-white/10 p-6 last:border-b-0"
            >
              <div className="h-6 w-48 rounded bg-white/10" />
              <div className="mt-3 h-4 w-64 max-w-full rounded bg-white/[0.07]" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
