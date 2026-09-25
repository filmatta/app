"use client";

import { useMemo, useState } from "react";
import {
  isPositiveIntegerCapacity,
  suggestedLocationRanges,
  type LocationRateMode,
  type LocationRateTier,
} from "@/lib/locations/pricing";

type Tier = { min: number; max: number; price: string };

export default function LocationStarterPricing({
  capacity,
  initialMode = "tiers",
  initialTiers = [],
  initialMinimumHours = null,
}: {
  capacity: number | null;
  initialMode?: LocationRateMode;
  initialTiers?: LocationRateTier[];
  initialMinimumHours?: number | null;
}) {
  const validCapacity = isPositiveIntegerCapacity(capacity) ? capacity : null;
  const ranges = useMemo(() => validCapacity ? suggestedLocationRanges(validCapacity) : [], [validCapacity]);
  const normalizedInitial = initialMode === "inquire" ? "inquire" : "tiers";
  const [mode, setMode] = useState<"tiers" | "inquire">(normalizedInitial);
  const [advanced, setAdvanced] = useState(initialTiers.length > 1);
  const [price, setPrice] = useState(initialTiers.length === 1 ? String(initialTiers[0].price) : "");
  const [minimumHours, setMinimumHours] = useState(initialMinimumHours === null ? "" : String(initialMinimumHours));
  const [tiers, setTiers] = useState<Tier[]>(() => initialTiers.length > 1
    ? initialTiers.map((tier) => ({ min: tier.min, max: tier.max, price: String(tier.price) }))
    : ranges.map((range) => ({ ...range, price: "" })));

  function toggleAdvanced() {
    setAdvanced((current) => {
      if (!current && validCapacity && tiers.length === 0) {
        setTiers(ranges.map((range) => ({ ...range, price: "" })));
      }
      return !current;
    });
  }

  function resetSuggested() {
    if (!validCapacity) return;
    setTiers(ranges.map((range) => ({ ...range, price: "" })));
  }

  return <div className="space-y-6">
    <input type="hidden" name="rate_mode" value={mode} />
    <input type="hidden" name="rate_currency" value="MXN" />
    <input type="hidden" name="characteristic.declared_capacity" value={validCapacity ?? ""} />

    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/75 transition hover:border-white/20">
      <input type="checkbox" className="mt-1" checked={mode === "inquire"} onChange={(event) => setMode(event.target.checked ? "inquire" : "tiers")} />
      <span><strong className="block text-white">Prefiero que me consulten el precio</strong><span className="mt-1 block text-xs leading-5 text-white/45">La ficha mostrará “Consultar” y no publicará importes parciales.</span></span>
    </label>

    {mode === "tiers" && <div className="space-y-5">
      {!advanced ? <>
        <input type="hidden" name="rate_tier_count" value="1" />
        <input type="hidden" name="rate_tier_0_max" value={validCapacity ?? ""} />
        <label className="block">
          <span className="mb-2 block text-sm text-white/60">Precio total por hora · MXN</span>
          <span className="relative block"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-white/40">$</span><input name="rate_tier_0_price" value={price} onChange={(event) => setPrice(event.target.value)} required inputMode="decimal" className={`${inputClass} pl-9 text-2xl`} placeholder="1400" /></span>
          <span className="mt-2 block text-xs leading-5 text-white/40">Este precio cubre inicialmente de 1 a {validCapacity ?? "—"} personas.</span>
        </label>
      </> : <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Precios según cantidad de personas</p>
          <button type="button" onClick={resetSuggested} className="text-xs text-white/55 underline-offset-4 hover:text-white hover:underline">Restablecer rangos sugeridos</button>
        </div>
        <input type="hidden" name="rate_tier_count" value={tiers.length} />
        {tiers.map((tier, index) => <label key={`${tier.min}-${tier.max}`} className="grid gap-2 sm:grid-cols-[1fr_180px] sm:items-center">
          <span className="text-sm text-white/65">{tier.min === tier.max ? `${tier.min} persona` : `${tier.min}–${tier.max} personas`}</span>
          <span>
            <input type="hidden" name={`rate_tier_${index}_max`} value={tier.max} />
            <input name={`rate_tier_${index}_price`} value={tier.price} onChange={(event) => setTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} required inputMode="decimal" className={inputClass} placeholder="$ por hora" />
          </span>
        </label>)}
        <p className="text-xs leading-5 text-white/40">Hasta tres rangos consecutivos. Restablecer vacía importes para no trasladarlos a grupos distintos.</p>
      </div>}

      <button type="button" onClick={toggleAdvanced} disabled={!validCapacity} className="rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40">
        {advanced ? "Usar un solo precio" : "Configurar precios según cantidad de personas"}
      </button>

      <label className="block max-w-xs">
        <span className="mb-2 block text-sm text-white/55">Mínimo de horas <span className="text-white/30">(opcional)</span></span>
        <input name="minimum_hours" value={minimumHours} onChange={(event) => setMinimumHours(event.target.value)} type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" className={inputClass} placeholder="4" />
      </label>
    </div>}

    {mode === "inquire" && <input type="hidden" name="minimum_hours" value="" />}
  </div>;
}

const inputClass = "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition placeholder:text-white/20 focus:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";
