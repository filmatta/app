import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocationGallery from "@/components/locations/LocationGallery";
import LocationTourVideo from "@/components/locations/LocationTourVideo";
import styles from "@/components/locations/locations.module.css";
import SiteHeader from "@/components/SiteHeader";
import { PublicDataError } from "@/components/verticals/PublicDataState";
import { LOCATION_BOOLEAN_CHARACTERISTICS, LOCATION_NUMERIC_CHARACTERISTICS, LOCATION_TEXT_CHARACTERISTICS } from "@/lib/locations/characteristics";
import { LOCATION_CONDITION_GROUPS, LOCATION_CONDITION_LABELS, LOCATION_CONDITIONS_NOTICE } from "@/lib/locations/conditions";
import { formatLocationMetadataDescription, formatLocationPrice, getLocationEnvironmentLabel } from "@/lib/locations/format";
import { getPublishedLocation, type PublicLocation, type PublicLocationContact } from "@/lib/locations/public";

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
        <aside className={styles.aside}>
          <div className={styles.availability}>Consultar disponibilidad</div>
          {location.contact && <a href="#contacto" className={styles.contactButton}>Contactar por esta locación</a>}
          <p className={styles.asideNote}>La disponibilidad, las fechas y cualquier permiso deben confirmarse directamente con el responsable.</p>
        </aside>
      </header>

      {location.description && <Section title="Descripción"><p className={styles.bodyCopy}>{location.description}</p></Section>}
      {characteristics.length > 0 && <Section title="Características" description="Datos declarados por el responsable. No constituyen certificación técnica, de aforo, accesibilidad o seguridad."><dl className={styles.characteristicGrid}>{characteristics.map((item) => <div key={item.label} className={styles.characteristic}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></Section>}
      {location.photos.length > 1 && <Section title="Galería"><LocationGallery photos={location.photos.slice(1)} title={location.title} /></Section>}
      {location.tourVideoUrl && <Section title="Video recorrido"><LocationTourVideo url={location.tourVideoUrl} title={location.title} /></Section>}
      {conditionGroups.length > 0 && <Section title="Condiciones de rodaje" description={LOCATION_CONDITIONS_NOTICE}><div className={styles.conditionPublic}>{conditionGroups.map((group) => <section key={group.id} className={styles.conditionGroup}><h3>{group.title} · {group.options.length}</h3><div className={styles.conditionList}>{group.options.map((option) => <div key={option.key} className={styles.conditionItem}><span>{option.label}</span><span className={styles.conditionBadge} data-state={option.state}>{LOCATION_CONDITION_LABELS[option.state]}</span></div>)}</div></section>)}</div></Section>}
      <Section title="Tarifa y condiciones operativas"><p className={styles.rate}>{formatLocationPrice(location)}</p>{location.restrictions && <p className={styles.operational}>{location.restrictions}</p>}{location.operationalNotes && <p className={styles.operational}>{location.operationalNotes}</p>}<p className={styles.asideNote}>Tarifas, fechas y condiciones se acuerdan directamente con el responsable de la locación.</p></Section>
      {location.contact && <section id="contacto" className={styles.section}><div className={styles.sectionHeader}><h2>Contacto</h2><p>Canales publicados expresamente para esta locación. FILMATTA no procesa reservas, pagos ni cotizaciones.</p></div><ContactLinks contact={location.contact} /></section>}
    </article>
  </main>;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className={styles.section}><div className={styles.sectionHeader}><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

function getCharacteristics(location: PublicLocation) {
  const result: { label: string; value: string }[] = [];
  for (const field of LOCATION_NUMERIC_CHARACTERISTICS) {
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

function ContactLinks({ contact }: { contact: PublicLocationContact }) {
  const links = [
    contact.email && { label: "Email", href: `mailto:${contact.email}` },
    contact.phone && { label: "Llamar", href: `tel:${contact.phone.replace(/[^+0-9]/g, "")}` },
    contact.whatsapp && { label: "WhatsApp", href: `https://wa.me/${contact.whatsapp.replace(/\D/g, "")}` },
    contact.website && { label: "Sitio web", href: contact.website },
  ].filter((link): link is { label: string; href: string } => Boolean(link));
  return <div className={styles.contactGrid}>{links.map((link) => <a key={link.label} href={link.href} className={styles.contactLink} rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined} target={link.href.startsWith("http") ? "_blank" : undefined}>{link.label} →</a>)}</div>;
}
