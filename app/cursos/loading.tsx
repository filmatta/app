import Skeleton from "@/components/ui/Skeleton";
import {
  PAGE_CONTAINER_CLASS_NAME,
  WIDE_PAGE_CONTAINER_CLASS_NAME,
} from "@/lib/page-container";

export default function CoursesLoading() {
  return (
    <main className="min-h-screen bg-[#080808] text-white" aria-busy="true">
      <p className="sr-only" role="status">Cargando Aprender…</p>
      <section className="py-20">
        <div className={PAGE_CONTAINER_CLASS_NAME}>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-5 h-14 w-full max-w-md" />
          <Skeleton className="mt-5 h-5 w-full max-w-2xl" />
        </div>
        <div
          className={`${WIDE_PAGE_CONTAINER_CLASS_NAME} mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="overflow-hidden rounded-2xl border border-white/10">
              <Skeleton className="aspect-video rounded-none" />
              <div className="space-y-4 p-6">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
