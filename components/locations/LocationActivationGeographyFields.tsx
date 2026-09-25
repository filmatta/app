"use client";

import { useEffect, useState } from "react";
import {
  MEXICO_COUNTRY,
  MEXICO_REGIONS,
  type MexicoMunicipality,
} from "@/lib/locations/geography";

type InitialActivationGeography = {
  countryCode?: string | null;
  regionCode?: string | null;
  municipalityCode?: string | null;
  postalCode?: string | null;
  area?: string | null;
};

export default function LocationActivationGeographyFields({
  initial,
}: {
  initial?: InitialActivationGeography;
}) {
  const [country, setCountry] = useState(initial?.countryCode ?? "MX");
  const [region, setRegion] = useState(initial?.regionCode ?? "");
  const [municipality, setMunicipality] = useState(initial?.municipalityCode ?? "");
  const [municipalities, setMunicipalities] = useState<MexicoMunicipality[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (country !== "MX" || !region) return;
    let active = true;
    void loadMunicipalities(region)
      .then((items) => { if (active) setMunicipalities(items); })
      .catch(() => { if (active) setError("No pudimos cargar los municipios. Inténtalo de nuevo."); });
    return () => { active = false; };
  }, [country, region]);

  return <div className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="País">
        <select name="country_code" required value={country} onChange={(event) => {
          setCountry(event.target.value); setRegion(""); setMunicipality(""); setMunicipalities([]); setError("");
        }} className={inputClass}>
          <option value="MX">{MEXICO_COUNTRY.name}</option>
        </select>
      </Field>
      <Field label="Estado o región">
        <select name="region_code" required value={region} onChange={(event) => {
          setRegion(event.target.value); setMunicipality(""); setMunicipalities([]); setError("");
        }} className={inputClass}>
          <option value="">Seleccionar</option>
          {MEXICO_REGIONS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="Municipio o demarcación">
        <select name="municipality_code" required value={municipality} disabled={!region} onChange={(event) => setMunicipality(event.target.value)} className={inputClass}>
          <option value="">Seleccionar</option>
          {municipalities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="Código postal">
        <input name="postal_code" type="text" inputMode="numeric" pattern="[0-9]{5}" minLength={5} maxLength={5} required defaultValue={initial?.postalCode ?? ""} className={inputClass} placeholder="Ej. 44160" />
      </Field>
    </div>
    <Field label="Zona aproximada (opcional)">
      <input name="area" maxLength={120} defaultValue={initial?.area ?? ""} className={inputClass} placeholder="Colonia, barrio o referencia general" />
    </Field>
    {region && municipalities.length === 0 && !error && <p role="status" className="text-xs text-white/45">Cargando catálogo geográfico…</p>}
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    <p className="text-xs leading-5 text-white/40">Al cambiar país o estado debes seleccionar de nuevo el municipio. No solicitamos GPS ni dirección exacta.</p>
  </div>;
}

async function loadMunicipalities(region: string): Promise<MexicoMunicipality[]> {
  const response = await fetch(`/api/locations/geography/mexico?level=municipalities&region=${region}`);
  const payload = await response.json() as { items?: MexicoMunicipality[]; error?: string };
  if (!response.ok || !Array.isArray(payload.items)) throw new Error(payload.error ?? "Catalog unavailable");
  return payload.items;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm text-white/55">{label}</span>{children}</label>;
}

const inputClass = "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition disabled:cursor-wait disabled:opacity-45 focus:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";
