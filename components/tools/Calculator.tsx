"use client";
import { useState, type FormEvent } from "react";
import type { UtilitySlug } from "@/lib/tools/registry";
import {
  angleToExposure,
  exposureToAngle,
  storageEstimate,
  aspectFromDimensions,
  dimensionFromAspect,
  focalFromCrop,
  focalFromSensor,
} from "@/lib/tools/formulas";
type Values = Record<string, string>;
const defaults: Record<UtilitySlug, Values> = {
  obturacion: { mode: "angle", fps: "24", angle: "180", denominator: "48" },
  almacenamiento: { mbps: "100", minutes: "60", margin: "0" },
  "relacion-aspecto": {
    mode: "calculate",
    width: "1920",
    height: "1080",
    ratioWidth: "16",
    ratioHeight: "9",
    known: "1920",
    axis: "width",
  },
  "focal-equivalente": {
    mode: "factor",
    focal: "50",
    crop: "1.5",
    sensorWidth: "24",
    sensorHeight: "16",
  },
};
const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { maximumSignificantDigits: 8 }).format(n);
export default function Calculator({ slug }: { slug: UtilitySlug }) {
  const [values, setValues] = useState<Values>(defaults[slug]);
  const [result, setResult] = useState<
    { label: string; value: string }[] | null
  >(null);
  const [error, setError] = useState("");
  const change = (key: string, value: string) => {
    setValues((old) => ({ ...old, [key]: value }));
    setResult(null);
    setError("");
  };
  const input = (
    key: string,
    label: string,
    min: number,
    max: number,
    step = "any",
  ) => (
    <label className="block text-sm" key={key}>
      {label}
      <input
        name={key}
        type="number"
        inputMode="decimal"
        required
        min={min}
        max={max}
        step={step}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
        className="catalog-input mt-2"
      />
    </label>
  );
  const select = (key: string, label: string, options: [string, string][]) => (
    <label className="block text-sm">
      {label}
      <select
        name={key}
        value={values[key]}
        onChange={(e) => change(key, e.target.value)}
        className="catalog-input mt-2"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const calculate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setResult(null);
    const n = (key: string) => {
      if (!values[key]?.trim())
        throw new Error("Completa todos los valores del cálculo.");
      const value = Number(values[key]);
      if (!Number.isFinite(value)) throw new Error("Usa números finitos.");
      return value;
    };
    try {
      if (slug === "obturacion") {
        const r =
          values.mode === "angle"
            ? angleToExposure(n("fps"), n("angle"))
            : exposureToAngle(n("fps"), n("denominator"));
        setResult([
          { label: "Ángulo de obturación", value: fmt(r.angle) + "°" },
          { label: "Tiempo de exposición", value: `1/${fmt(r.denominator)} s` },
          {
            label: "Tiempo en milisegundos",
            value: fmt(r.seconds * 1000) + " ms",
          },
        ]);
      }
      if (slug === "almacenamiento") {
        const r = storageEstimate(n("mbps"), n("minutes"), n("margin"));
        setResult([
          {
            label: "Estimación sin margen (decimal)",
            value: fmt(r.gb) + " GB",
          },
          {
            label: "Equivalente binario sin margen",
            value: fmt(r.gib) + " GiB",
          },
          {
            label: `Espacio con ${fmt(n("margin"))}% de margen`,
            value: fmt(r.plannedGb) + " GB",
          },
        ]);
      }
      if (slug === "relacion-aspecto") {
        if (values.mode === "analyse") {
          const r = aspectFromDimensions(n("width"), n("height"));
          setResult([
            {
              label: "Relación reducida",
              value: `${r.numerator}:${r.denominator}`,
            },
            { label: "Relación decimal", value: fmt(r.decimal) + ":1" },
          ]);
        } else {
          const r = dimensionFromAspect(
            n("known"),
            n("ratioWidth"),
            n("ratioHeight"),
            values.axis as "width" | "height",
          );
          setResult([
            {
              label: "Dimensiones redondeadas (ancho × alto)",
              value: `${r.width} × ${r.height} px`,
            },
            {
              label: "Dimensión calculada antes de redondear",
              value: fmt(r.exact) + " px",
            },
          ]);
        }
      }
      if (slug === "focal-equivalente") {
        const r =
          values.mode === "sensor"
            ? focalFromSensor(n("focal"), n("sensorWidth"), n("sensorHeight"))
            : focalFromCrop(n("focal"), n("crop"));
        setResult([
          { label: "Crop factor", value: fmt(r.crop) + "×" },
          {
            label: "Focal equivalente en full frame",
            value: fmt(r.equivalentMm) + " mm",
          },
          {
            label: "Focal física del objetivo (sin cambio)",
            value: fmt(n("focal")) + " mm",
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisa las entradas.");
    }
  };
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <form onSubmit={calculate} className="border-t border-white/20 pt-7">
        <h2 className="mb-7 text-2xl">Tus valores</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {slug === "obturacion" && (
            <>
              {select("mode", "Qué quieres convertir", [
                ["angle", "Ángulo → tiempo"],
                ["time", "Tiempo → ángulo"],
              ])}
              {input("fps", "Frecuencia de grabación (fps)", 0.001, 10000)}
              {values.mode === "angle"
                ? input("angle", "Ángulo (°)", 0.001, 360)
                : input(
                    "denominator",
                    "Tiempo 1/x s — introduce x",
                    0.001,
                    3.6e9,
                  )}
            </>
          )}
          {slug === "almacenamiento" && (
            <>
              {input("mbps", "Bitrate total (Mbps)", 0.001, 100000)}
              {input("minutes", "Duración (min)", 0, 10080)}
              {input("margin", "Margen adicional (%)", 0, 100)}
            </>
          )}
          {slug === "relacion-aspecto" && (
            <>
              {select("mode", "Qué quieres calcular", [
                ["calculate", "Dimensión desde proporción"],
                ["analyse", "Proporción desde dimensiones"],
              ])}
              {values.mode === "analyse" ? (
                <>
                  {input("width", "Ancho (px)", 1, 131072, "1")}
                  {input("height", "Alto (px)", 1, 131072, "1")}
                </>
              ) : (
                <>
                  {select("axis", "Dimensión conocida", [
                    ["width", "Ancho"],
                    ["height", "Alto"],
                  ])}
                  {input("known", "Dimensión conocida (px)", 1, 131072, "1")}
                  {input("ratioWidth", "Proporción horizontal", 0.001, 10000)}
                  {input("ratioHeight", "Proporción vertical", 0.001, 10000)}
                </>
              )}
            </>
          )}
          {slug === "focal-equivalente" && (
            <>
              {select("mode", "Referencia del cálculo", [
                ["factor", "Crop factor conocido"],
                ["sensor", "Dimensiones del área activa"],
              ])}
              {input("focal", "Focal del objetivo (mm)", 0.1, 10000)}
              {values.mode === "factor" ? (
                input("crop", "Crop factor (×)", 0.01, 100)
              ) : (
                <>
                  {input("sensorWidth", "Ancho del área activa (mm)", 1, 1000)}
                  {input("sensorHeight", "Alto del área activa (mm)", 1, 1000)}
                </>
              )}
            </>
          )}
        </div>
        <button className="editorial-primary mt-8" type="submit">
          Calcular →
        </button>
        {error && (
          <p
            role="alert"
            className="mt-6 border-l-2 border-red-300 pl-4 leading-7 text-red-200"
          >
            {error}
          </p>
        )}
      </form>
      <section
        className="min-w-0 border-t border-[#BFC0D7]/50 bg-[#BFC0D7]/[0.04] p-6 sm:p-8"
        aria-live="polite"
        aria-atomic="true"
      >
        <h2 className="text-sm uppercase tracking-widest text-[#BFC0D7]">
          Resultado
        </h2>
        {result ? (
          <dl className="mt-8 space-y-7">
            {result.map((row) => (
              <div key={row.label}>
                <dt className="text-sm leading-6 text-white/65">{row.label}</dt>
                <dd className="mt-2 break-words text-2xl tracking-tight sm:text-3xl">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-8 max-w-sm leading-8 text-white/65">
            Introduce tus valores y pulsa Calcular. Aquí verás el resultado con
            sus unidades.
          </p>
        )}
        <p className="mt-8 border-t border-white/15 pt-5 text-xs leading-6 text-white/60">
          Resultados mostrados con hasta ocho cifras significativas. No se
          envían tus entradas a un servidor.
        </p>
      </section>
    </div>
  );
}
