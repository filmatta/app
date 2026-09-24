"use client";

import { useMemo, useState } from "react";
import {
  formatAttendeeRange,
  isPositiveIntegerCapacity,
  locationPricingProblem,
  suggestedLocationRanges,
  type LocationRateMode,
  type LocationRateTier,
} from "@/lib/locations/pricing";

type DraftTier = { min: number; max: number; price: string };

export default function LocationPricingEditor({
  initialCapacity,
  initialMode,
  initialTiers,
  initialMinimumHours,
  legacyPrice,
}: {
  initialCapacity: number | null;
  initialMode: LocationRateMode;
  initialTiers: LocationRateTier[];
  initialMinimumHours: number | null;
  legacyPrice: string | null;
}) {
  const validInitialCapacity = isPositiveIntegerCapacity(initialCapacity) ? initialCapacity : null;
  const [capacityText, setCapacityText] = useState(validInitialCapacity ? String(validInitialCapacity) : "");
  const [mode, setMode] = useState<LocationRateMode>(initialMode);
  const [currency, setCurrency] = useState(initialTiers[0]?.currency ?? "MXN");
  const [minimumHours, setMinimumHours] = useState(initialMinimumHours === null ? "" : String(initialMinimumHours));
  const [tiers, setTiers] = useState<DraftTier[]>(() => initialTiers.map((tier) => ({ min: tier.min, max: tier.max, price: String(tier.price) })));
  const capacity = /^\d+$/.test(capacityText) ? Number(capacityText) : null;
  const problem = mode === "tiers" ? locationPricingProblem(capacity, tiers) : null;
  const historicalInvalid = initialCapacity !== null && validInitialCapacity === null;

  function switchMode(next: LocationRateMode) {
    setMode(next);
    if (next === "tiers" && tiers.length === 0 && isPositiveIntegerCapacity(capacity)) {
      setTiers(suggestedLocationRanges(capacity).map((tier) => ({ ...tier, price: "" })));
    }
  }

  function resetSuggested() {
    if (!isPositiveIntegerCapacity(capacity)) return;
    setTiers(suggestedLocationRanges(capacity).map((tier) => ({ ...tier, price: "" })));
  }

  function changeCount(count: number) {
    if (!isPositiveIntegerCapacity(capacity) || count < 1 || count > 3 || count > capacity) return;
    setTiers(rangesForCount(capacity, count));
  }

  function changeMax(index: number, value: string) {
    const max = /^\d+$/.test(value) ? Number(value) : 0;
    setTiers((current) => current.map((tier, tierIndex) => {
      if (tierIndex === index) return { ...tier, max };
      if (tierIndex === index + 1) return { ...tier, min: max + 1 };
      return tier;
    }));
  }

  const legacyAvailable = initialMode === "legacy";
  const countOptions = useMemo(() => {
    const max = isPositiveIntegerCapacity(capacity) ? Math.min(3, capacity) : 0;
    return Array.from({ length: max }, (_, index) => index + 1);
  }, [capacity]);

  return <div className="space-y-7">
    <label className="block">
      <span className="mb-2 block text-sm text-white/60">Capacidad máxima</span>
      <input
        name="characteristic.declared_capacity"
        value={capacityText}
        onChange={(event) => setCapacityText(event.target.value)}
        type="number"
        inputMode="numeric"
        min="1"
        max="1000000"
        step="1"
        className={inputClass}
        placeholder="No informada"
      />
      <span className="mt-2 block text-xs leading-5 text-white/45">Personas presentes simultáneamente: talento, crew, clientes, extras y cualquier otro asistente. Es una declaración del responsable, no un aforo certificado.</span>
      {historicalInvalid && !capacityText && <span className="mt-2 block text-xs leading-5 text-amber-200/75">La ficha conserva un valor histórico que no cumple las reglas actuales. Puedes guardar otros cambios sin alterarlo o sustituirlo por un entero positivo.</span>}
    </label>

    <fieldset className="space-y-3">
      <legend className="text-sm text-white/60">Cómo mostrar la tarifa</legend>
      {legacyAvailable && <ModeOption checked={mode === "legacy"} onChange={() => switchMode("legacy")} title="Conservar tarifa histórica" description={legacyPrice ?? "No había una tarifa completa configurada."} />}
      <ModeOption checked={mode === "tiers"} onChange={() => switchMode("tiers")} title="Tarifas por rango de asistentes" description="Hasta tres precios totales por hora. El importe no se multiplica por el número de asistentes." />
      <ModeOption checked={mode === "inquire"} onChange={() => switchMode("inquire")} title="Consultar tarifa" description="No se publicará la tarifa histórica ni una tabla parcial." />
    </fieldset>
    <input type="hidden" name="rate_mode" value={mode} />

    {mode === "tiers" && <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="min-w-48 flex-1 text-sm text-white/60">Número de rangos
          <select className={`${inputClass} mt-2`} value={tiers.length || ""} onChange={(event) => changeCount(Number(event.target.value))} disabled={!countOptions.length}>
            <option value="">Seleccionar</option>
            {countOptions.map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <button type="button" className="rounded-full border border-white/15 px-4 py-3 text-sm text-white/75 transition hover:border-white/30 hover:text-white disabled:opacity-40" onClick={resetSuggested} disabled={!isPositiveIntegerCapacity(capacity)}>Restablecer rangos sugeridos</button>
      </div>
      <p className="text-xs leading-5 text-white/45">Restablecer crea los cortes recomendados y vacía los importes para no trasladar precios a grupos distintos.</p>
      <label className="block text-sm text-white/60">Moneda
        <input name="rate_currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))} maxLength={3} className={`${inputClass} mt-2 uppercase`} placeholder="MXN" />
      </label>
      <input type="hidden" name="rate_tier_count" value={tiers.length} />
      <div className="space-y-3">
        {tiers.map((tier, index) => <div key={index} className="grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
          <div>
            <p className="text-sm font-medium text-white">{formatAttendeeRange(tier.min, tier.max)}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-xs text-white/45">Desde<input value={tier.min || ""} readOnly className={`${inputClass} mt-2 opacity-65`} /></label>
              <label className="text-xs text-white/45">Hasta
                <input name={`rate_tier_${index}_max`} value={tier.max || ""} onChange={(event) => changeMax(index, event.target.value)} readOnly={index === tiers.length - 1} type="number" min={tier.min || 1} step="1" className={`${inputClass} mt-2 ${index === tiers.length - 1 ? "opacity-65" : ""}`} />
              </label>
            </div>
          </div>
          <label className="text-xs text-white/45">Tarifa total por hora
            <input name={`rate_tier_${index}_price`} value={tier.price} onChange={(event) => setTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} inputMode="decimal" placeholder="1400" className={`${inputClass} mt-2`} />
          </label>
        </div>)}
      </div>
      <label className="block text-sm text-white/60">Mínimo de horas <span className="text-white/35">(opcional)</span>
        <input name="minimum_hours" value={minimumHours} onChange={(event) => setMinimumHours(event.target.value)} type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" className={`${inputClass} mt-2`} placeholder="4" />
      </label>
      {problem && <p role="alert" className="text-sm leading-6 text-red-300">{problem}</p>}
    </div>}
  </div>;
}

function ModeOption({ checked, onChange, title, description }: { checked: boolean; onChange: () => void; title: string; description: string }) {
  return <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition ${checked ? "border-white/35 bg-white/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}>
    <input type="radio" checked={checked} onChange={onChange} className="mt-1" />
    <span><strong className="block text-sm text-white">{title}</strong><span className="mt-1 block text-xs leading-5 text-white/45">{description}</span></span>
  </label>;
}

function rangesForCount(capacity: number, count: number): DraftTier[] {
  if (count === 1) return [{ min: 1, max: capacity, price: "" }];
  if (count === 2) {
    const firstEnd = Math.min(5, capacity - 1);
    return [{ min: 1, max: firstEnd, price: "" }, { min: firstEnd + 1, max: capacity, price: "" }];
  }
  const firstEnd = Math.min(5, capacity - 2);
  const secondEnd = Math.min(Math.max(firstEnd + 1, 15), capacity - 1);
  return [
    { min: 1, max: firstEnd, price: "" },
    { min: firstEnd + 1, max: secondEnd, price: "" },
    { min: secondEnd + 1, max: capacity, price: "" },
  ];
}

const inputClass = "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition placeholder:text-white/20 focus:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";
