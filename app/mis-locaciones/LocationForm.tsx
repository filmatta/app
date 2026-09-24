import Link from "next/link";
import LocationCharacteristicsEditor from "@/components/locations/LocationCharacteristicsEditor";
import LocationConditionsEditor from "@/components/locations/LocationConditionsEditor";
import LocationPhotoManager, { type OwnerLocationPhoto } from "@/components/locations/LocationPhotoManager";
import LocationPricingEditor from "@/components/locations/LocationPricingEditor";
import LocationTourRecorder from "@/components/locations/LocationTourRecorder";
import styles from "@/components/locations/locations.module.css";
import type { LocationCharacteristics } from "@/lib/locations/characteristics";
import { LOCATION_CONDITIONS_NOTICE, type LocationConditions } from "@/lib/locations/conditions";
import {
  LOCATION_ENVIRONMENTS,
  type LocationEnvironment,
  type LocationPriceUnit,
  type LocationStatus,
} from "@/lib/locations/form";
import { formatLegacyLocationPrice } from "@/lib/locations/format";
import type { LocationRateMode, LocationRateTier } from "@/lib/locations/pricing";
import type { OwnerLocationTour } from "@/lib/locations/tour-types";
import LocationFormButtons from "./LocationFormButtons";
import LocationIdentityFields from "./LocationIdentityFields";
import LocationFormShell from "./LocationFormShell";

export type EditableLocation = {
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  city: string;
  area: string | null;
  space_type: string;
  environment: LocationEnvironment;
  price_amount: number | string | null;
  price_currency: string | null;
  price_unit: LocationPriceUnit | null;
  rate_mode: LocationRateMode;
  rate_tiers: LocationRateTier[];
  minimum_hours: number | string | null;
  restrictions: string | null;
  characteristics: LocationCharacteristics;
  shooting_conditions: LocationConditions;
  tour_video_url: string | null;
  operational_notes: string | null;
  status: LocationStatus;
};

export type EditableLocationContact = {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
};

export default function LocationForm({
  action,
  mode,
  location,
  contact,
  photos = [],
  locationId,
  tour,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode: "create" | "edit";
  location?: EditableLocation;
  contact?: EditableLocationContact | null;
  photos?: OwnerLocationPhoto[];
  locationId?: string;
  tour?: OwnerLocationTour | null;
}) {
  return (
    <LocationFormShell action={action} storageKey={`filmatta:location-form:${mode}:${location?.slug ?? "new"}`}>
      <section aria-labelledby="location-basic-heading" className="space-y-7">
        <div className="border-b border-white/10 pb-4">
          <h2 id="location-basic-heading" className="text-xl font-semibold">
            Información principal
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Estos datos identifican la locación en tu panel y en su página
            pública.
          </p>
          <p className="mt-2 text-xs leading-5 text-white/45">
            Nombre, ciudad y tipo de espacio son obligatorios.
          </p>
        </div>

        <LocationIdentityFields
          defaultTitle={location?.title}
          defaultSlug={location?.slug}
          autoGenerateSlug={mode === "create"}
        />

        <Field label="Descripción corta">
          <textarea
            name="summary"
            defaultValue={location?.summary ?? ""}
            maxLength={500}
            rows={3}
            className={inputClass}
            placeholder="Una descripción breve para el catálogo."
          />
        </Field>

        <Field label="Descripción completa">
          <textarea
            name="description"
            defaultValue={location?.description ?? ""}
            maxLength={20_000}
            rows={7}
            className={inputClass}
            placeholder="Describe el espacio, sus características y el tipo de producción que puede recibir."
          />
        </Field>
      </section>

      <section aria-labelledby="location-place-heading" className="space-y-7">
        <div className="border-b border-white/10 pb-4">
          <h2 id="location-place-heading" className="text-xl font-semibold">
            Espacio y zona
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Publica solo una zona aproximada; no necesitas compartir una
            dirección exacta.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Ciudad">
            <input
              name="city"
              required
              maxLength={120}
              defaultValue={location?.city ?? ""}
              className={inputClass}
              placeholder="Ciudad de México"
            />
          </Field>

          <Field label="Zona o área aproximada">
            <input
              name="area"
              maxLength={120}
              defaultValue={location?.area ?? ""}
              className={inputClass}
              placeholder="Coyoacán"
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Tipo de espacio">
            <input
              name="space_type"
              required
              maxLength={120}
              defaultValue={location?.space_type ?? ""}
              className={inputClass}
              placeholder="Casa, estudio, foro…"
            />
          </Field>

          <Field label="Entorno">
            <select
              name="environment"
              defaultValue={location?.environment ?? "both"}
              className={selectClass}
            >
              {LOCATION_ENVIRONMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section aria-labelledby="location-characteristics-heading" className="space-y-7">
        <SectionHeading id="location-characteristics-heading" title="Características" description="Declara únicamente lo que existe en el espacio. Deja vacío lo que no conozcas; una capacidad indicada no representa un aforo certificado." />
        <LocationCharacteristicsEditor value={location?.characteristics} />
      </section>

      <section aria-labelledby="location-price-heading" className="space-y-7">
        <SectionHeading id="location-price-heading" title="Capacidad y tarifas por asistentes" description="La capacidad incluye a todas las personas presentes. Cada importe es el precio total por hora para ese rango; no se multiplica por asistente." />
        <LocationPricingEditor
          initialCapacity={typeof location?.characteristics.declared_capacity === "number" ? location.characteristics.declared_capacity : null}
          initialMode={location?.rate_mode ?? "inquire"}
          initialTiers={location?.rate_tiers ?? []}
          initialMinimumHours={location?.minimum_hours === null || location?.minimum_hours === undefined ? null : Number(location.minimum_hours)}
          legacyPrice={location ? formatLegacyLocationPrice({ priceAmount: numberOrNull(location.price_amount), priceCurrency: location.price_currency, priceUnit: location.price_unit }) : null}
        />
      </section>

      <section aria-labelledby="location-gallery-heading" className="space-y-7">
        <SectionHeading id="location-gallery-heading" title="Portada y galería" description="La primera foto publicada y ordenada funciona como portada; no se duplica el archivo." />
        {locationId ? <LocationPhotoManager locationId={locationId} photos={photos} />
          : <div className={styles.ownerPlaceholder}>Guarda primero la locación. Después podrás subir hasta 20 fotografías reales, elegir portada y ordenar la galería.</div>}
      </section>

      <section aria-labelledby="location-video-heading" className="space-y-7">
        <SectionHeading id="location-video-heading" title="Recorrido con cámara" description="Los recorridos nuevos se graban aquí, en una sola toma. No se admiten archivos ni enlaces nuevos." />
        {locationId && location ? <LocationTourRecorder locationId={locationId} locationTitle={location.title} published={location.status === "published"} initialTour={tour ?? null} />
          : <div className={styles.ownerPlaceholder}>Guarda primero la locación. Después podrás abrir la cámara y grabar un recorrido de hasta 180 segundos.</div>}
        {location?.tour_video_url && !tour?.isActive && <p className="text-xs leading-5 text-white/45">Esta ficha conserva un recorrido externo histórico. No puede editarse ni certificarse como grabado desde FILMATTA; seguirá mostrándose hasta que una grabación nueva quede lista.</p>}
      </section>

      <section aria-labelledby="location-conditions-heading" className="space-y-7">
        <SectionHeading id="location-conditions-heading" title="Condiciones de rodaje" description={LOCATION_CONDITIONS_NOTICE} />
        <LocationConditionsEditor initialValue={location?.shooting_conditions} />
        <p className={styles.contactDisclosure}>Las condiciones que especifiques se mostrarán en la ficha pública cuando publiques la locación.</p>
      </section>

      <section aria-labelledby="location-notes-heading" className="space-y-7">
        <SectionHeading id="location-notes-heading" title="Restricciones y condiciones operativas" description="Aclara restricciones, contratación mínima, horas extra, visita técnica, depósito, seguro, contrato, identificación o limpieza." />
        <Field label="Restricciones básicas"><textarea name="restrictions" defaultValue={location?.restrictions ?? ""} maxLength={10_000} rows={5} className={inputClass} placeholder="Horarios, ruido, acceso de vehículos, humo u otras condiciones." /></Field>
        <Field label="Tarifa y condiciones operativas"><textarea name="operational_notes" defaultValue={location?.operational_notes ?? ""} maxLength={5_000} rows={6} className={inputClass} placeholder="Contratación mínima, horas extra, visita técnica, depósito, seguro, contrato, identificación o limpieza." /></Field>
      </section>

      <section aria-labelledby="location-contact-heading" className="space-y-7">
        <SectionHeading id="location-contact-heading" title="Contacto" description="Añade canales específicos para esta locación. Nunca se completan automáticamente desde tu cuenta o perfil." />
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Email de la locación"><input name="contact_email" type="email" maxLength={254} defaultValue={contact?.email ?? ""} className={inputClass} placeholder="locacion@ejemplo.com" /></Field>
          <Field label="Teléfono"><input name="contact_phone" type="tel" maxLength={40} defaultValue={contact?.phone ?? ""} className={inputClass} placeholder="+52 55 0000 0000" /></Field>
          <Field label="WhatsApp"><input name="contact_whatsapp" inputMode="tel" maxLength={20} defaultValue={contact?.whatsapp ?? ""} className={inputClass} placeholder="+525500000000" /></Field>
          <Field label="Instagram"><input name="contact_instagram" maxLength={30} defaultValue={contact?.instagram ?? ""} className={inputClass} placeholder="usuario" /></Field>
        </div>
        <input type="hidden" name="contact_website" value={contact?.website ?? ""} />
        <p className={styles.contactDisclosure}>Estos canales se compartirán únicamente cuando aceptes una solicitud de contacto para esta locación.</p>
      </section>

      <div className="flex flex-col justify-between gap-5 border-t border-white/10 pt-8 md:flex-row md:items-center">
        {mode === "create" ? (
          <LocationFormButtons mode="create" />
        ) : (
          <LocationFormButtons
            mode="edit"
            currentStatus={location?.status ?? "draft"}
          />
        )}
        <Link
          href="/mis-locaciones"
          className="rounded-full px-5 py-3 text-center text-sm text-white/45 transition hover:bg-white/[0.04] hover:text-white"
        >
          Cancelar
        </Link>
      </div>
    </LocationFormShell>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition placeholder:text-white/20 focus:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";

const selectClass =
  "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition focus:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/50">{label}</span>
      {children}
    </label>
  );
}

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return <div className="border-b border-white/10 pb-4"><h2 id={id} className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-white/50">{description}</p></div>;
}

function numberOrNull(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
