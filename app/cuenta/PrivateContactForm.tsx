"use client";
import { useState } from "react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import { normalizeInstagram, normalizeWhatsApp, EMPTY_CHANNELS, type PrivateContact, type ContactChannels } from "@/lib/profiles/private-contact";
import { savePrivateContact } from "./private-profile-actions";
const labels = new Intl.DisplayNames(["es"], { type: "region" });
const countries = getCountries().sort((a,b) => (labels.of(a) ?? a).localeCompare(labels.of(b) ?? b, "es"));
export default function PrivateContactForm({ initial }: { initial: PrivateContact }) {
  const [instagram, setInstagram] = useState(initial.instagram_username), [phone, setPhone] = useState(initial.whatsapp_e164);
  const [country, setCountry] = useState<CountryCode | "">("");
  const [preferred, setPreferred] = useState(initial.preferred_contact), [confirmed, setConfirmed] = useState(true);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [channels, setChannels] = useState<ContactChannels>({ ...EMPTY_CHANNELS, ...initial });
  const ig = normalizeInstagram(instagram), wa = normalizeWhatsApp(phone, country || undefined);
  return <form className="private-contact-form" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setMessage(""); setError("");
    if (ig === null || wa === null || (wa.canonical && !confirmed)) { setError("Revisa los datos y confirma el formato internacional antes de guardar."); return; }
    setBusy(true);
    try {
      const result = await savePrivateContact({ ...channels, instagram_username: ig, whatsapp_e164: wa.canonical, preferred_contact: preferred, contact_visibility: "private" });
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
    <small>No comprobamos que el número tenga WhatsApp. El canal preferido no autoriza compartirlo.</small>
    <label>Email de contacto<input type="email" autoComplete="off" maxLength={254} value={channels.contact_email} onChange={e => setChannels({ ...channels, contact_email: e.target.value })} /></label>
    <label>Teléfono con prefijo internacional<input type="tel" autoComplete="off" placeholder="+52…" maxLength={16} value={channels.phone_e164} onChange={e => setChannels({ ...channels, phone_e164: e.target.value })} /></label>
    <fieldset><legend>Al aceptar una solicitud, compartir:</legend>
      {([["share_instagram", "Instagram"], ["share_whatsapp", "WhatsApp"], ["share_email", "Email"], ["share_phone", "Teléfono"]] as const).map(([key,label]) => <label key={key} className="private-contact-check"><input type="checkbox" checked={channels[key]} onChange={e => setChannels({ ...channels, [key]: e.target.checked })} />{label}</label>)}
    </fieldset>
    <small>Sólo se comparten los canales marcados cuando aceptas. Las conexiones aceptadas conservan los datos que compartiste en ese momento; cambiarlos aquí afecta únicamente futuras aceptaciones.</small>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar datos de contacto"}</button>
  </form>;
}
