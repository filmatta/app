"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminMfaForm({ next, factors }: {
  next: string; factors: { id: string; name: string }[];
}) {
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [enrollment, setEnrollment] = useState<{ qr_code: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function enroll() {
    setBusy(true); setError("");
    try {
      const { data, error } = await createClient().auth.mfa.enroll({ factorType: "totp", friendlyName: `FILMATTA ${Date.now()}` });
      if (error) throw error;
      setFactorId(data.id); setEnrollment(data.totp);
    } catch { setError("No pudimos configurar el autenticador. Inténtalo de nuevo o contacta al responsable del proyecto."); }
    finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const supabase = createClient();
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) throw result.error;
      const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level.error || level.data.currentLevel !== "aal2") throw new Error("MFA required");
      window.location.assign(next);
    } catch { setError("No pudimos verificar el código. Comprueba tu autenticador e inténtalo de nuevo."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    {!factorId && <button type="button" onClick={enroll} disabled={busy} className="rounded bg-white px-5 py-3 text-black">Configurar autenticador</button>}
    {enrollment && <div className="space-y-3">
      {/* Supabase SVG data URL is an image, never executable HTML. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrollment.qr_code} alt="Código QR para configurar tu autenticador" width={240} height={240} />
      <p>Si no puedes escanearlo, introduce esta clave en tu autenticador:</p>
      <code className="break-all">{enrollment.secret}</code>
    </div>}
    {factorId && <form onSubmit={verify} className="space-y-4">
      {factors.length > 1 && <label className="block">Autenticador<select value={factorId} onChange={(event) => setFactorId(event.target.value)} className="block bg-black p-3">{factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name}</option>)}</select></label>}
      <label className="block" htmlFor="totp">Código de seis dígitos</label>
      <input id="totp" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="rounded border border-white/30 bg-black p-3" />
      <button disabled={busy} className="block rounded bg-white px-5 py-3 text-black">Verificar y continuar</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    <p className="text-sm text-white/60">Si perdiste tu autenticador, contacta al responsable del proyecto. Restablecer tu contraseña no elimina esta verificación.</p>
  </div>;
}
