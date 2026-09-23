"use client";
import FilmattaAccordion from "@/components/ui/FilmattaAccordion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AVAILABILITY_LABELS } from "@/lib/profiles/constants";
import {
  quickPreference,
  orderedDisciplines,
  validateOnboardingStep,
  type ProfileIntent,
} from "@/lib/profiles/activation";
import {
  PROFILE_PREFERENCE_CATEGORIES,
  PROJECT_FORMATS,
  parseProjectPreferences,
  EMPTY_PREFERENCES,
  preferenceCategoryCount,
  type PreferenceGroup,
} from "@/lib/profiles/project-preferences";
import { professionalName } from "@/lib/profiles/presentation";
import type { ProfessionalProfile } from "@/lib/profiles/types";
import { activationEvent } from "@/lib/profiles/activation-events";
import ProfileAvatar from "@/components/profiles/ProfileAvatar";
import IdentityImage from "@/components/profiles/IdentityImage";
import SelectionRow from "@/components/ui/SelectionRow";
import ProfileDetailIcon from "@/components/profiles/ProfileDetailIcon";
import IdentityImageEditor, {
  type IdentityImageHandle,
} from "@/app/mi-perfil/IdentityImageEditor";
import { saveOnboarding } from "./actions";
import "@/components/profiles/portfolio-editor.css";
import "./onboarding.css";
const titles = [
  "",
  "¿Cómo quieres aparecer en FILMATTA?",
  "¿Qué haces en la industria?",
  "Tu foto de perfil",
  "¿Dónde trabajas?",
  "Cuéntanos brevemente sobre ti.",
  "¿Cuál es tu disponibilidad?",
  "¿En qué condiciones te interesa trabajar?",
  "Personaliza tu perfil",
  "Tu perfil ya tiene lo esencial.",
];
export default function Onboarding({
  profile: initial,
  intent,
  initialStep,
  identity,
  preferences,
}: {
  profile: ProfessionalProfile | null;
  intent: ProfileIntent;
  initialStep: number;
  identity: { name?: string };
  preferences: unknown;
}) {
  const [profile, setProfile] = useState(initial),
    [step, setStep] = useState(initialStep),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [disciplineError, setDisciplineError] = useState("");
  const [values, setValues] = useState({
    name: initial ? professionalName(initial) : (identity.name ?? ""),
    disciplines: initial?.disciplines ?? [],
    city: initial?.city ?? "",
    work_area: initial?.presentation.work_area ?? "",
    bio: initial?.bio ?? "",
    availability: initial?.availability ?? "not_specified",
  });
  const [prefs, setPrefs] = useState(
    () => parseProjectPreferences(preferences) ?? EMPTY_PREFERENCES,
  );
  const [changedPreferences, setChangedPreferences] = useState<
      Partial<Record<PreferenceGroup, Record<string, string>>>
    >({}),
    [formatsChanged, setFormatsChanged] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    started = useRef(false),
    inFlight = useRef(false),
    imageEditor = useRef<IdentityImageHandle>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!started.current && initialStep === 1) {
      started.current = true;
      activationEvent("profile_onboarding_started", intent ?? undefined);
    }
  }, [initialStep, intent]);
  function patch(): Record<string, unknown> {
    switch (step) {
      case 1:
        return { name: values.name };
      case 2:
        return { disciplines: values.disciplines };
      case 4:
        return { city: values.city, work_area: values.work_area };
      case 5:
        return { bio: values.bio };
      case 6:
        return { availability: values.availability };
      case 7:
        return {
          ...(formatsChanged ? { formats: prefs.formats } : {}),
          ...changedPreferences,
        };
      default:
        return {};
    }
  }
  async function next(skip = false, publish = false) {
    if (inFlight.current) return;
    const p = publish ? { publish: true } : skip ? {} : patch(),
      invalid = validateOnboardingStep(step, p);
    if (invalid) {
      setError(invalid);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (
        !skip &&
        (step === 3 || step === 8) &&
        imageEditor.current &&
        !(await imageEditor.current.save())
      )
        return;
      const r = await saveOnboarding(step, p);
      if ("error" in r) {
        setError(r.error!);
        return;
      }
      setProfile(r.profile);
      activationEvent(
        publish
          ? "profile_published_from_onboarding"
          : skip
            ? "profile_onboarding_skipped"
            : "profile_onboarding_step_completed",
        step,
      );
      if (step === 8) activationEvent("profile_onboarding_completed");
      if (!publish) setStep((s) => Math.min(9, s + 1));
    } catch {
      setError("No se pudo conectar. Tus pasos anteriores siguen guardados.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const disciplines = Array.from(
    new Set([...orderedDisciplines(intent), ...values.disciplines]),
  );
  return (
    <main className="activation-flow">
      <header>
        <Link href="/" className="activation-brand">
          FILMATTA
        </Link>
        <Link href="/cuenta">Salir y continuar después ↗</Link>
      </header>
      <div className="activation-progress">
        <span>
          {step} de 9{step === 9 ? " · Lo esencial, listo" : ""}
        </span>
        <progress aria-label="Progreso del onboarding" value={step} max={9} />
      </div>
      <section className="activation-question">
        <p className="eyebrow">TU PRESENCIA PROFESIONAL</p>
        <h1 ref={heading} tabIndex={-1}>
          {titles[step]}
        </h1>
        {step !== 1 && (
          <p className="activation-intro">
            {step === 9
              ? profile?.is_public
                ? "Revisa tu perfil o sigue personalizándolo."
                : "Puedes publicarlo ahora o seguir trabajando en tu borrador privado."
              : step === 7
                ? "Marca las opciones que te funcionan actualmente."
                : "Empieza por lo esencial. Tu trabajo y portfolio pueden llegar después."}
          </p>
        )}
        <form onSubmit={(e) => e.preventDefault()}>
          <fieldset disabled={busy}>
            {step === 1 && (
              <label>
                Nombre público
                <input
                  value={values.name}
                  maxLength={80}
                  autoComplete="nickname"
                  onChange={(e) =>
                    setValues((v) => ({ ...v, name: e.target.value }))
                  }
                />
              </label>
            )}
            {step === 2 && (
              <>
                <p className="activation-hint">
                  Selecciona de una a cinco. Puedes combinar talento y equipo
                  técnico.
                </p>
                <p className="activation-hint">Puedes seleccionar hasta 5 disciplinas.</p>
                <p role="status">{values.disciplines.length} de 5 seleccionadas</p>
                {disciplineError && <p role="alert">{disciplineError}</p>}
                <div className="activation-options">
                  {disciplines.map((d) => (
                    <SelectionRow
                      key={d}
                      checked={values.disciplines.includes(d)}
                      onChange={(e) => {
                        if (e.target.checked && values.disciplines.length >= 5) {
                          setDisciplineError("Ya seleccionaste 5 disciplinas. Quita una para agregar otra.");
                          return;
                        }
                        setDisciplineError("");
                        setValues((v) => ({
                          ...v,
                          disciplines: e.target.checked
                            ? [...v.disciplines, d]
                            : v.disciplines.filter((x) => x !== d),
                        }));
                      }}
                    >
                      {d}
                    </SelectionRow>
                  ))}
                </div>
              </>
            )}
            {(step === 3 || step === 8) && profile && (
              <IdentityImageEditor
                key={step}
                kind={step === 3 ? "portrait" : "cover"}
                id={
                  step === 3
                    ? profile.presentation.portrait_media_id
                    : profile.presentation.cover_media_id
                }
                fallbackUrl={
                  step === 3 ? profile.presentation.portrait_url : undefined
                }
                name={professionalName(profile)}
                continueRef={imageEditor}
                done={(s) => setProfile(s.profile)}
              />
            )}
            {step === 4 && (
              <>
                <label>
                  Ciudad
                  <input
                    value={values.city}
                    maxLength={80}
                    placeholder="Guadalajara"
                    autoComplete="address-level2"
                    onChange={(e) =>
                      setValues((v) => ({ ...v, city: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Zona / área de trabajo · opcional
                  <input
                    value={values.work_area}
                    maxLength={80}
                    placeholder="Zona Poniente"
                    onChange={(e) =>
                      setValues((v) => ({ ...v, work_area: e.target.value }))
                    }
                  />
                </label>
                <p className="activation-hint">
                  Sólo una referencia aproximada. No necesitamos tu domicilio.
                </p>
              </>
            )}
            {step === 5 && (
              <>
                <label>
                  Bio · opcional
                  <textarea
                    rows={5}
                    maxLength={1200}
                    value={values.bio}
                    placeholder="Actriz en Guadalajara con experiencia en cortometrajes, publicidad y teatro."
                    onChange={(e) =>
                      setValues((v) => ({ ...v, bio: e.target.value }))
                    }
                  />
                </label>
                <p className="activation-hint">
                  {values.bio.length}/1200 · Tu experiencia y el trabajo que te
                  interesa hacer.
                </p>
              </>
            )}
            {step === 6 && (
              <div className="activation-options activation-options--vertical">
                {(["available", "limited", "unavailable"] as const).map((a) => (
                  <SelectionRow
                    type="radio"
                    name="availability"
                    key={a}
                    checked={values.availability === a}
                    onChange={() =>
                      setValues((v) => ({ ...v, availability: a }))
                    }
                  >
                    <span
                      className={`availability-dot availability-dot--${a}`}
                    />
                    {AVAILABILITY_LABELS[a]}
                  </SelectionRow>
                ))}
              </div>
            )}
            {step === 7 && (
              <>
                <p className="activation-hint">
                  Las preferencias que configures se mostrarán en tu perfil público. Deja sin especificar aquellas que no quieras mostrar.
                </p>
                {PROFILE_PREFERENCE_CATEGORIES.map((category) => <FilmattaAccordion
                  key={category.key}
                  title={category.title}
                  icon={<ProfileDetailIcon kind={category.icon} />}
                  summary={`${preferenceCategoryCount(category, prefs)} respondidas`}
                  closedLabel="Ver opciones"
                  openLabel="Ocultar opciones"
                >
                  {category.format ? <div className="activation-options">
                    {PROJECT_FORMATS.map((format) => <SelectionRow
                      key={format}
                      checked={prefs.formats.includes(format)}
                      onChange={(event) => {
                        setFormatsChanged(true);
                        setPrefs((current) => ({ ...current, formats: event.target.checked ? [...current.formats, format] : current.formats.filter((item) => item !== format) }));
                      }}
                    >{format}</SelectionRow>)}
                  </div> : category.sections.map((section, index) => <section className="preference-subgroup" key={section.title ?? index}>
                    {section.title && <h3>{section.title}</h3>}
                    <div className="activation-options">{section.options.map((item) => <SelectionRow
                      key={item.key}
                      checked={prefs[item.group][item.key] === "accept"}
                      onChange={(event) => {
                        const choice = quickPreference(event.target.checked);
                        setChangedPreferences((current) => ({ ...current, [item.group]: { ...current[item.group], [item.key]: choice } }));
                        setPrefs((current) => ({ ...current, [item.group]: { ...current[item.group], [item.key]: choice } }));
                      }}
                    >
                      {item.label}
                      {["consult", "decline"].includes(prefs[item.group][item.key]) && <small> · Preferencia avanzada conservada</small>}
                    </SelectionRow>)}</div>
                  </section>)}
                  {category.help && <p className="activation-hint">{category.help}</p>}
                </FilmattaAccordion>)}
                <p className="activation-hint">
                  Puedes elegir Consultar o No después, en Editar preferencias de proyectos. Las respuestas avanzadas existentes se conservan mientras no las cambies.
                </p>
              </>
            )}
            {step === 9 && profile && (
              <>
                <div className="activation-summary-cover">
                  {profile.presentation.cover_media_id ? (
                    <IdentityImage
                      id={profile.presentation.cover_media_id}
                      alt="Portada elegida"
                      eager
                    />
                  ) : (
                    <div className="activation-cover-neutral">
                      <span>FILMATTA</span>
                      <small>Tu próxima historia</small>
                    </div>
                  )}
                </div>
                <div className="activation-summary">
                  <ProfileAvatar
                    id={profile.presentation.portrait_media_id}
                    fallbackUrl={profile.presentation.portrait_url}
                    name={professionalName(profile)}
                  />
                  <div>
                    <h2>{professionalName(profile)}</h2>
                    <p>{profile.disciplines.join(" · ")}</p>
                    <p>
                      {profile.city} ·{" "}
                      {AVAILABILITY_LABELS[profile.availability]}
                    </p>
                  </div>
                </div>
                <p role="status">
                  {profile.is_public
                    ? "Tu perfil es público."
                    : "Tu perfil sigue siendo un borrador privado."}
                </p>
                {!profile.is_public && (
                  <div className="activation-publish">
                    <p>Tu perfil será visible en FILMATTA.</p>
                    <button
                      type="button"
                      className="activation-primary"
                      onClick={() => void next(false, true)}
                    >
                      Publicar perfil
                    </button>
                  </div>
                )}
                <div className="activation-actions">
                  <Link
                    className="activation-primary"
                    href={
                      profile.is_public
                        ? `/perfiles/${profile.slug}`
                        : "/mi-perfil"
                    }
                  >
                    Ver mi perfil
                  </Link>
                  <Link href="/mi-perfil">Seguir completándolo →</Link>
                </div>
              </>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="activation-error">
              {error}
            </p>
          )}
          {step < 9 && (
            <div className="activation-actions">
              {step > 1 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep((s) => s - 1);
                    setError("");
                  }}
                >
                  ← Atrás
                </button>
              )}
              <button
                className="activation-primary"
                type="button"
                disabled={busy}
                onClick={() => void next()}
              >
                {busy ? "Guardando…" : "Continuar"}
              </button>
              {[3, 5, 7, 8].includes(step) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void next(true)}
                >
                  Omitir por ahora
                </button>
              )}
            </div>
          )}
        </form>
        {step === 9 && (
          <button
            className="activation-back"
            type="button"
            onClick={() => setStep(1)}
          >
            Revisar mis respuestas
          </button>
        )}
        <p className="activation-saved">
          Cada paso confirmado queda guardado. Puedes volver cuando quieras.
        </p>
      </section>
    </main>
  );
}
