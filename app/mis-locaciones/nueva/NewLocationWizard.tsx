"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import LocationGeographyFields from "@/components/locations/LocationGeographyFields";
import LocationPhotoManager, { type OwnerLocationPhoto } from "@/components/locations/LocationPhotoManager";
import LocationStarterPricing from "@/components/locations/LocationStarterPricing";
import {
  LOCATION_ACTIVATION_CONDITION_KEYS,
  LOCATION_ACTIVATION_STEPS,
  LOCATION_SPACE_TYPES,
  locationActivationStep,
  type LocationActivationStep,
} from "@/lib/locations/activation";
import type { LocationCharacteristics } from "@/lib/locations/characteristics";
import {
  LOCATION_CONDITION_LABELS,
  type LocationConditions,
} from "@/lib/locations/conditions";
import { LOCATION_ENVIRONMENTS, type LocationEnvironment } from "@/lib/locations/form";
import type { LocationRateMode, LocationRateTier } from "@/lib/locations/pricing";
import type { EditableLocationContact } from "../LocationForm";
import {
  createLocationActivationDraft,
  saveLocationActivationStep,
} from "./activation-actions";
import styles from "./activation.module.css";

const BASIC_CONDITIONS = [
  ["day_shoots", "Rodajes diurnos"],
  ["night_shoots", "Rodajes nocturnos"],
  ["rearrange_furniture", "Reacomodar mobiliario"],
  ["loud_music", "Música alta"],
  ["cats_dogs", "Perros / gatos"],
] as const;

const STEP_TITLES = [
  "¿Qué espacio quieres publicar?",
  "¿Dónde está tu locación?",
  "¿Cuántas personas caben cómodamente?",
  "¿Cuánto cuesta usar el espacio?",
  "Muéstranos el espacio",
  "Cuéntanos qué tipo de rodaje permites",
  "¿Cómo quieres que te contacten?",
  "Tu locación ya tiene lo esencial",
] as const;

export type ActivationWizardLocation = {
  id: string;
  title: string;
  slug: string;
  city: string;
  area: string | null;
  spaceType: string;
  environment: LocationEnvironment;
  characteristics: LocationCharacteristics;
  conditions: LocationConditions;
  rateMode: LocationRateMode;
  rateTiers: LocationRateTier[];
  minimumHours: number | null;
  countryCode: string | null;
  regionCode: string | null;
  municipalityCode: string | null;
  localityCode: string | null;
  onboardingCompleted: boolean;
  status: string;
};

export default function NewLocationWizard({
  creationKey,
  initialStep,
  location,
  contact = null,
  photos = [],
}: {
  creationKey: string;
  initialStep: LocationActivationStep;
  location?: ActivationWizardLocation;
  contact?: EditableLocationContact | null;
  photos?: OwnerLocationPhoto[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const transitionTimer = useRef<number | null>(null);
  const [step, setStep] = useState<LocationActivationStep>(initialStep);
  const [locationId, setLocationId] = useState(location?.id ?? null);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [photoPending, setPhotoPending] = useState(false);
  const [capacity, setCapacity] = useState(
    typeof location?.characteristics.declared_capacity === "number"
      ? String(location.characteristics.declared_capacity)
      : "",
  );
  const [contactConfigured, setContactConfigured] = useState(Boolean(contact && Object.values(contact).some(Boolean)));
  const [summary, setSummary] = useState(() => getSummary(null, location, photos.filter((photo) => photo.lifecycle === "ready").length, Boolean(contact && Object.values(contact).some(Boolean)), typeof location?.characteristics.declared_capacity === "number" ? String(location.characteristics.declared_capacity) : ""));
  const [pending, startTransition] = useTransition();
  const reducedMotion = useReducedMotion();
  const readyPhotos = photos.filter((photo) => photo.lifecycle === "ready");
  const parsedCapacity = /^[1-9]\d*$/.test(capacity) ? Number(capacity) : null;
  const observePhotoPending = useCallback((value: boolean) => setPhotoPending(value), []);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    setSummary(getSummary(formRef.current, location, readyPhotos.length, contactConfigured, capacity));
  }, [capacity, contactConfigured, location, readyPhotos.length]);

  useEffect(() => {
    const onPopState = () => {
      const requested = locationActivationStep(new URL(window.location.href).searchParams.get("step"));
      if (!requested || (!locationId && requested > 2)) return;
      setDirection(requested < step ? "back" : "forward");
      setStep(requested);
      setPhase("entering");
      window.setTimeout(() => setPhase("idle"), reducedMotion ? 0 : 210);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [locationId, reducedMotion, step]);

  function go(next: LocationActivationStep, replace = false, nextLocationId = locationId) {
    if (next === step || phase !== "idle") return;
    const nextDirection = next > step ? "forward" : "back";
    setDirection(nextDirection);
    setPhase("leaving");
    const delay = reducedMotion ? 0 : 190;
    transitionTimer.current = window.setTimeout(() => {
      setStep(next);
      setPhase("entering");
      updateHistory(next, replace, nextLocationId);
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      window.setTimeout(() => {
        setPhase("idle");
        headingRef.current?.focus({ preventScroll: true });
      }, reducedMotion ? 0 : 210);
    }, delay);
  }

  function updateHistory(next: LocationActivationStep, replace: boolean, nextLocationId = locationId) {
    const params = new URLSearchParams({ step: String(next) });
    if (nextLocationId) params.set("location", nextLocationId);
    else params.set("key", creationKey);
    const url = `/mis-locaciones/nueva?${params.toString()}`;
    window.history[replace ? "replaceState" : "pushState"]({ locationActivationStep: next }, "", url);
  }

  function currentFormData(skip?: "conditions" | "contact") {
    const data = new FormData(formRef.current ?? undefined);
    if (skip) data.set("activation_skip", skip);
    return data;
  }

  function validateCurrent() {
    const section = formRef.current?.querySelector<HTMLElement>(`[data-step-panel="${step}"]`);
    const fields = Array.from(section?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea") ?? []);
    const invalid = fields.find((field) => !field.checkValidity());
    if (!invalid) return true;
    invalid.reportValidity();
    invalid.focus();
    return false;
  }

  function continueFlow(skip?: "conditions" | "contact", exit = false) {
    if (pending || phase !== "idle") return;
    setError("");
    setSaved("");
    if (!skip && step !== 5 && step !== 8 && !validateCurrent()) return;
    if (step === 5 && photoPending) {
      setError("Espera a que las fotos terminen de subirse y verificarse antes de salir de este paso.");
      return;
    }
    if (step === 1 && !locationId) {
      go(2);
      return;
    }
    if (step === 8) return;

    startTransition(async () => {
      const data = currentFormData(skip);
      const result = !locationId
        ? await createLocationActivationDraft(data)
        : await saveLocationActivationStep(locationId, step, data);
      if (!result.ok) {
        setError(result.message);
        focusField(result.field);
        return;
      }
      if (!locationId) setLocationId(result.locationId);
      if (step === 7 && !skip) setContactConfigured(true);
      setSaved("Guardado");
      if (exit) {
        router.push("/mis-locaciones");
        return;
      }
      go(result.nextStep, !locationId, result.locationId);
    });
  }

  function focusField(name?: string) {
    if (!name) return;
    const field = Array.from(formRef.current?.elements ?? []).find((item) => item instanceof HTMLElement && "name" in item && item.name === name);
    if (field instanceof HTMLElement) field.focus();
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="FILMATTA, inicio">FILMATTA</Link>
      <div className={styles.progressMeta}>
        <span>Paso {step} de {LOCATION_ACTIVATION_STEPS}</span>
        <div className={styles.progressTrack} role="progressbar" aria-label="Progreso de creación" aria-valuemin={1} aria-valuemax={8} aria-valuenow={step}>
          <span style={{ width: `${(step / LOCATION_ACTIVATION_STEPS) * 100}%` }} />
        </div>
      </div>
    </header>

    <form ref={formRef} className={styles.form} onChange={(event) => setSummary(getSummary(event.currentTarget, location, readyPhotos.length, contactConfigured, capacity))} onSubmit={(event) => event.preventDefault()}>
      <input type="hidden" name="creation_key" value={creationKey} />
      <section
        className={styles.step}
        data-phase={phase}
        data-direction={direction}
        aria-labelledby="activation-heading"
      >
        <div className={styles.questionHeader}>
          <h1 id="activation-heading" ref={headingRef} tabIndex={-1}>{STEP_TITLES[step - 1]}</h1>
          <p>{stepHelp(step)}</p>
        </div>

        <div data-step-panel="1" hidden={step !== 1}><StepOne location={location} /></div>
        <div data-step-panel="2" hidden={step !== 2}><LocationGeographyFields initial={location ? {
          countryCode: location.countryCode,
          regionCode: location.regionCode,
          municipalityCode: location.municipalityCode,
          localityCode: location.localityCode,
          city: location.city,
          area: location.area,
        } : undefined} /></div>
        <div data-step-panel="3" hidden={step !== 3}><div className={styles.capacityControl}>
          <label htmlFor="activation-capacity">Personas</label>
          <input id="activation-capacity" name="characteristic.declared_capacity" value={capacity} onChange={(event) => setCapacity(event.target.value)} required type="number" min="1" max="1000000" step="1" inputMode="numeric" placeholder="30" />
          <p>Incluye talento, crew, clientes, extras y cualquier persona presente durante el rodaje.</p>
        </div></div>
        <div data-step-panel="4" hidden={step !== 4}><LocationStarterPricing
          key={`${parsedCapacity ?? "empty"}-${location?.rateMode ?? "new"}`}
          capacity={parsedCapacity}
          initialMode={location?.rateMode ?? "tiers"}
          initialTiers={location?.rateTiers ?? []}
          initialMinimumHours={location?.minimumHours ?? null}
        /></div>
        <div data-step-panel="5" hidden={step !== 5}>{locationId && <div className={styles.photoStep}>
          <LocationPhotoManager locationId={locationId} photos={photos} onPendingChange={observePhotoPending} />
          <p>Puedes subir hasta 20 fotos. Podrás ordenarlas y agregar más después.</p>
        </div>}</div>
        <div data-step-panel="6" hidden={step !== 6}><StepConditions conditions={location?.conditions ?? {}} /></div>
        <div data-step-panel="7" hidden={step !== 7}><StepContact contact={contact} /></div>
        <div data-step-panel="8" hidden={step !== 8}>{locationId && <StepSummary summary={summary} locationId={locationId} edit={go} />}</div>

        {error && <p ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>{error}</p>}
        {(pending || saved) && <p role="status" aria-live="polite" className={styles.saveStatus}>{pending ? "Guardando…" : saved}</p>}

        {step < 8 && <div className={styles.secondaryActions}>
          {locationId && step >= 2 && <button type="button" disabled={pending || phase !== "idle"} onClick={() => continueFlow(undefined, true)}>Guardar y salir</button>}
          {step === 5 && <button type="button" disabled={pending || photoPending} onClick={() => continueFlow()}>Omitir por ahora</button>}
          {step === 6 && <button type="button" disabled={pending} onClick={() => continueFlow("conditions")}>Omitir por ahora</button>}
          {step === 7 && <button type="button" disabled={pending} onClick={() => continueFlow("contact")}>Omitir por ahora</button>}
        </div>}
      </section>

      {step < 8 && <footer className={styles.footer}>
        <button type="button" className={styles.back} disabled={step === 1 || pending || phase !== "idle"} onClick={() => go((step - 1) as LocationActivationStep)}>Atrás</button>
        <button type="button" className={styles.continue} disabled={pending || phase !== "idle" || (step === 5 && photoPending)} onClick={() => continueFlow()}>{pending ? "Guardando…" : "Continuar"}</button>
      </footer>}
    </form>
  </main>;
}

function StepOne({ location }: { location?: ActivationWizardLocation }) {
  return <div className="space-y-8">
    <label className={styles.field}>
      <span>Nombre de la locación</span>
      <input name="title" required maxLength={160} defaultValue={location?.title ?? ""} placeholder="Casa con jardín en Zapopan" autoComplete="off" />
      <small>Podrás cambiar estos datos después.</small>
    </label>
    <fieldset className={styles.cardFieldset}>
      <legend>Tipo de espacio</legend>
      <div className={styles.cardGrid}>{LOCATION_SPACE_TYPES.map((type) => <label key={type} className={styles.selectCard}>
        <input type="radio" name="space_type" value={type} defaultChecked={(location?.spaceType ?? "") === type} required />
        <span>{type}</span>
      </label>)}</div>
    </fieldset>
    <fieldset className={styles.cardFieldset}>
      <legend>Entorno</legend>
      <div className={styles.environmentGrid}>{LOCATION_ENVIRONMENTS.map((option) => <label key={option.value} className={styles.selectCard}>
        <input type="radio" name="environment" value={option.value} defaultChecked={(location?.environment ?? "both") === option.value} required />
        <span>{option.label}</span>
      </label>)}</div>
    </fieldset>
  </div>;
}

function StepConditions({ conditions }: { conditions: LocationConditions }) {
  return <div className={styles.conditionList}>
    {BASIC_CONDITIONS.map(([key, label]) => <fieldset key={key}>
      <legend>{label}</legend>
      <div>{[["yes", "Sí"], ["consult", "Consultar"], ["no", "No"], ["", "Sin especificar"]].map(([value, text]) => <label key={value || "unset"}>
        <input type="radio" name={`condition.${key}`} value={value} defaultChecked={(conditions[key] ?? "") === value} />
        <span>{text}</span>
      </label>)}</div>
    </fieldset>)}
    <p className={styles.note}>Estas son sólo las más comunes. Podrás configurar todas las condiciones después.</p>
  </div>;
}

function StepContact({ contact }: { contact: EditableLocationContact | null }) {
  return <div className={styles.contactGrid}>
    <label className={styles.field}><span>Email</span><input name="contact_email" type="email" maxLength={254} defaultValue={contact?.email ?? ""} placeholder="locacion@ejemplo.com" /></label>
    <label className={styles.field}><span>Teléfono</span><input name="contact_phone" type="tel" maxLength={40} defaultValue={contact?.phone ?? ""} placeholder="+52 55 0000 0000" /></label>
    <label className={styles.field}><span>WhatsApp</span><input name="contact_whatsapp" inputMode="tel" maxLength={20} defaultValue={contact?.whatsapp ?? ""} placeholder="+525500000000" /></label>
    <label className={styles.field}><span>Instagram</span><input name="contact_instagram" maxLength={30} defaultValue={contact?.instagram ?? ""} placeholder="usuario" /></label>
    <label className={`${styles.field} ${styles.contactWide}`}><span>Sitio web</span><input name="contact_website" type="url" maxLength={500} defaultValue={contact?.website ?? ""} placeholder="https://ejemplo.com" /></label>
    <p className={`${styles.note} ${styles.contactWide}`}>Tus datos no se muestran públicamente. Sólo se compartirán cuando aceptes una solicitud.</p>
    <p className={`${styles.warning} ${styles.contactWide}`}>Mientras no configures un canal válido, no podrán enviarte nuevas solicitudes por esta locación.</p>
  </div>;
}

function StepSummary({
  summary,
  locationId,
  edit,
}: {
  summary: ReturnType<typeof getSummary>;
  locationId: string;
  edit: (step: LocationActivationStep) => void;
}) {
  const rows: Array<[string, string, LocationActivationStep]> = [
    ["Nombre", summary.title, 1],
    ["Tipo", summary.spaceType, 1],
    ["Ubicación", summary.location, 2],
    ["Capacidad", summary.capacity, 3],
    ["Tarifa", summary.rate, 4],
    ["Fotos", `${summary.photos} listas`, 5],
    ["Condiciones básicas", `${summary.conditions} configuradas`, 6],
    ["Contacto", summary.contact ? "Configurado" : "Pendiente", 7],
  ];
  return <div className={styles.summary}>
    {rows.map(([label, value, target]) => <div key={label}><span><small>{label}</small><strong>{value || "Pendiente"}</strong></span><button type="button" onClick={() => edit(target)}>Editar</button></div>)}
    <p>Desde tu ficha podrás completar características, condiciones, fotos y recorrido.</p>
    <Link className={styles.ownerCta} href={`/mis-locaciones/${locationId}/editar`}>Ver mi locación</Link>
  </div>;
}

function stepHelp(step: LocationActivationStep) {
  return [
    "Empecemos por una identidad clara para tu espacio.",
    "En público mostraremos sólo la ubicación aproximada.",
    "No es un aforo certificado; indica una capacidad cómoda para producción.",
    "Podrás ajustar tarifas y condiciones después.",
    "Las fotos son opcionales en este momento.",
    "Responde sólo lo que ya sabes.",
    "Nunca importamos datos automáticamente desde tu cuenta o perfil.",
    "El borrador sigue privado hasta que decidas publicarlo desde su ficha.",
  ][step - 1];
}

function getSummary(
  form: HTMLFormElement | null,
  location: ActivationWizardLocation | undefined,
  photos: number,
  contact: boolean,
  capacity: string,
) {
  const data = form ? new FormData(form) : null;
  const mode = String(data?.get("rate_mode") ?? location?.rateMode ?? "");
  const firstPrice = String(data?.get("rate_tier_0_price") ?? location?.rateTiers[0]?.price ?? "");
  const conditionCount = LOCATION_ACTIVATION_CONDITION_KEYS.filter((key) => {
    const value = String(data?.get(`condition.${key}`) ?? location?.conditions[key] ?? "");
    return value in LOCATION_CONDITION_LABELS;
  }).length;
  const localitySelect = form?.elements.namedItem("locality_code");
  const locality = localitySelect instanceof HTMLSelectElement
    ? localitySelect.selectedOptions[0]?.textContent?.split(" · ")[0] ?? ""
    : location?.city ?? "";
  const area = String(data?.get("area") ?? location?.area ?? "");
  const currentCapacity = String(data?.get("characteristic.declared_capacity") ?? capacity);
  return {
    title: String(data?.get("title") ?? location?.title ?? ""),
    spaceType: String(data?.get("space_type") ?? location?.spaceType ?? ""),
    location: [area, locality].filter(Boolean).join(" · "),
    capacity: currentCapacity ? `${currentCapacity} personas` : "Pendiente",
    rate: mode === "inquire" ? "Consultar" : firstPrice ? `$${firstPrice} MXN / h` : location?.rateTiers.length ? "Tarifas por rangos" : "Pendiente",
    photos,
    conditions: conditionCount,
    contact,
  };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}
