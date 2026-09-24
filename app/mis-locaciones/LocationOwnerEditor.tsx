import LocationCharacteristicsEditor from "@/components/locations/LocationCharacteristicsEditor";
import LocationConditionsEditor from "@/components/locations/LocationConditionsEditor";
import LocationGeographyFields from "@/components/locations/LocationGeographyFields";
import LocationPhotoManager, { type OwnerLocationPhoto } from "@/components/locations/LocationPhotoManager";
import LocationPricingEditor from "@/components/locations/LocationPricingEditor";
import LocationTourRecorder from "@/components/locations/LocationTourRecorder";
import styles from "@/components/locations/locations.module.css";
import { getLocationCompleteness } from "@/lib/locations/completeness";
import { LOCATION_CONDITIONS_NOTICE } from "@/lib/locations/conditions";
import { LOCATION_ENVIRONMENTS } from "@/lib/locations/form";
import { formatLegacyLocationPrice, formatLocationRateAmount } from "@/lib/locations/format";
import { formatAttendeeRange } from "@/lib/locations/pricing";
import type { OwnerLocationTour } from "@/lib/locations/tour-types";
import type { EditableLocation, EditableLocationContact } from "./LocationForm";
import LocationFormButtons from "./LocationFormButtons";
import LocationIdentityFields from "./LocationIdentityFields";
import LocationSectionSubmit from "./LocationSectionSubmit";
import type { LocationEditorSection } from "./actions";

export type OwnerEditableLocation = EditableLocation & {
  id: string;
  country_code: string | null;
  region_code: string | null;
  region_name: string | null;
  municipality_code: string | null;
  municipality_name: string | null;
  locality_code: string | null;
  geography_source: string | null;
};

type SectionActions = Record<LocationEditorSection, (formData: FormData) => void | Promise<void>>;

export default function LocationOwnerEditor({
  location, contact, photos, tour, cameraRecordingEnabled, activeSection, actions, statusAction,
}: {
  location: OwnerEditableLocation;
  contact: EditableLocationContact | null;
  photos: OwnerLocationPhoto[];
  tour: OwnerLocationTour | null;
  cameraRecordingEnabled: boolean;
  activeSection?: string;
  actions: SectionActions;
  statusAction: (formData: FormData) => void | Promise<void>;
}) {
  const readyPhotos = photos.filter((photo) => photo.lifecycle === "ready");
  const cover = readyPhotos.find((photo) => photo.isCover) ?? readyPhotos[0];
  const capacity = location.characteristics.declared_capacity;
  const progress = getLocationCompleteness({
    title: location.title, spaceType: location.space_type, city: location.city,
    capacity, rateMode: location.rate_mode, rateTiers: location.rate_tiers,
    summary: location.summary, description: location.description,
    readyPhotoCount: readyPhotos.length, hasReadyCover: Boolean(cover),
    characteristics: location.characteristics, conditions: location.shooting_conditions,
    contact, hasReadyTour: Boolean(tour?.isActive || location.tour_video_url),
  });

  return <div className="mt-10">
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111] aspect-[16/8.5]">
      {cover?.src ? <img src={cover.src} alt={cover.altText || `Portada de ${location.title}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center px-6 text-center text-sm text-white/35">Añade fotos para mostrar la distribución y los accesos.</div>}
    </div>

    <div className="grid gap-8 border-b border-white/10 py-9 lg:grid-cols-[1fr_300px]">
      <div><p className="text-xs font-semibold uppercase tracking-[.24em] text-white/35">Tu ficha editable</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.035em] sm:text-5xl">{location.title}</h2><p className="mt-4 text-white/50">{location.space_type} · {location.area ? `${location.area}, ` : ""}{location.city}</p></div>
      <aside className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><strong className="text-2xl">{progress.complete} de {progress.total}</strong><p className="mt-1 text-sm text-white/45">apartados completados</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-white" style={{ width: `${progress.complete * 10}%` }} /></div><p className="mt-4 text-xs leading-5 text-white/40">El recorrido es opcional y el 100% no es requisito para publicar.</p></aside>
    </div>

    <form action={statusAction} className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 py-6">
      <div><strong className="text-sm">Estado: {location.status === "published" ? "Publicada" : location.status === "archived" ? "Archivada" : "Borrador"}</strong><p className="mt-1 text-xs text-white/40">Publicar conserva las validaciones actuales; los apartados opcionales pueden seguir pendientes.</p></div>
      <LocationFormButtons mode="edit" currentStatus={location.status} />
    </form>

    <div className="divide-y divide-white/10">
      <EditorSection title="Información" actionLabel="Editar información" complete={progress.items[0].complete} open={activeSection === "identity"}>
        <form action={actions.identity} className="space-y-5"><LocationIdentityFields defaultTitle={location.title} defaultSlug={location.slug} autoGenerateSlug={false} /><Field label="Tipo de espacio"><input name="space_type" required maxLength={120} defaultValue={location.space_type} className={inputClass} /></Field><Field label="Entorno"><select name="environment" defaultValue={location.environment} className={inputClass}>{LOCATION_ENVIRONMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><LocationSectionSubmit /></form>
      </EditorSection>

      <EditorSection title="Ubicación" actionLabel={location.geography_source ? "Editar ubicación" : "Revisar ubicación"} complete={progress.items[1].complete} open={activeSection === "location"} summary={`${location.region_name ? `${location.region_name} · ` : ""}${location.municipality_name ? `${location.municipality_name} · ` : ""}${location.city}`}>
        <form action={actions.location} className="space-y-5"><LocationGeographyFields initial={{ countryCode: location.country_code, regionCode: location.region_code, municipalityCode: location.municipality_code, localityCode: location.locality_code, city: location.city, area: location.area }} /><LocationSectionSubmit /></form>
      </EditorSection>

      <EditorSection title="Capacidad y tarifas" actionLabel="Editar capacidad y tarifas" complete={progress.items[2].complete && progress.items[3].complete} open={activeSection === "pricing"} summary={pricingSummary(location)}>
        <form action={actions.pricing} className="space-y-6"><LocationPricingEditor initialCapacity={typeof capacity === "number" ? capacity : null} initialMode={location.rate_mode} initialTiers={location.rate_tiers} initialMinimumHours={location.minimum_hours === null ? null : Number(location.minimum_hours)} legacyPrice={formatLegacyLocationPrice({ priceAmount: numberOrNull(location.price_amount), priceCurrency: location.price_currency, priceUnit: location.price_unit })} /><LocationSectionSubmit /></form>
      </EditorSection>

      <EditorSection title="Fotos y portada" actionLabel={readyPhotos.length ? "Administrar fotos" : "Agregar fotos y elegir portada"} complete={progress.items[5].complete} open={activeSection === "photos"} summary={readyPhotos.length ? `${readyPhotos.length} foto${readyPhotos.length === 1 ? " lista" : "s listas"}` : "Añade fotos para mostrar la distribución y los accesos."}>
        <LocationPhotoManager locationId={location.id} photos={photos} />
      </EditorSection>

      <EditorSection title="Recorrido" actionLabel={tour?.isActive ? "Volver a grabar" : "Grabar recorrido"} complete={progress.items[9].complete} optional open={activeSection === "tour"} summary={tour?.isActive || location.tour_video_url ? "Recorrido disponible" : "Muestra el espacio en una toma continua desde tu teléfono."}>
        {cameraRecordingEnabled ? <LocationTourRecorder locationId={location.id} locationTitle={location.title} published={location.status === "published"} initialTour={tour} /> : <div className={styles.ownerPlaceholder}>La grabación de recorridos está temporalmente deshabilitada.</div>}
      </EditorSection>

      <EditorSection title="Descripción" actionLabel={progress.items[4].complete ? "Editar descripción" : "Describe tu espacio"} complete={progress.items[4].complete} open={activeSection === "description"} summary={location.summary || location.description || "Explica la distribución, los accesos y qué hace especial al espacio."}>
        <form action={actions.description} className="space-y-5"><Field label="Descripción corta"><textarea name="summary" maxLength={500} rows={3} defaultValue={location.summary ?? ""} className={inputClass} /></Field><Field label="Descripción completa"><textarea name="description" maxLength={20_000} rows={7} defaultValue={location.description ?? ""} className={inputClass} /></Field><LocationSectionSubmit /></form>
      </EditorSection>

      <EditorSection title="Características" actionLabel={progress.items[6].complete ? "Editar características" : "Completar características"} complete={progress.items[6].complete} open={activeSection === "characteristics"} summary={progress.items[6].complete ? `${Object.keys(location.characteristics).length - 1} datos adicionales` : "Superficie, luz, accesos, servicios y equipamiento."}>
        <form action={actions.characteristics} className="space-y-6"><LocationCharacteristicsEditor value={location.characteristics} /><LocationSectionSubmit /></form>
      </EditorSection>

      <EditorSection title="Condiciones de rodaje" actionLabel={progress.items[7].complete ? "Editar condiciones" : "Completar condiciones de rodaje"} complete={progress.items[7].complete} open={activeSection === "conditions"} summary={progress.items[7].complete ? `${Object.keys(location.shooting_conditions).length} condiciones especificadas` : "Horarios pendientes · Equipo y montaje sin completar"}>
        <form action={actions.conditions} className="space-y-6"><p className="text-sm leading-6 text-white/45">{LOCATION_CONDITIONS_NOTICE}</p><LocationConditionsEditor initialValue={location.shooting_conditions} /><LocationSectionSubmit /></form>
      </EditorSection>

      <EditorSection title="Restricciones y operación" actionLabel="Editar condiciones operativas" complete={Boolean(location.restrictions || location.operational_notes)} open={activeSection === "notes"} summary={location.restrictions || location.operational_notes || "Horarios, visita técnica, depósito, seguro o limpieza."}>
        <form action={actions.notes} className="space-y-5"><Field label="Restricciones básicas"><textarea name="restrictions" maxLength={10_000} rows={5} defaultValue={location.restrictions ?? ""} className={inputClass} /></Field><Field label="Tarifa y condiciones operativas"><textarea name="operational_notes" maxLength={5_000} rows={5} defaultValue={location.operational_notes ?? ""} className={inputClass} /></Field><LocationSectionSubmit /></form>
      </EditorSection>

      <EditorSection title="Contacto" actionLabel={progress.items[8].complete ? "Configurar contacto" : "Configurar contacto"} complete={progress.items[8].complete} open={activeSection === "contact"} summary={progress.items[8].complete ? "Canales privados configurados" : "Los datos sólo se comparten cuando aceptas una solicitud."}>
        <form action={actions.contact} className="space-y-5"><div className="grid gap-5 sm:grid-cols-2"><Field label="Email"><input name="contact_email" type="email" maxLength={254} defaultValue={contact?.email ?? ""} className={inputClass} /></Field><Field label="Teléfono"><input name="contact_phone" type="tel" maxLength={40} defaultValue={contact?.phone ?? ""} className={inputClass} /></Field><Field label="WhatsApp"><input name="contact_whatsapp" maxLength={20} defaultValue={contact?.whatsapp ?? ""} className={inputClass} /></Field><Field label="Instagram"><input name="contact_instagram" maxLength={30} defaultValue={contact?.instagram ?? ""} className={inputClass} /></Field></div><input type="hidden" name="contact_website" value={contact?.website ?? ""} /><LocationSectionSubmit /></form>
      </EditorSection>
    </div>
  </div>;
}

function EditorSection({ title, actionLabel, complete, optional = false, summary, open, children }: { title: string; actionLabel: string; complete: boolean; optional?: boolean; summary?: string; open?: boolean; children: React.ReactNode }) {
  return <section className="py-8"><div className="grid gap-4 md:grid-cols-[220px_1fr]"><div><h3 className="font-semibold">{title}</h3><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] ${complete ? "bg-emerald-300/10 text-emerald-200" : "bg-white/[0.06] text-white/45"}`}>{complete ? "Completo" : optional ? "Opcional" : "Pendiente"}</span></div><div><p className="max-w-2xl text-sm leading-6 text-white/50">{summary}</p><details open={open} className="group mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5"><summary className="cursor-pointer list-none text-sm font-semibold text-white/80 group-open:mb-6">{actionLabel} <span aria-hidden="true" className="ml-2 text-white/35">＋</span></summary>{children}</details></div></div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm text-white/50">{label}</span>{children}</label>; }

function pricingSummary(location: OwnerEditableLocation) {
  if (location.rate_mode === "inquire") return "Consultar tarifa";
  if (location.rate_mode === "tiers" && location.rate_tiers.length) return location.rate_tiers.map((tier) => `${formatAttendeeRange(tier.min, tier.max)} · ${formatLocationRateAmount(tier.price, tier.currency)}`).join(" · ");
  return formatLegacyLocationPrice({ priceAmount: numberOrNull(location.price_amount), priceCurrency: location.price_currency, priceUnit: location.price_unit });
}

function numberOrNull(value: number | string | null) { const parsed = Number(value); return value === null || !Number.isFinite(parsed) ? null : parsed; }
const inputClass = "w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-white outline-none transition focus:border-white/35";
