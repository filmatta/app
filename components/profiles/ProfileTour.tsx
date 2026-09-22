"use client";
import { useEffect, useRef, useState } from "react";
import { finishProfileTour } from "@/app/onboarding/perfil/actions";
import { activationEvent } from "@/lib/profiles/activation-events";
import "./activation-owner.css";
const steps = [
  [
    "preview",
    "Este es tu perfil público.",
    "Aquí ves la presentación de tu perfil. Mientras sea borrador, sólo tú puedes verlo.",
  ],
  [
    "identity",
    "Hazlo tuyo.",
    "Desde Editar perfil puedes actualizar tu identidad e información principal.",
  ],
  [
    "media",
    "Agrega tu trabajo cuando estés listo.",
    "Reel, Videos y Book tienen su propio espacio. No necesitas completarlos ahora.",
  ],
  [
    "public",
    "Revísalo antes de compartir.",
    "El botón de vista pública aparece al publicar. Publicar siempre es una decisión tuya.",
  ],
];
export default function ProfileTour({ autoStart }: { autoStart: boolean }) {
  const [active, setActive] = useState(autoStart),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    replay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) return;
    activationEvent("profile_tour_started");
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, [active]);
  useEffect(() => {
    if (!active) return;
    heading.current?.focus();
    const root = document.querySelector(
      `[data-tour-target="${steps[step][0]}"]`,
    );
    const target =
      step === 2 ? (root?.querySelector(".pm-section") ?? root) : root;
    target?.classList.add("activation-tour-target");
    target?.scrollIntoView({ block: "center", behavior: "instant" });
    return () => target?.classList.remove("activation-tour-target");
  }, [active, step]);
  async function finish(skip: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await finishProfileTour();
      if (r.error) {
        setError(r.error);
        return;
      }
      activationEvent(skip ? "profile_tour_skipped" : "profile_tour_completed");
      setActive(false);
      replay.current?.focus();
    } catch {
      setError(
        "No pudimos guardar el recorrido. Reintenta para que no vuelva a aparecer.",
      );
    } finally {
      setBusy(false);
      setActive(false);
      replay.current?.focus();
    }
  }
  return (
    <>
      <button
        type="button"
        ref={replay}
        className="activation-tour-replay"
        onClick={() => {
          setStep(0);
          setActive(true);
        }}
      >
        Ver recorrido de nuevo
      </button>
      {!active && error && (
        <p role="status">
          {error} Puedes cerrar esta ayuda y seguir usando tu perfil.
        </p>
      )}
      {active && (
        <dialog
          ref={dialog}
          className="activation-tour"
          aria-labelledby="tour-heading"
          onCancel={(e) => {
            e.preventDefault();
            void finish(true);
          }}
        >
          <p className="eyebrow">TU PERFIL · {step + 1} DE 4</p>
          <h2 id="tour-heading" tabIndex={-1} ref={heading}>
            {steps[step][1]}
          </h2>
          <p>{steps[step][2]}</p>
          {error && <p role="alert">{error}</p>}
          <div>
            <button
              disabled={busy || step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              Atrás
            </button>
            <button
              disabled={busy}
              className="pe-primary"
              onClick={() =>
                step === 3 ? void finish(false) : setStep((s) => s + 1)
              }
            >
              {busy ? "Guardando…" : step === 3 ? "Listo" : "Siguiente"}
            </button>
          </div>
          <button
            disabled={busy}
            className="activation-tour-skip"
            onClick={() => void finish(true)}
          >
            Omitir tutorial
          </button>
        </dialog>
      )}
    </>
  );
}
