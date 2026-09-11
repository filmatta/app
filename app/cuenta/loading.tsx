import Skeleton from "@/components/ui/Skeleton";

export default function AccountLoading() {
  return (
    <main className="min-h-screen bg-[#080808] text-white" aria-busy="true">
      <p className="sr-only" role="status">Cargando tu cuenta…</p>
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-5 h-14 w-full max-w-xl" />
        <div className="mt-12 border-y border-white/10 py-5">
          <Skeleton className="h-9 w-full max-w-xl rounded-full" />
        </div>
        <Skeleton className="mt-16 h-9 w-44" />
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      </section>
    </main>
  );
}
