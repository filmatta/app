"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import LocationGeographyFields from "@/components/locations/LocationGeographyFields";
import LocationStarterPricing from "@/components/locations/LocationStarterPricing";
import { LOCATION_CONDITION_LABELS } from "@/lib/locations/conditions";

const BASIC_CONDITIONS = [
  ["day_shoots", "Rodaje diurno"],
  ["night_shoots", "Rodaje nocturno"],
  ["rearrange_furniture", "Mover mobiliario"],
  ["loud_music", "Música alta"],
  ["cats_dogs", "Animales domésticos"],
] as const;

export default function NewLocationWizard({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [step, setStep] = useState(1);
  const [creationKey] = useState(() => crypto.randomUUID());
  const form = useRef<HTMLFormElement>(null);

  function go(next: number) {
    if (next > step && !validateStep(form.current, step)) return;
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <form ref={form} action={action} className="mt-10">
    <input type="hidden" name="creation_key" value={creationKey} />
    <input type="hidden" name="environment" value="both" />
    <div className="mb-9 flex gap-2" aria-label={`Paso ${step} de 3`}>
      {[1, 2, 3].map((item) => <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= step ? "bg-white" : "bg-white/10"}`} />)}
    </div>

    <section data-step="1" hidden={step !== 1} className="space-y-7">
      <header><p className="text-xs font-semibold uppercase tracking-[.24em] text-white/35">Paso 1 de 3</p><h2 className="mt-3 text-3xl font-semibold">El espacio</h2><p className="mt-3 text-sm leading-6 text-white/45">Sólo necesitamos identificarlo y ubicarlo de forma general. La dirección exacta sigue siendo privada.</p></header>
      <label className="block"><span className="mb-2 block text-sm text-white/55">Nombre</span><input name="title" required maxLength={160} className={inputClass} placeholder="Casa modernista en Coyoacán" /></label>
      <label className="block"><span className="mb-2 block text-sm text-white/55">Tipo de espacio</span><input name="space_type" required maxLength={120} list="location-space-types" className={inputClass} placeholder="Casa, estudio, foro…" /><datalist id="location-space-types"><option value="Casa" /><option value="Departamento" /><option value="Estudio" /><option value="Foro" /><option value="Oficina" /><option value="Bodega" /><option value="Terraza" /><option value="Jardín" /></datalist></label>
      <LocationGeographyFields />
    </section>

    <section data-step="2" hidden={step !== 2} className="space-y-7">
      <header><p className="text-xs font-semibold uppercase tracking-[.24em] text-white/35">Paso 2 de 3</p><h2 className="mt-3 text-3xl font-semibold">Capacidad y precio</h2><p className="mt-3 text-sm leading-6 text-white/45">Puedes empezar con una sola tarifa o dejarla como “Consultar”. Los rangos siguen siendo opcionales.</p></header>
      <LocationStarterPricing />
    </section>

    <section data-step="3" hidden={step !== 3} className="space-y-7">
      <header><p className="text-xs font-semibold uppercase tracking-[.24em] text-white/35">Paso 3 de 3</p><h2 className="mt-3 text-3xl font-semibold">Condiciones básicas</h2><p className="mt-3 text-sm leading-6 text-white/45">Responde sólo lo que ya sabes. “Sin especificar” no se convierte en No y podrás completar las nueve categorías después.</p></header>
      <div className="grid gap-4 sm:grid-cols-2">
        {BASIC_CONDITIONS.map(([key, label]) => <label key={key} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><span className="mb-3 block text-sm text-white/75">{label}</span><select name={`condition.${key}`} defaultValue="" className={inputClass}><option value="">Sin especificar</option>{Object.entries(LOCATION_CONDITION_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
      </div>
      <p className="rounded-xl border border-white/10 bg-white/[0.025] p-4 text-xs leading-5 text-white/45">Al crearla se guardará como borrador y abrirás su ficha editable. Ahí podrás añadir fotos y grabar el recorrido, cuando ya exista un ID real.</p>
    </section>

    <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-7">
      {step > 1 ? <button type="button" onClick={() => go(step - 1)} className={secondaryButton}>Atrás</button> : <span />}
      {step < 3 ? <button type="button" onClick={() => go(step + 1)} className={primaryButton}>Continuar</button> : <CreateButton />}
    </div>
  </form>;
}

function CreateButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Creando…" : "Crear mi locación"}</button>;
}

function validateStep(form: HTMLFormElement | null, step: number) {
  const section = form?.querySelector<HTMLElement>(`[data-step="${step}"]`);
  if (!section) return false;
  const fields = Array.from(section.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea"));
  const invalid = fields.find((field) => !field.checkValidity());
  if (!invalid) return true;
  invalid.reportValidity(); invalid.focus(); return false;
}

const inputClass = "w-full rounded-xl border border-white/10 bg-[#111111] px-4 py-3 text-white outline-none transition placeholder:text-white/20 focus:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";
const primaryButton = "rounded-full bg-white px-7 py-3.5 font-semibold text-black transition hover:bg-white/85 disabled:cursor-wait disabled:opacity-55";
const secondaryButton = "rounded-full border border-white/15 px-7 py-3.5 font-semibold text-white/70 transition hover:bg-white/[0.06] hover:text-white";
