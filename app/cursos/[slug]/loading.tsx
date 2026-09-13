import Skeleton from "@/components/ui/Skeleton";
import { PAGE_CONTAINER_CLASS_NAME } from "@/lib/page-container";

export default function CourseLoading() {
  return (
    <main className="min-h-screen bg-[#080808] text-white" aria-busy="true">
      <p className="sr-only" role="status">Cargando curso…</p>
      <section
        className={`${PAGE_CONTAINER_CLASS_NAME} grid gap-12 py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]`}
      >
        <div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-6 h-16 w-full max-w-2xl" />
          <Skeleton className="mt-6 h-5 w-full" />
          <Skeleton className="mt-3 h-5 w-4/5" />
          <Skeleton className="mt-10 aspect-video w-full rounded-2xl" />
        </div>
        <div className="space-y-5 lg:pt-20">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </section>
    </main>
  );
}
