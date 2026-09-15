import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { PublicDataError } from "@/components/verticals/PublicDataState";
import {
  formatLocationMetadataDescription,
  formatLocationPrice,
  getLocationEnvironmentLabel,
} from "@/lib/locations/format";
import { getPublishedLocation } from "@/lib/locations/public";

type LocationPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: LocationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublishedLocation(slug);

  if (result.kind !== "found") {
    return {
      title:
        result.kind === "error"
          ? "Locación no disponible"
          : "Locación no encontrada",
      robots: { index: false, follow: false },
    };
  }

  const { location } = result;
  const description = formatLocationMetadataDescription(location);
  const cover = location.photos[0];

  return {
    title: location.title,
    description,
    openGraph: {
      title: location.title,
      description,
      type: "website",
      images: cover
        ? [{ url: cover.imageUrl, alt: cover.altText || location.title }]
        : undefined,
    },
  };
}

export default async function LocationPage({ params }: LocationPageProps) {
  const { slug } = await params;
  const result = await getPublishedLocation(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  if (result.kind === "error") {
    return (
      <PublicDataError
        backHref="/locaciones"
        backLabel="← Todas las locaciones"
        title="No pudimos cargar esta locación."
      />
    );
  }

  const { location } = result;
  const cover = location.photos[0];
  const remainingPhotos = location.photos.slice(1);
  const details = [
    { label: "Tipo de espacio", value: location.spaceType },
    {
      label: "Entorno",
      value: getLocationEnvironmentLabel(location.environment),
    },
    {
      label: "Zona",
      value: [location.area, location.city].filter(Boolean).join(", "),
    },
    { label: "Precio orientativo", value: formatLocationPrice(location) },
  ];

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader
        contextLink={{ href: "/locaciones", label: "← Todas las locaciones" }}
      />

      <article className="mx-auto max-w-7xl px-6 pb-24 pt-12 lg:px-8 lg:pb-32 lg:pt-16">
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-white/[0.04]">
          {cover ? (
            <img
              src={cover.imageUrl}
              alt={cover.altText || `Vista de ${location.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-semibold uppercase tracking-[0.35em] text-white/15">
              FILMATTA Locations
            </div>
          )}
        </div>

        <div className="grid gap-14 pt-14 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-24 lg:pt-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
              {location.spaceType} ·{" "}
              {getLocationEnvironmentLabel(location.environment)}
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
              {location.title}
            </h1>
            {location.summary && (
              <p className="mt-8 max-w-3xl text-xl leading-8 text-white/60 sm:text-2xl sm:leading-9">
                {location.summary}
              </p>
            )}
            {location.description && (
              <section className="mt-14 border-t border-white/10 pt-10">
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/35">
                  Sobre la locación
                </h2>
                <p className="mt-6 max-w-3xl whitespace-pre-line text-lg leading-8 text-white/60">
                  {location.description}
                </p>
              </section>
            )}
            {location.restrictions && (
              <section className="mt-12 border-t border-white/10 pt-10">
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/35">
                  Restricciones básicas
                </h2>
                <p className="mt-5 max-w-3xl whitespace-pre-line leading-7 text-white/55">
                  {location.restrictions}
                </p>
              </section>
            )}
          </div>

          <aside className="h-fit rounded-2xl border border-white/10 bg-white/[0.025] p-7 lg:sticky lg:top-8">
            <dl className="space-y-7">
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt className="text-xs uppercase tracking-[0.2em] text-white/30">
                    {detail.label}
                  </dt>
                  <dd className="mt-2 text-base text-white/75">{detail.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 border-t border-white/10 pt-6 text-xs leading-5 text-white/30">
              Información orientativa. La reserva y el pago no se gestionan en
              FILMATTA en esta etapa.
            </p>
          </aside>
        </div>

        {remainingPhotos.length > 0 && (
          <section
            aria-labelledby="gallery-heading"
            className="mt-24 border-t border-white/10 pt-14"
          >
            <h2
              id="gallery-heading"
              className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl"
            >
              Más vistas
            </h2>
            <div className="mt-9 grid gap-5 md:grid-cols-2">
              {remainingPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-[4/3] overflow-hidden rounded-2xl bg-white/[0.04]"
                >
                  <img
                    src={photo.imageUrl}
                    alt={photo.altText || `Vista de ${location.title}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}
