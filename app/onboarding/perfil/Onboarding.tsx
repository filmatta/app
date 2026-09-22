"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AVAILABILITY_LABELS } from "@/lib/profiles/constants";
import {
  orderedDisciplines,
  validateOnboardingStep,
  type ProfileIntent,
} from "@/lib/profiles/activation";
import { professionalName } from "@/lib/profiles/presentation";
import type { ProfessionalProfile } from "@/lib/profiles/types";
import { activationEvent } from "@/lib/profiles/activation-events";
import ProfileAvatar from "@/components/profiles/ProfileAvatar";
import IdentityImageEditor from "@/app/mi-perfil/IdentityImageEditor";
import { saveOnboarding } from "./actions";
import "@/components/profiles/portfolio-editor.css";
import "./onboarding.css";
const titles = [
  "",
  "¿Cómo quieres aparecer en FILMATTA?",
  "¿Qué haces en la industria?",
  "¿Dónde trabajas?",
  "Cuéntanos brevemente sobre ti.",
  "¿Cuál es tu disponibilidad?",
  "¿Qué condiciones te funcionan?",
  "Tu perfil ya tiene lo esencial.",
];
export default function Onboarding({
  profile: initial,
  intent,
  initialStep,
  identity,
  conditions,
  preferencesPublic,
}: {
  profile: ProfessionalProfile | null;
  intent: ProfileIntent;
  initialStep: number;
  identity: { name?: string; alias?: string };
  conditions: Record<string, string>;
  preferencesPublic: boolean;
}) {
  const [profile, setProfile] = useState(initial),
    [step, setStep] = useState(initialStep),
    [photo, setPhoto] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [values, setValues] = useState({
    name: initial ? professionalName(initial) : (identity.name ?? ""),
    alias: identity.alias ?? "",
    disciplines: initial?.disciplines ?? [],
    city: initial?.city ?? "",
    work_area: initial?.presentation.work_area ?? "",
    bio: initial?.bio ?? "",
    availability: initial?.availability ?? "not_specified",
    night: conditions.night ?? "unspecified",
    travel: conditions.travel ?? "unspecified",
  });
  const heading = useRef<HTMLHeadingElement>(null),
    started = useRef(false);
  useEffect(() => {
    heading.current?.focus();
  }, [step, photo]);
  useEffect(() => {
    if (!started.current && initialStep === 1) {
      started.current = true;
      activationEvent("profile_onboarding_started", intent ?? undefined);
    }
  }, [initialStep, intent]);
  function patch() {
    switch (step) {
      case 1:
        return { name: values.name, alias: values.alias };
      case 2:
        return { disciplines: values.disciplines };
      case 3:
        return { city: values.city, work_area: values.work_area };
      case 4:
        return { bio: values.bio };
      case 5:
        return { availability: values.availability };
      default:
        return { night: values.night, travel: values.travel };
    }
  }
  async function next(skip = false, publish = false) {
    if (busy) return;
    if (photo) {
      setPhoto(false);
      setStep(3);
      return;
    }
    const p = publish ? { publish: true } : skip ? {} : patch();
    const invalid = skip ? null : validateOnboardingStep(step, p);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    try {
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
      if (step === 6) activationEvent("profile_onboarding_completed");
      if (!publish) {
        if (step === 2) setPhoto(true);
        else setStep((s) => Math.min(7, s + 1));
      }
    } catch {
      setError("No se pudo conectar. Tus pasos anteriores siguen guardados.");
    } finally {
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
        <Link href="/mi-perfil">Salir y continuar después ↗</Link>
      </header>
      <div className="activation-progress">
        <span>
          {step === 7
            ? "Lo esencial, listo"
            : `${step} de 6${photo ? " · Foto opcional" : ""}`}
        </span>
        <progress
          aria-label="Progreso del onboarding"
          value={Math.min(step - 1, 6)}
          max={6}
        />
      </div>
      <section className="activation-question">
        <p className="eyebrow">TU PRESENCIA PROFESIONAL</p>
        <h1 ref={heading} tabIndex={-1}>
          {photo ? "Ponle rostro a tu perfil." : titles[step]}
        </h1>
        <p className="activation-intro">
          {step === 7
            ? "Puedes publicarlo ahora o seguir trabajando en tu borrador privado."
            : photo
              ? "La foto es opcional. Puedes subirla ahora o hacerlo más adelante."
              : "Empieza por lo esencial. Tu trabajo y portfolio pueden llegar después."}
        </p>
        <form
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement)
              e.preventDefault();
          }}
        >
          <fieldset disabled={busy}>
            {photo && profile ? (
              <IdentityImageEditor
                kind="portrait"
                id={profile.presentation.portrait_media_id}
                fallbackUrl={profile.presentation.portrait_url}
                done={(s) => setProfile(s.profile)}
              />
            ) : (
              <>
                {step === 1 && (
                  <>
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
                    <p className="activation-hint">
                      Puede ser tu nombre profesional o artístico. Será el
                      nombre visible de tu perfil.
                    </p>
                    <label>
                      Alias / nombre artístico alternativo · opcional
                      <input
                        value={values.alias}
                        maxLength={80}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, alias: e.target.value }))
                        }
                      />
                    </label>
                    <p className="activation-hint">
                      Lo conservamos como referencia privada; no añade un
                      segundo nombre al perfil público.
                    </p>
                    <p className="activation-hint">
                      Podrás añadir tu foto después de elegir tus disciplinas.
                    </p>
                  </>
                )}
                {step === 2 && (
                  <>
                    <p className="activation-hint">
                      Selecciona de una a cinco. Puedes combinar talento y
                      equipo técnico.
                    </p>
                    <div className="activation-options">
                      {disciplines.map((d) => (
                        <label
                          key={d}
                          className={
                            values.disciplines.includes(d) ? "selected" : ""
                          }
                        >
                          <input
                            type="checkbox"
                            checked={values.disciplines.includes(d)}
                            disabled={
                              !values.disciplines.includes(d) &&
                              values.disciplines.length >= 5
                            }
                            onChange={(e) =>
                              setValues((v) => ({
                                ...v,
                                disciplines: e.target.checked
                                  ? [...v.disciplines, d]
                                  : v.disciplines.filter((x) => x !== d),
                              }))
                            }
                          />
                          {d}
                        </label>
                      ))}
                    </div>
                  </>
                )}
                {step === 3 && (
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
                          setValues((v) => ({
                            ...v,
                            work_area: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <p className="activation-hint">
                      Sólo una referencia aproximada. No necesitamos tu
                      domicilio.
                    </p>
                  </>
                )}
                {step === 4 && (
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
                      {values.bio.length}/1200 · Tu experiencia y el trabajo que
                      te interesa hacer.
                    </p>
                  </>
                )}
                {step === 5 && (
                  <div className="activation-options activation-options--vertical">
                    {(["available", "limited", "unavailable"] as const).map(
                      (a) => (
                        <label
                          className={
                            values.availability === a ? "selected" : ""
                          }
                          key={a}
                        >
                          <input
                            type="radio"
                            name="availability"
                            value={a}
                            checked={values.availability === a}
                            onChange={() =>
                              setValues((v) => ({ ...v, availability: a }))
                            }
                          />
                          <span
                            className={`availability-dot availability-dot--${a}`}
                          />
                          {AVAILABILITY_LABELS[a]}
                        </label>
                      ),
                    )}
                  </div>
                )}
                {step === 6 && (
                  <>
                    <p className="activation-hint">
                      {preferencesPublic
                        ? "Ya elegiste compartir tus preferencias. Estos cambios conservarán esa visibilidad."
                        : "Estas preferencias son privadas. Sólo las compartirás si lo decides después desde el editor."}
                    </p>
                    {(["night", "travel"] as const).map((k) => (
                      <label key={k}>
                        {k === "night"
                          ? "Rodajes nocturnos"
                          : "Disponibilidad para viajar"}
                        <select
                          value={values[k]}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [k]: e.target.value }))
                          }
                        >
                          <option value="unspecified">Sin especificar</option>
                          <option value="accept">Sí</option>
                          <option value="consult">Consultar</option>
                          <option value="decline">No</option>
                        </select>
                      </label>
                    ))}
                  </>
                )}
                {step === 7 && profile && (
                  <>
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
              </>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="activation-error">
              {error}
            </p>
          )}
          {step < 7 && (
            <div className="activation-actions">
              <button
                type="button"
                disabled={busy || step === 1}
                onClick={() => {
                  if (photo) setPhoto(false);
                  else setStep((s) => s - 1);
                  setError("");
                }}
              >
                ← Atrás
              </button>
              <button
                className="activation-primary"
                type="button"
                disabled={busy}
                onClick={() => void next()}
              >
                {busy
                  ? "Guardando…"
                  : photo
                    ? "Continuar"
                    : step === 6
                      ? "Finalizar"
                      : "Continuar →"}
              </button>
              {([4, 6].includes(step) || photo) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void next(true)}
                >
                  {photo ? "Continuar sin cambiar foto" : "Omitir"}
                </button>
              )}
            </div>
          )}
        </form>
        {step === 7 && (
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
