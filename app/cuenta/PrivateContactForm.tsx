"use client";
import { useState } from "react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import { normalizeInstagram, normalizeWhatsApp, type PrivateContact } from "@/lib/profiles/private-contact";
import { savePrivateContact } from "./private-profile-actions";
const labels = new Intl.DisplayNames(["es"], { type: "region" });
const countries = getCountries().sort((a,b) => (labels.of(a) ?? a).localeCompare(labels.of(b) ?? b, "es"));
export default function PrivateContactForm({ initial }: { initial: PrivateContact }) {
  const [instagram, setInstagram] = useState(initial.instagram_username), [phone, setPhone] = useState(initial.whatsapp_e164);
  const [country, setCountry] = useState<CountryCode | "">("");
  const [preferred, setPreferred] = useState(initial.preferred_contact), [confirmed, setConfirmed] = useState(true);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const ig = normalizeInstagram(instagram), wa = normalizeWhatsApp(phone, country || undefined);
  return <form className="private-contact-form" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setMessage(""); setError("");
    if (ig === null || wa === null || (wa.canonical && !confirmed)) { setError("Revisa los datos y confirma el formato internacional antes de guardar."); return; }
    setBusy(true);
    try {
      const result = await savePrivateContact({ instagram_username: ig, whatsapp_e164: wa.canonical, preferred_contact: preferred, contact_visibility: "private" });
      if ("error" in result) setError(result.error ?? "No pudimos guardar.");
      else { setInstagram(result.data.instagram_username); setPhone(result.data.whatsapp_e164); setPreferred(result.data.preferred_contact); setMessage("Datos privados guardados."); }
    } catch { setError("No pudimos guardar. Tus cambios siguen en el formulario."); }
    finally { setBusy(false); }
  }}>
    <p>Datos privados. No aparecen en tu perfil público.</p>
    <label>Instagram<input autoComplete="off" maxLength={200} value={instagram} onChange={e => { setInstagram(e.target.value); setMessage(""); }} placeholder="@usuario o enlace de perfil" /></label>
    {ig !== null && ig && <small>Se guardará como @{ig}. Esto no verifica la propiedad.</small>}
    <label>País / prefijo<select value={country} onChange={e => { setCountry(e.target.value as CountryCode); setConfirmed(false); }}><option value="">Selecciona país o escribe un número con +</option>{countries.map(c => <option key={c} value={c}>{labels.of(c)} (+{getCountryCallingCode(c)})</option>)}</select></label>
    <label>WhatsApp<input type="tel" autoComplete="off" maxLength={60} value={phone} onChange={e => { setPhone(e.target.value); setConfirmed(false); setMessage(""); }} /></label>
    {wa?.canonical && <><p>Formato internacional: <strong>{wa.display}</strong></p><label className="private-contact-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo que éste es el número que quiero guardar.</label></>}
    <label>Canal preferido<select value={preferred} onChange={e => setPreferred(e.target.value as PrivateContact["preferred_contact"])}><option value="none">Sin preferencia</option><option value="instagram" disabled={!ig}>Instagram</option><option value="whatsapp" disabled={!wa?.canonical}>WhatsApp</option></select></label>
    <small>No comprobamos que el número tenga WhatsApp. Tu preferencia no inicia envíos ni comparte estos datos con otros miembros.</small>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar datos de contacto"}</button>
  </form>;
}
