import Skeleton from "@/components/ui/Skeleton";

export default function LessonLoading() {
  return (
    <main className="min-h-screen bg-[#080808] text-white" aria-busy="true">
      <p className="sr-only" role="status">Cargando lección…</p>
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <Skeleton className="h-3 w-52" />
        <Skeleton className="mt-7 h-4 w-32" />
        <Skeleton className="mt-4 h-12 w-full max-w-3xl" />
        <Skeleton className="mt-4 h-4 w-24" />
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        </div>
      </section>
    </main>
  );
}
