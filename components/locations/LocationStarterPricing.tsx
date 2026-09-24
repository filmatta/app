"use client";

import { useMemo, useState } from "react";
import { isPositiveIntegerCapacity, suggestedLocationRanges } from "@/lib/locations/pricing";

type Tier = { min: number; max: number; price: string };

export default function LocationStarterPricing() {
  const [capacityText, setCapacityText] = useState("");
  const [mode, setMode] = useState<"tiers" | "inquire">("tiers");
  const [advanced, setAdvanced] = useState(false);
  const [price, setPrice] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const capacity = /^\d+$/.test(capacityText) ? Number(capacityText) : null;
  const ranges = useMemo(() => isPositiveIntegerCapacity(capacity) ? suggestedLocationRanges(capacity) : [], [capacity]);

  function toggleAdvanced(next: boolean) {
    setAdvanced(next);
    if (next && isPositiveIntegerCapacity(capacity)) {
      setTiers(ranges.map((range) => ({ ...range, price: "" })));
    }
  }

  return <div className="space-y-6">
    <label className="block">
      <span className="mb-2 block text-sm text-white/55">Capacidad máxima</span>
      <input name="characteristic.declared_capacity" value={capacityText} onChange={(event) => {
        const next = event.target.value; setCapacityText(next);
        const parsed = /^\d+$/.test(next) ? Number(next) : null;
        if (advanced && isPositiveIntegerCapacity(parsed)) setTiers(suggestedLocationRanges(parsed).map((range) => ({ ...range, price: "" })));
      }} required type="number" min="1" max="1000000" step="1" inputMode="numeric" className={inputClass} placeholder="20" />
      <span className="mt-2 block text-xs leading-5 text-white/40">Incluye talento, crew, clientes, extras y cualquier otra persona presente.</span>
    </label>

    <fieldset className="space-y-3">
      <legend className="text-sm text-white/55">Tarifa</legend>
      <label className={optionClass(mode === "tiers")}><input type="radio" checked={mode === "tiers"} onChange={() => setMode("tiers")} /><span><strong>Tarifa por hora</strong><small>Un precio total para toda la capacidad.</small></span></label>
      <label className={optionClass(mode === "inquire")}><input type="radio" checked={mode === "inquire"} onChange={() => setMode("inquire")} /><span><strong>Consultar tarifa</strong><small>No se guardará un importe vacío ni se publicará una tarifa anterior.</small></span></label>
    </fieldset>
    <input type="hidden" name="rate_mode" value={mode} />
    <input type="hidden" name="rate_currency" value="MXN" />
    <input type="hidden" name="minimum_hours" value="" />

    {mode === "tiers" && <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      {!advanced ? <>
        <input type="hidden" name="rate_tier_count" value="1" />
        <input type="hidden" name="rate_tier_0_max" value={capacityText} />
        <label className="block"><span className="mb-2 block text-sm text-white/55">Precio total por hora · MXN</span><input name="rate_tier_0_price" value={price} onChange={(event) => setPrice(event.target.value)} required inputMode="decimal" className={inputClass} placeholder="1400" /></label>
      </> : <>
        <input type="hidden" name="rate_tier_count" value={tiers.length} />
        {tiers.map((tier, index) => <div key={`${tier.min}-${tier.max}`} className="grid gap-3 sm:grid-cols-[1fr_1fr] sm:items-end">
          <p className="text-sm text-white/65">{tier.min === tier.max ? `${tier.min} persona` : `${tier.min}–${tier.max} personas`}</p>
          <label className="text-xs text-white/45">Precio total por hora
            <input type="hidden" name={`rate_tier_${index}_max`} value={tier.max} />
            <input name={`rate_tier_${index}_price`} value={tier.price} onChange={(event) => setTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item))} required inputMode="decimal" className={`${inputClass} mt-2`} placeholder="1400" />
          </label>
        </div>)}
      </>}
      <label className="flex cursor-pointer items-center gap-3 text-sm text-white/65"><input type="checkbox" checked={advanced} disabled={!isPositiveIntegerCapacity(capacity)} onChange={(event) => toggleAdvanced(event.target.checked)} /> Configurar precios por cantidad de personas</label>
      {advanced && <p className="text-xs leading-5 text-white/40">Usamos hasta tres rangos consecutivos ya admitidos por FILMATTA. Puedes ajustar tarifas más tarde desde la ficha.</p>}
    </div>}
  </div>;
}

function optionClass(active: boolean) {
  return `flex cursor-pointer gap-3 rounded-xl border p-4 ${active ? "border-white/35 bg-white/[0.06]" : "border-white/10 bg-white/[0.02]"}`;
}

const inputClass = "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition placeholder:text-white/20 focus:border-white/35";
