"use client";

import { useCallback, useMemo, useState } from "react";
import {
  getMfaFactorSelection,
  getMfaQrImageSource,
  getMfaVerificationMessage,
  getMfaViewState,
  readMfaSnapshot,
  verifyMfaChallenge,
  type MfaSnapshot,
} from "@/lib/auth/mfa-state";
import { createClient } from "@/lib/supabase/client";

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function MfaTotpManager({
  initialSnapshot,
  next,
}: {
  initialSnapshot: MfaSnapshot;
  next?: string;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [factorId, setFactorId] = useState(
    initialSnapshot.factors.find((factor) => factor.status === "verified")?.id ??
      "",
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secretVisible, setSecretVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  const view = getMfaViewState(snapshot, Boolean(enrollment));
  const verifiedFactors = useMemo(
    () => snapshot.factors.filter((factor) => factor.status === "verified"),
    [snapshot.factors],
  );
  const qrSource = enrollment
    ? getMfaQrImageSource(enrollment.qrCode)
    : null;

  const refreshState = useCallback(async () => {
    const supabase = createClient();
    const refreshed = await readMfaSnapshot(
      () => supabase.auth.mfa.listFactors(),
      () => supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    );
    setSnapshot(refreshed);
    setFactorId((current) => getMfaFactorSelection(refreshed, current));
    return refreshed;
  }, []);

  async function startEnrollment() {
    setBusy(true);
    setError("");
    setCopyStatus("");
    try {
      const supabase = createClient();
      const unverified = snapshot.factors.filter(
        (factor) => factor.status === "unverified",
      );
      for (const factor of unverified) {
        const removal = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (removal.error) throw removal.error;
      }

      const result = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "FILMATTA Authenticator",
      });
      if (result.error) throw result.error;

      setFactorId(result.data.id);
      setEnrollment({
        factorId: result.data.id,
        qrCode: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      });
      setSecretVisible(false);
      await refreshState();
    } catch {
      setError(
        "No pudimos iniciar la configuración. Inténtalo de nuevo o contacta al responsable del proyecto.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCopyStatus("");
    try {
      const supabase = createClient();
      const result = await verifyMfaChallenge(
        factorId,
        code,
        (params) => supabase.auth.mfa.challengeAndVerify(params),
        () => supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      );
      if (!result.ok) {
        setError(getMfaVerificationMessage(result.reason));
        return;
      }

      // The enrollment secret must disappear as soon as Supabase verifies it.
      setEnrollment(null);
      setSecretVisible(false);
      setCode("");
      const refreshed = await refreshState();
      if (!refreshed.available || refreshed.currentLevel !== "aal2") {
        setError(getMfaVerificationMessage("session-not-aal2"));
        return;
      }
      if (next) window.location.assign(next);
    } catch {
      setError(getMfaVerificationMessage("verification-failed"));
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopyStatus("Clave copiada.");
    } catch {
      setSecretVisible(true);
      setCopyStatus("Selecciona la clave visible y cópiala manualmente.");
    }
  }

  const badge =
    view === "active"
      ? "Activa"
      : view === "challenge"
        ? "Verificación requerida"
        : view === "enrolling" || view === "pending"
          ? "Configuración pendiente"
          : view === "unavailable"
            ? "No disponible"
            : "No configurada";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <h3 className="font-medium text-white/85">
            Autenticación en dos pasos
          </h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/40">
            {view === "active"
              ? "Autenticación en dos pasos configurada."
              : view === "challenge"
                ? "Tu autenticador está configurado. Verifica tu identidad para elevar esta sesión a AAL2."
                : view === "pending"
                  ? "Hay una configuración sin verificar. Reiníciala para obtener un QR y una clave nuevos."
                  : view === "enrolling"
                    ? "Escanea el QR y verifica el código antes de salir de esta pantalla."
                    : "Añade una capa adicional de seguridad a tu cuenta."}
          </p>
          {snapshot.available && (
            <p className="mt-3 text-xs text-white/30">
              Sesión: {snapshot.currentLevel ?? "sin nivel"} · Siguiente nivel: {snapshot.nextLevel ?? "sin nivel"}
            </p>
          )}
        </div>
        <span
          className={`w-fit rounded-full border px-3 py-1.5 text-xs font-medium ${
            view === "active"
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              : "border-white/10 bg-white/[0.025] text-white/45"
          }`}
        >
          {badge}
        </span>
      </div>

      {view === "unavailable" && (
        <div className="mt-6">
          <p className="text-sm text-amber-100/75" role="alert">
            No pudimos consultar el estado MFA. Recarga la página antes de realizar cambios.
          </p>
          <button
            type="button"
            onClick={() => void refreshState()}
            className="mt-4 rounded-full border border-white/15 px-5 py-3 text-sm font-medium transition hover:bg-white/[0.06]"
          >
            Volver a comprobar
          </button>
        </div>
      )}

      {(view === "not-configured" || view === "pending") && (
        <button
          type="button"
          onClick={startEnrollment}
          disabled={busy}
          className="mt-6 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-50"
        >
          {busy
            ? "Preparando…"
            : view === "pending"
              ? "Reiniciar configuración"
              : "Configurar 2FA"}
        </button>
      )}

      {view === "enrolling" && enrollment && (
        <div className="mt-8 space-y-6">
          {qrSource ? (
            <div className="w-fit max-w-full rounded-xl bg-white p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.16)]">
              {/* The official Supabase SVG stays in the browser and is never sent to an optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSource}
                alt="Código QR para configurar tu aplicación de autenticación"
                width={240}
                height={240}
                className="block size-60 max-w-full bg-white object-contain"
              />
            </div>
          ) : (
            <p className="text-sm text-amber-100/75" role="alert">
              El QR no está disponible. Usa la clave manual.
            </p>
          )}

          <div className="max-w-lg rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-medium text-white/80">
              ¿No puedes escanear el código?
            </p>
            <p className="mt-2 text-sm leading-6 text-white/40">
              Introduce la clave manual en tu aplicación. Sólo se muestra durante esta configuración.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="min-w-0 break-all rounded-lg bg-black/40 px-3 py-2 text-sm tracking-[0.12em] text-white/85">
                {secretVisible ? enrollment.secret : "•••• •••• •••• ••••"}
              </code>
              <button
                type="button"
                onClick={() => setSecretVisible((visible) => !visible)}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]"
              >
                {secretVisible ? "Ocultar" : "Mostrar"}
              </button>
              <button
                type="button"
                onClick={copySecret}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]"
              >
                Copiar
              </button>
            </div>
            {copyStatus && (
              <p className="mt-3 text-xs text-white/45" role="status">
                {copyStatus}
              </p>
            )}
          </div>
        </div>
      )}

      {(view === "enrolling" || view === "challenge") && (
        <form onSubmit={verifyCode} className="mt-6 max-w-md space-y-4">
          {view === "challenge" && verifiedFactors.length > 1 && (
            <label className="block text-sm text-white/60">
              Aplicación de autenticación
              <select
                value={factorId}
                onChange={(event) => setFactorId(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-white/10 bg-black p-3 text-white"
              >
                {verifiedFactors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm text-white/60" htmlFor="totp-code">
            Código de seis dígitos
          </label>
          <input
            id="totp-code"
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-lg tracking-[0.3em] outline-none transition focus:border-white/35"
          />
          <button
            disabled={busy || code.length !== 6}
            className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-50"
          >
            {busy
              ? "Verificando…"
              : view === "challenge"
                ? "Verificar identidad"
                : "Verificar y activar"}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-5 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {(view === "challenge" || view === "active") && (
        <p className="mt-6 text-sm text-white/35">
          Restablecer tu contraseña no elimina este factor de seguridad.
        </p>
      )}
    </div>
  );
}
