import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocationGallery from "@/components/locations/LocationGallery";
import LocationTourVideo from "@/components/locations/LocationTourVideo";
import LocationCameraTourPlayer from "@/components/locations/LocationCameraTourPlayer";
import LocationContactPanel, { type LocationContactAccess } from "@/components/locations/LocationContactPanel";
import styles from "@/components/locations/locations.module.css";
import SiteHeader from "@/components/SiteHeader";
import { PublicDataError } from "@/components/verticals/PublicDataState";
import { LOCATION_BOOLEAN_CHARACTERISTICS, LOCATION_NUMERIC_CHARACTERISTICS, LOCATION_TEXT_CHARACTERISTICS } from "@/lib/locations/characteristics";
import { LOCATION_CONDITION_GROUPS, LOCATION_CONDITION_LABELS, LOCATION_CONDITIONS_NOTICE } from "@/lib/locations/conditions";
import { formatLocationMetadataDescription, formatLocationPrice, formatLocationRateAmount, getLocationEnvironmentLabel } from "@/lib/locations/format";
import { getPublishedLocation, type PublicLocation } from "@/lib/locations/public";
import { formatAttendeeRange, isPositiveIntegerCapacity } from "@/lib/locations/pricing";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await getPublishedLocation((await params).slug);
  if (result.kind !== "found") return { title: result.kind === "error" ? "Locación no disponible" : "Locación no encontrada", robots: { index: false, follow: false } };
  const { location } = result;
  const description = formatLocationMetadataDescription(location);
  const cover = location.photos[0];
  return { title: location.title, description, openGraph: { title: location.title, description, type: "website", images: cover ? [{ url: cover.imageUrl, alt: cover.altText || location.title }] : undefined } };
}

export default async function LocationPage({ params }: Props) {
  const result = await getPublishedLocation((await params).slug);
  if (result.kind === "not-found") notFound();
  if (result.kind === "error") return <PublicDataError backHref="/locaciones" backLabel="← Todas las locaciones" title="No pudimos cargar esta locación." />;
  const { location } = result;
  const viewer = await getViewer();
  let contactAccess: LocationContactAccess | null = null;
  if (viewer) {
    const db = await createClient();
    const access = await db.rpc("get_my_location_contact_access", { p_slug: location.slug });
    if (!access.error) contactAccess = access.data as LocationContactAccess;
  }
  const cover = location.photos[0];
  const characteristics = getCharacteristics(location);
  const conditionGroups = LOCATION_CONDITION_GROUPS.map((group) => ({
    ...group,
    options: group.options.flatMap((option) => {
      const state = location.shootingConditions[option.key];
      return state ? [{ ...option, state }] : [];
    }),
  })).filter((group) => group.options.length > 0);

  return <main className={styles.page}>
    <SiteHeader contextLink={{ href: "/locaciones", label: "← Todas las locaciones" }} />
    <article className={styles.article}>
      <div className={styles.hero}>{cover ? <img src={cover.imageUrl} alt={cover.altText || `Vista de ${location.title}`} /> : <div className={styles.heroEmpty}>FILMATTA Locations</div>}</div>
      <header className={styles.identity}>
        <div>
          <p className={styles.eyebrow}>{location.spaceType} · {getLocationEnvironmentLabel(location.environment)}</p>
          <h1>{location.title}</h1>
          <p className={styles.locationLine}>{location.city}{location.area ? ` · ${location.area}` : ""}</p>
          {location.summary && <p className={styles.summary}>{location.summary}</p>}
        </div>
        <aside id="contacto" className={styles.aside}>
          <div className={styles.availability}>Consultar disponibilidad</div>
          <LocationContactPanel slug={location.slug} signedIn={Boolean(viewer)} contactAvailable={location.contactAvailable} access={contactAccess} />
          <p className={styles.asideNote}>La disponibilidad, las fechas y cualquier permiso deben confirmarse directamente con el responsable.</p>
        </aside>
      </header>

      {location.description && <Section title="Descripción"><p className={styles.bodyCopy}>{location.description}</p></Section>}
      {isPositiveIntegerCapacity(location.characteristics.declared_capacity) && <Section title="Capacidad máxima" description="Personas presentes simultáneamente, según lo declarado por el responsable; no constituye un aforo certificado."><p className={styles.rate}>{new Intl.NumberFormat("es-MX").format(location.characteristics.declared_capacity)} personas</p></Section>}
      {characteristics.length > 0 && <Section title="Características" description="Datos declarados por el responsable. No constituyen certificación técnica, de aforo, accesibilidad o seguridad."><dl className={styles.characteristicGrid}>{characteristics.map((item) => <div key={item.label} className={styles.characteristic}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></Section>}
      {location.photos.length > 1 && <Section title="Galería"><LocationGallery photos={location.photos.slice(1)} title={location.title} /></Section>}
      {location.cameraTour ? <Section title="Video recorrido"><div className="overflow-hidden rounded-2xl border border-white/10"><LocationCameraTourPlayer tourId={location.cameraTour.id} title={location.title} /><div className="border-t border-white/10 p-5"><p className="text-sm font-semibold">Grabado desde FILMATTA</p><p className="mt-2 text-xs leading-5 text-white/45">Recorrido enviado mediante la herramienta de grabación. No implica verificación de propiedad o de las condiciones del inmueble.</p>{location.cameraTour.recordedAt && <p className="mt-2 text-xs text-white/35">Registrado por el sistema: {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(location.cameraTour.recordedAt))}</p>}</div></div></Section>
        : location.tourVideoUrl && <Section title="Video recorrido"><LocationTourVideo url={location.tourVideoUrl} title={location.title} /></Section>}
      {conditionGroups.length > 0 && <Section title="Condiciones de rodaje" description={LOCATION_CONDITIONS_NOTICE}><div className={styles.conditionPublic}>{conditionGroups.map((group) => <section key={group.id} className={styles.conditionGroup}><h3>{group.title} · {group.options.length}</h3><div className={styles.conditionList}>{group.options.map((option) => <div key={option.key} className={styles.conditionItem}><span>{option.label}</span><span className={styles.conditionBadge} data-state={option.state}>{LOCATION_CONDITION_LABELS[option.state]}</span></div>)}</div></section>)}</div></Section>}
      <Section title="Tarifa y condiciones operativas">
        {location.rateMode === "tiers" && location.rateTiers.length > 0 ? <div className="overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-2 border-b border-white/10 bg-white/[0.035] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/45"><span>Asistentes</span><span>Tarifa total</span></div>
          {location.rateTiers.map((tier) => <div key={`${tier.min}-${tier.max}`} className="grid grid-cols-2 border-b border-white/10 px-5 py-4 text-sm last:border-b-0"><span>{formatAttendeeRange(tier.min, tier.max)}</span><strong className="font-medium">{formatLocationRateAmount(tier.price, tier.currency)}</strong></div>)}
        </div> : <p className={styles.rate}>{formatLocationPrice(location)}</p>}
        {location.rateMode === "tiers" && location.minimumHours !== null && <p className="mt-4 text-sm text-white/60">Contratación mínima: {new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(location.minimumHours)} {location.minimumHours === 1 ? "hora" : "horas"}.</p>}
        {location.restrictions && <p className={styles.operational}>{location.restrictions}</p>}{location.operationalNotes && <p className={styles.operational}>{location.operationalNotes}</p>}
        <p className={styles.asideNote}>Tarifas base orientativas. Los requerimientos especiales, fechas y condiciones se acuerdan directamente con el responsable.</p>
      </Section>
    </article>
  </main>;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className={styles.section}><div className={styles.sectionHeader}><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

function getCharacteristics(location: PublicLocation) {
  const result: { label: string; value: string }[] = [];
  for (const field of LOCATION_NUMERIC_CHARACTERISTICS) {
    if (field.key === "declared_capacity") continue;
    const value = location.characteristics[field.key];
    if (typeof value === "number") result.push({ label: field.label, value: `${new Intl.NumberFormat("es-MX").format(value)} ${field.unit}` });
  }
  for (const field of LOCATION_BOOLEAN_CHARACTERISTICS) {
    const value = location.characteristics[field.key];
    if (typeof value === "boolean") result.push({ label: field.label, value: value ? "Sí" : "No" });
  }
  for (const field of LOCATION_TEXT_CHARACTERISTICS) {
    const value = location.characteristics[field.key];
    if (typeof value === "string") result.push({ label: field.label, value });
  }
  return result;
}
