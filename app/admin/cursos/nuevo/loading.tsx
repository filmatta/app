import Skeleton from "@/components/ui/Skeleton";

export default function NewCourseLoading() {
  return (
    <main className="min-h-screen bg-[#080808] text-white" aria-busy="true">
      <p className="sr-only" role="status">Cargando formulario…</p>
      <section className="mx-auto max-w-3xl px-6 py-20">
        <Skeleton className="h-10 w-52 rounded-full" />
        <Skeleton className="mt-10 h-14 w-full max-w-md" />
        <div className="mt-12 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-12 w-48 rounded-full" />
        </div>
      </section>
    </main>
  );
}
