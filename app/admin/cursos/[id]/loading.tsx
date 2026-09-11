import Skeleton from "@/components/ui/Skeleton";

export default function AdminCourseLoading() {
  return (
    <main className="min-h-screen bg-[#080808] text-white" aria-busy="true">
      <p className="sr-only" role="status">Cargando editor…</p>
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <Skeleton className="h-10 w-52 rounded-full" />
        <Skeleton className="mt-10 h-3 w-28" />
        <Skeleton className="mt-4 h-14 w-full max-w-xl" />
        <div className="mt-12 max-w-3xl space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      </section>
    </main>
  );
}
