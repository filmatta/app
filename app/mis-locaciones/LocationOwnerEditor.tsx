/* eslint-disable @next/next/no-img-element -- signed private image URLs are already sized and cannot use the global optimizer safely */
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
import { formatLegacyLocationPrice } from "@/lib/locations/format";
import { LOCATION_PHOTO_LIMIT } from "@/lib/locations/media";
import type { OwnerLocationTour } from "@/lib/locations/tour-types";
import type { EditableLocation, EditableLocationContact } from "./LocationForm";
import LocationEditorIcon from "./LocationEditorIcon";
import LocationIdentityFields from "./LocationIdentityFields";
import LocationOwnerEditorShell, {
  LocationEditorWindow,
  LocationModalCancel,
  LocationPanelButton,
  LocationSectionForm,
  type LocationEditorPanelSection,
} from "./LocationOwnerEditorShell";
import LocationSectionSubmit from "./LocationSectionSubmit";
import type { LocationEditorActionResult, LocationEditorSection } from "./actions";

export type OwnerEditableLocation = EditableLocation & {
  id: string;
  country_code: string | null;
  region_code: string | null;
  region_name: string | null;
  municipality_code: string | null;
  municipality_name: string | null;
  locality_code: string | null;
  postal_code: string | null;
  geography_source: string | null;
};

type EditorAction = (formData: FormData) => Promise<LocationEditorActionResult>;
type SectionActions = Record<LocationEditorSection, EditorAction>;

export default function LocationOwnerEditor({ location, contact, photos, tour, cameraRecordingEnabled, activeSection, actions, statusAction }: {
  location: OwnerEditableLocation;
  contact: EditableLocationContact | null;
  photos: OwnerLocationPhoto[];
  tour: OwnerLocationTour | null;
  cameraRecordingEnabled: boolean;
  activeSection?: string;
  actions: SectionActions;
  statusAction: EditorAction;
}) {
  const readyPhotos = photos.filter((photo) => photo.lifecycle === "ready");
  const occupiedPhotos = photos.length;
  const cover = readyPhotos.find((photo) => photo.isCover) ?? readyPhotos[0];
  const capacity = location.characteristics.declared_capacity;
  const progress = getLocationCompleteness({
    title: location.title,
    spaceType: location.space_type,
    city: location.city,
    capacity,
    rateMode: location.rate_mode,
    rateTiers: location.rate_tiers,
    summary: location.summary,
    description: location.description,
    readyPhotoCount: readyPhotos.length,
    hasReadyCover: Boolean(cover),
    characteristics: location.characteristics,
    conditions: location.shooting_conditions,
    contact,
    hasReadyTour: Boolean(tour?.isActive || location.tour_video_url),
  });
  const initialPanel = panelFromActiveSection(activeSection);
  const conditionCount = Object.keys(location.shooting_conditions).length;

  return <LocationOwnerEditorShell currentStatus={location.status} statusAction={statusAction} initialPanel={initialPanel}>
    <div className="mt-6 space-y-4 sm:mt-10 sm:space-y-5">
      <section className="relative min-h-[340px] overflow-hidden rounded-3xl border border-white/10 bg-[#111] sm:min-h-[360px]">
        {cover?.src ? <img src={cover.src} alt={cover.altText || `Portada de ${location.title}`} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/35">Añade fotos para construir la portada de tu locación.</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10" />
        <LocationPanelButton panel="photos" ariaLabel="Administrar portada y fotografías" className="absolute right-4 top-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 bg-black/55 px-4 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-black/75 sm:right-6 sm:top-6">
          <LocationEditorIcon name="camera" /> <span className="hidden sm:inline">Cambiar portada</span><span className="sm:hidden">Portada</span>
        </LocationPanelButton>
        <div className="absolute inset-x-0 bottom-0 grid gap-5 p-5 sm:grid-cols-[1fr_260px] sm:items-end sm:p-7">
          <div className="min-w-0">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${location.status === "published" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-amber-300/25 bg-amber-300/10 text-amber-100"}`}><span className="size-1.5 rounded-full bg-current" />{location.status === "published" ? "Publicada" : "Borrador"}</span>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">{location.title}</h1>
            <p className="mt-2 text-sm text-white/70 sm:text-base">{location.space_type}{location.municipality_name || location.city ? ` · ${location.municipality_name || location.city}` : ""}{location.region_name ? `, ${location.region_name}` : ""}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-sm">
            <div className="flex items-baseline justify-between gap-4"><strong className="text-sm">Progreso</strong><span className="text-sm font-semibold">{progress.complete}/{progress.total}</span></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#ff625f]" style={{ width: `${Math.round(progress.complete / progress.total * 100)}%` }} /></div>
            <p className="mt-3 text-xs leading-5 text-white/50">El recorrido es opcional y el 100% no es requisito para publicar.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <MediaCard icon="video" title="Recorrido" summary={tourSummary(tour, location.tour_video_url)} accent>
          {cameraRecordingEnabled ? <LocationTourRecorder locationId={location.id} locationTitle={location.title} published={location.status === "published"} initialTour={tour} /> : <div className={styles.ownerPlaceholder}>La grabación de recorridos está temporalmente deshabilitada.</div>}
        </MediaCard>

        <MediaCard icon="images" title="Fotos del lugar" summary={`${readyPhotos.length} ${readyPhotos.length === 1 ? "lista" : "listas"} · ${occupiedPhotos}/${LOCATION_PHOTO_LIMIT} espacios ocupados`} action={<LocationPanelButton panel="photos" className={cardActionClass}>Administrar fotos <LocationEditorIcon name="chevron" /></LocationPanelButton>}>
          {readyPhotos.length ? <div className="grid grid-cols-4 gap-2">{readyPhotos.slice(0, 4).map((photo, index) => <div key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">{photo.src && <img src={photo.src} alt={photo.altText || `Foto ${index + 1}`} className="h-full w-full object-cover" />}{index === 3 && readyPhotos.length > 4 && <span className="absolute inset-0 grid place-items-center bg-black/65 text-sm font-semibold">+{readyPhotos.length - 3}</span>}</div>)}</div> : <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/40">Aún no hay fotografías listas.</p>}
        </MediaCard>
      </div>

      <div className="space-y-3">
        <PanelCard panel="basic" icon="home" title="Información básica" summary={`${location.title} · ${location.space_type}`} detail={shortText(location.summary || location.description) || "Nombre, tipo y descripción de la locación."} />
        <PanelCard panel="location" icon="pin" title="Ubicación" summary={locationSummary(location)} detail="País, estado, municipio, código postal y zona aproximada." />
        <PanelCard panel="pricing" icon="users" title="Capacidad y tarifas" summary={pricingSummary(location)} detail={typeof capacity === "number" ? `Hasta ${capacity} personas` : "Capacidad por especificar"} />
        <PanelCard panel="characteristics" icon="sliders" title="Características" summary={characteristicsSummary(location)} detail="Espacios, accesos, servicios y equipamiento." />
        <PanelCard panel="conditions" icon="shield" title="Condiciones de rodaje" summary={`${conditionCount} ${conditionCount === 1 ? "condición especificada" : "condiciones especificadas"}`} detail="Nueve categorías con Sí, Consultar, No o Sin especificar." />
        <PanelCard panel="contact" icon="phone" title="Contacto" summary={contactSummary(contact)} detail="Se comparte únicamente al aceptar una solicitud." />
      </div>
    </div>

    <LocationEditorWindow panel="photos" title="Fotos del lugar" description="Administra archivos, orden y portada con el flujo actual." media><LocationPhotoManager locationId={location.id} photos={photos} /></LocationEditorWindow>

    <LocationEditorWindow panel="basic" title="Información básica" description="La identidad y la descripción conservan sus guardados independientes.">
      <div className="space-y-8">
        <section><h3 className="mb-4 text-sm font-semibold uppercase tracking-[.14em] text-white/45">Identidad</h3><LocationSectionForm section="identity" action={actions.identity} className="space-y-5"><LocationIdentityFields defaultTitle={location.title} defaultSlug={location.slug} autoGenerateSlug={false} /><Field label="Tipo de espacio"><input name="space_type" required maxLength={120} defaultValue={location.space_type} className={inputClass} /></Field><Field label="Entorno"><select name="environment" defaultValue={location.environment} className={inputClass}>{LOCATION_ENVIRONMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><ModalActions panel="basic" label="Guardar información" /></LocationSectionForm></section>
        <section className="border-t border-white/10 pt-8"><h3 className="mb-4 text-sm font-semibold uppercase tracking-[.14em] text-white/45">Descripción</h3><LocationSectionForm section="description" action={actions.description} className="space-y-5"><Field label="Descripción corta"><textarea name="summary" maxLength={500} rows={3} defaultValue={location.summary ?? ""} className={inputClass} /></Field><Field label="Descripción completa"><textarea name="description" maxLength={20_000} rows={7} defaultValue={location.description ?? ""} className={inputClass} /></Field><ModalActions panel="basic" label="Guardar descripción" /></LocationSectionForm></section>
      </div>
    </LocationEditorWindow>

    <LocationEditorWindow panel="location" title="Ubicación" description="La ubicación mostrada es aproximada en la ficha pública."><LocationSectionForm section="location" action={actions.location} className="space-y-5"><LocationGeographyFields initial={{ countryCode: location.country_code, regionCode: location.region_code, municipalityCode: location.municipality_code, localityCode: location.locality_code, postalCode: location.postal_code, city: location.city, area: location.area }} /><ModalActions panel="location" /></LocationSectionForm></LocationEditorWindow>

    <LocationEditorWindow panel="pricing" title="Capacidad y tarifas" description="Conserva los rangos y reglas actuales."><LocationSectionForm section="pricing" action={actions.pricing} className="space-y-6"><LocationPricingEditor initialCapacity={typeof capacity === "number" ? capacity : null} initialMode={location.rate_mode} initialTiers={location.rate_tiers} initialMinimumHours={location.minimum_hours === null ? null : Number(location.minimum_hours)} legacyPrice={formatLegacyLocationPrice({ priceAmount: numberOrNull(location.price_amount), priceCurrency: location.price_currency, priceUnit: location.price_unit })} /><ModalActions panel="pricing" /></LocationSectionForm></LocationEditorWindow>

    <LocationEditorWindow panel="characteristics" title="Características" description="Selecciona únicamente los atributos que describen el espacio."><LocationSectionForm section="characteristics" action={actions.characteristics} className="space-y-6"><LocationCharacteristicsEditor value={location.characteristics} /><ModalActions panel="characteristics" /></LocationSectionForm></LocationEditorWindow>

    <LocationEditorWindow panel="conditions" title="Condiciones de rodaje" description="Permisos, restricciones y operación de la locación.">
      <div className="space-y-8">
        <section><LocationSectionForm section="conditions" action={actions.conditions} className="space-y-6"><p className="text-sm leading-6 text-white/45">{LOCATION_CONDITIONS_NOTICE}</p><LocationConditionsEditor initialValue={location.shooting_conditions} /><ModalActions panel="conditions" label="Guardar condiciones" /></LocationSectionForm></section>
        <section className="border-t border-white/10 pt-8"><h3 className="mb-4 text-sm font-semibold uppercase tracking-[.14em] text-white/45">Operación</h3><LocationSectionForm section="notes" action={actions.notes} className="space-y-5"><Field label="Restricciones básicas"><textarea name="restrictions" maxLength={10_000} rows={5} defaultValue={location.restrictions ?? ""} className={inputClass} /></Field><Field label="Tarifa y condiciones operativas"><textarea name="operational_notes" maxLength={5_000} rows={5} defaultValue={location.operational_notes ?? ""} className={inputClass} /></Field><ModalActions panel="conditions" label="Guardar operación" /></LocationSectionForm></section>
      </div>
    </LocationEditorWindow>

    <LocationEditorWindow panel="contact" title="Contacto" description="Los datos siguen privados hasta que aceptas una solicitud."><LocationSectionForm section="contact" action={actions.contact} className="space-y-5"><div className="grid gap-5 sm:grid-cols-2"><Field label="Email"><input name="contact_email" type="email" maxLength={254} defaultValue={contact?.email ?? ""} className={inputClass} /></Field><Field label="Teléfono"><input name="contact_phone" type="tel" maxLength={40} defaultValue={contact?.phone ?? ""} className={inputClass} /></Field><Field label="WhatsApp"><input name="contact_whatsapp" maxLength={20} defaultValue={contact?.whatsapp ?? ""} className={inputClass} /></Field><Field label="Instagram"><input name="contact_instagram" maxLength={30} defaultValue={contact?.instagram ?? ""} className={inputClass} /></Field></div><input type="hidden" name="contact_website" value={contact?.website ?? ""} /><ModalActions panel="contact" /></LocationSectionForm></LocationEditorWindow>
  </LocationOwnerEditorShell>;
}

function MediaCard({ icon, title, summary, action, accent = false, children }: { icon: "video" | "images"; title: string; summary: string; action?: React.ReactNode; accent?: boolean; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/10 bg-[#111]/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,.18)] sm:p-5"><div className="mb-4 flex items-start gap-3"><IconBox icon={icon} accent={accent} /><div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-5 text-white/45">{summary}</p></div>{action}</div>{children}</section>;
}

function PanelCard({ panel, icon, title, summary, detail }: { panel: LocationEditorPanelSection; icon: "home" | "pin" | "users" | "sliders" | "shield" | "phone"; title: string; summary: string; detail: string }) {
  return <section className="rounded-2xl border border-white/10 bg-[#111]/90 p-4 transition hover:border-white/20 sm:p-5"><div className="flex items-center gap-4"><IconBox icon={icon} /><div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 truncate text-sm text-white/65">{summary}</p><p className="mt-1 hidden text-xs leading-5 text-white/35 sm:block">{detail}</p></div><LocationPanelButton panel={panel} ariaLabel={`Editar ${title}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 px-3 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white sm:px-5"><span className="hidden sm:inline">Editar</span><LocationEditorIcon name="chevron" /></LocationPanelButton></div></section>;
}

function IconBox({ icon, accent = false }: { icon: "video" | "images" | "home" | "pin" | "users" | "sliders" | "shield" | "phone"; accent?: boolean }) {
  return <span className={`grid size-11 shrink-0 place-items-center rounded-xl border ${accent ? "border-[#ff625f]/25 bg-[#ff625f]/15 text-[#ff7b78]" : "border-white/10 bg-white/[0.055] text-white/80"}`}><LocationEditorIcon name={icon} /></span>;
}

function ModalActions({ panel, label = "Guardar cambios" }: { panel: LocationEditorPanelSection; label?: string }) {
  return <div className="sticky bottom-0 -mx-1 flex justify-end gap-3 border-t border-white/10 bg-[#0d0d0d]/95 px-1 pb-[max(4px,env(safe-area-inset-bottom))] pt-4 backdrop-blur"><LocationModalCancel panel={panel} /><LocationSectionSubmit label={label} /></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm text-white/55">{label}</span>{children}</label>; }

function panelFromActiveSection(section?: string): LocationEditorPanelSection | null {
  if (section === "photos") return "photos";
  if (section === "identity" || section === "description") return "basic";
  if (section === "location" || section === "pricing" || section === "characteristics" || section === "contact") return section;
  if (section === "conditions" || section === "notes") return "conditions";
  return null;
}

function tourSummary(tour: OwnerLocationTour | null, legacyUrl: string | null) {
  if (tour && ["authorizing", "uploading", "processing"].includes(tour.status)) return "Procesando un nuevo recorrido";
  if (tour?.isActive || legacyUrl) return tour?.durationSeconds ? `Listo · ${formatDuration(tour.durationSeconds)}` : "Recorrido listo";
  return "Sin recorrido · opcional";
}

function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")} min`; }

function locationSummary(location: OwnerEditableLocation) {
  const parts = [location.region_name, location.municipality_name || location.city, location.postal_code ? `C.P. ${location.postal_code}` : null, location.area].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Ubicación por completar";
}

function characteristicsSummary(location: OwnerEditableLocation) {
  const count = Object.entries(location.characteristics).filter(([key, value]) => key !== "declared_capacity" && value !== null && value !== "" && value !== false).length;
  return count ? `${count} ${count === 1 ? "atributo configurado" : "atributos configurados"}` : "Sin atributos especificados";
}

function contactSummary(contact: EditableLocationContact | null) {
  const channels = [contact?.whatsapp ? "WhatsApp" : null, contact?.email ? "correo" : null, contact?.phone ? "teléfono" : null, contact?.instagram ? "Instagram" : null].filter(Boolean);
  return channels.length ? `${channels.join(" y ")} configurados` : "Contacto por configurar";
}

function shortText(value: string | null | undefined) { const text = value?.trim(); return text && text.length > 120 ? `${text.slice(0, 117)}…` : text ?? ""; }

function pricingSummary(location: OwnerEditableLocation) {
  const capacity = location.characteristics.declared_capacity;
  const capacityText = typeof capacity === "number" ? `Hasta ${capacity} personas` : "Capacidad por especificar";
  if (location.rate_mode === "inquire") return `${capacityText} · Consultar tarifa`;
  if (location.rate_mode === "tiers" && location.rate_tiers.length) return `${capacityText} · ${location.rate_tiers.length} ${location.rate_tiers.length === 1 ? "rango" : "rangos"}`;
  const legacy = formatLegacyLocationPrice({ priceAmount: numberOrNull(location.price_amount), priceCurrency: location.price_currency, priceUnit: location.price_unit });
  return `${capacityText} · ${legacy}`;
}

function numberOrNull(value: number | string | null) { const parsed = Number(value); return value === null || !Number.isFinite(parsed) ? null : parsed; }

const cardActionClass = "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-semibold text-white/75 transition hover:bg-white/[0.06] hover:text-white";
const inputClass = "w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3 text-white outline-none transition focus:border-white/35";
