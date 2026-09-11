import Skeleton from "@/components/ui/Skeleton";

export default function AdminCoursesLoading() {
  return (
    <main className="min-h-screen bg-[#080808] text-white" aria-busy="true">
      <p className="sr-only" role="status">Cargando contenido…</p>
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-5 h-14 w-full max-w-md" />
        <Skeleton className="mt-12 h-12 w-full rounded-xl" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </section>
    </main>
  );
}
