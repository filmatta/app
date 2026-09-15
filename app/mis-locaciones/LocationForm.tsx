import Link from "next/link";
import {
  LOCATION_ENVIRONMENTS,
  LOCATION_PRICE_UNITS,
  type LocationEnvironment,
  type LocationPriceUnit,
  type LocationStatus,
} from "@/lib/locations/form";
import LocationFormButtons from "./LocationFormButtons";
import LocationIdentityFields from "./LocationIdentityFields";

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
  restrictions: string | null;
  status: LocationStatus;
};

export default function LocationForm({
  action,
  mode,
  location,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode: "create" | "edit";
  location?: EditableLocation;
}) {
  return (
    <form action={action} className="mt-12 space-y-12">
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

      <section aria-labelledby="location-price-heading" className="space-y-7">
        <div className="border-b border-white/10 pb-4">
          <h2 id="location-price-heading" className="text-xl font-semibold">
            Tarifa orientativa
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Completa los tres campos o déjalos vacíos. FILMATTA no gestiona el
            pago en esta etapa.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <Field label="Importe">
            <input
              name="price_amount"
              type="number"
              inputMode="decimal"
              min="0"
              max="9999999999.99"
              step="0.01"
              defaultValue={location?.price_amount ?? ""}
              className={inputClass}
              placeholder="5000"
            />
          </Field>

          <Field label="Moneda">
            <input
              name="price_currency"
              maxLength={3}
              defaultValue={location?.price_currency ?? ""}
              className={`${inputClass} uppercase`}
              placeholder="MXN"
              autoComplete="off"
            />
          </Field>

          <Field label="Unidad">
            <select
              name="price_unit"
              defaultValue={location?.price_unit ?? ""}
              className={selectClass}
            >
              <option value="">Seleccionar</option>
              {LOCATION_PRICE_UNITS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section aria-labelledby="location-notes-heading" className="space-y-7">
        <div className="border-b border-white/10 pb-4">
          <h2 id="location-notes-heading" className="text-xl font-semibold">
            Restricciones y notas
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Añade las condiciones básicas que una producción debería conocer.
          </p>
        </div>

        <Field label="Restricciones básicas">
          <textarea
            name="restrictions"
            defaultValue={location?.restrictions ?? ""}
            maxLength={10_000}
            rows={5}
            className={inputClass}
            placeholder="Horarios, ruido, acceso de vehículos, humo u otras condiciones."
          />
        </Field>
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
    </form>
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
