import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export function PublicDataError({
  backHref,
  backLabel,
  title,
}: {
  backHref: string;
  backLabel: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: backHref, label: backLabel }} />
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300/70">
          No disponible
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
          {title}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-white/50">
          Inténtalo de nuevo más tarde. Si el problema continúa, el equipo de
          FILMATTA ya tendrá información para revisarlo.
        </p>
        <Link
          href={backHref}
          className="mt-10 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          {backLabel.replace("← ", "")}
        </Link>
      </section>
    </main>
  );
}

export function PublicEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-14 border-y border-white/10 py-12">
      <p className="text-xl font-semibold text-white/75">{title}</p>
      <p className="mt-3 max-w-2xl leading-7 text-white/40">{description}</p>
    </div>
  );
}
