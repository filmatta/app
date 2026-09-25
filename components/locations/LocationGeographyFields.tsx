"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MEXICO_COUNTRY,
  MEXICO_REGIONS,
  type MexicoLocality,
  type MexicoMunicipality,
} from "@/lib/locations/geography";

type InitialGeography = {
  countryCode?: string | null;
  regionCode?: string | null;
  municipalityCode?: string | null;
  localityCode?: string | null;
  postalCode?: string | null;
  city?: string | null;
  area?: string | null;
};

export default function LocationGeographyFields({ initial, required = true }: { initial?: InitialGeography; required?: boolean }) {
  const [country, setCountry] = useState(initial?.countryCode ?? "MX");
  const [region, setRegion] = useState(initial?.regionCode ?? "");
  const [municipality, setMunicipality] = useState(initial?.municipalityCode ?? "");
  const [locality, setLocality] = useState(initial?.localityCode ?? "");
  const [municipalities, setMunicipalities] = useState<MexicoMunicipality[]>([]);
  const [localities, setLocalities] = useState<MexicoLocality[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const historical = Boolean(initial?.city && !initial.regionCode);

  useEffect(() => {
    if (country !== "MX" || !region) return;
    let active = true;
    void loadCatalog<MexicoMunicipality>(`level=municipalities&region=${region}`)
      .then((items) => { if (active) setMunicipalities(items); })
      .catch(() => { if (active) setError("No pudimos cargar los municipios. Inténtalo de nuevo."); });
    return () => { active = false; };
  }, [country, region]);

  useEffect(() => {
    if (country !== "MX" || !region || !municipality) return;
    let active = true;
    void loadCatalog<MexicoLocality>(`level=localities&region=${region}&municipality=${municipality}`)
      .then((items) => { if (active) setLocalities(items); })
      .catch(() => { if (active) setError("No pudimos cargar las localidades. Inténtalo de nuevo."); });
    return () => { active = false; };
  }, [country, region, municipality]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-MX");
    return normalized ? localities.filter((item) => item.name.toLocaleLowerCase("es-MX").includes(normalized)) : localities;
  }, [localities, query]);

  return <div className="space-y-5">
    {historical && <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-sm leading-6 text-amber-100/80">
      Ubicación histórica: {initial?.city}{initial?.area ? ` · ${initial.area}` : ""}. Revisa la ubicación para normalizarla; guardar otra sección no borrará este texto.
    </div>}
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="País">
        <select name="country_code" required={required} value={country} onChange={(event) => {
          setCountry(event.target.value); setRegion(""); setMunicipality(""); setLocality(""); setMunicipalities([]); setLocalities([]); setQuery(""); setError("");
        }} className={inputClass}>
          <option value="MX">{MEXICO_COUNTRY.name}</option>
        </select>
      </Field>
      <Field label="Estado o región">
        <select name="region_code" required={required} value={region} onChange={(event) => {
          setRegion(event.target.value); setMunicipality(""); setLocality(""); setMunicipalities([]); setLocalities([]); setQuery(""); setError("");
        }} className={inputClass}>
          <option value="">Seleccionar</option>
          {MEXICO_REGIONS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="Municipio o demarcación">
        <select name="municipality_code" required={required} value={municipality} disabled={!region} onChange={(event) => {
          setMunicipality(event.target.value); setLocality(""); setLocalities([]); setQuery(""); setError("");
        }} className={inputClass}>
          <option value="">Seleccionar</option>
          {municipalities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </Field>
      <Field label="Buscar ciudad o localidad">
        <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={!municipality} className={inputClass} placeholder="Escribe para filtrar" />
      </Field>
    </div>
    <Field label="Ciudad o localidad">
      <select name="locality_code" required={required} value={locality} disabled={!municipality} onChange={(event) => setLocality(event.target.value)} className={inputClass}>
        <option value="">Seleccionar una opción válida</option>
        {filtered.map((item) => <option key={item.code} value={item.code}>{item.name}{item.scope ? ` · ${sentenceCase(item.scope)}` : ""}</option>)}
      </select>
    </Field>
    <Field label="Código postal">
      <input name="postal_code" type="text" inputMode="numeric" pattern="[0-9]{5}" minLength={5} maxLength={5} required={required} defaultValue={initial?.postalCode ?? ""} className={inputClass} placeholder="Ej. 44160" />
    </Field>
    <Field label="Zona aproximada (opcional)">
      <input name="area" maxLength={120} defaultValue={initial?.area ?? ""} className={inputClass} placeholder="Colonia, barrio o referencia general" />
    </Field>
    {region && municipalities.length === 0 && !error && <p role="status" className="text-xs text-white/45">Cargando catálogo geográfico…</p>}
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    <p className="text-xs leading-5 text-white/40">Al cambiar país, estado o municipio debes seleccionar de nuevo los niveles dependientes. No solicitamos GPS ni dirección exacta.</p>
  </div>;
}

async function loadCatalog<T>(query: string): Promise<T[]> {
  const response = await fetch(`/api/locations/geography/mexico?${query}`);
  const payload = await response.json() as { items?: T[]; error?: string };
  if (!response.ok || !Array.isArray(payload.items)) throw new Error(payload.error ?? "Catalog unavailable");
  return payload.items;
}

function sentenceCase(value: string) {
  const lower = value.toLocaleLowerCase("es-MX");
  return lower.charAt(0).toLocaleUpperCase("es-MX") + lower.slice(1);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm text-white/55">{label}</span>{children}</label>;
}

const inputClass = "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition disabled:cursor-wait disabled:opacity-45 focus:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";
