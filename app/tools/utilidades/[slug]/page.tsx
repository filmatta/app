import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import Calculator from "@/components/tools/Calculator";
import { getUtility, type UtilitySlug } from "@/lib/tools/registry";
const notes: Record<
  UtilitySlug,
  {
    formula: string;
    assumptions: string[];
    source?: { label: string; href: string };
  }
> = {
  obturacion: {
    formula: "Tiempo (s) = ángulo / (360 × fps). Ángulo = tiempo × fps × 360.",
    assumptions: [
      "La frecuencia es la de grabación. Para 23.976 fps puedes introducir 23.976 o 23.976023976 para aproximar 24000/1001.",
      "El tiempo se introduce como 1/x segundos: para 1/48 s escribe 48. No puede superar la duración de un fotograma (360°).",
      "Límites de esta utilidad: 0.001–10 000 fps y 0.001–360°. No certifica ajustes disponibles en una cámara ni elimina parpadeo de luminarias.",
    ],
    source: {
      label: "Fórmula de exposición · RED",
      href: "https://docs.red.com/955-0219/955-0219_V1.2%20Rev-A1%20RED%20PS%2C%20KOMODO-X%20Operation%20Guide%20HTML/Content/4_Menus/01_Image_LUT/Shutter.htm",
    },
  },
  almacenamiento: {
    formula: "Bytes = Mbps × 1 000 000 × minutos × 60 / 8.",
    assumptions: [
      "Usa el bitrate medio total, incluido audio si quieres estimarlo. Mbps significa megabits por segundo; no megabytes.",
      "1 GB = 1 000 000 000 bytes. 1 GiB = 1 073 741 824 bytes. El archivo real varía con bitrate variable, metadatos y contenedor.",
      "El margen es una reserva que eliges, no un cálculo automático del contenedor. Rango: 0.001–100 000 Mbps, 0–10 080 minutos y 0–100% de margen.",
    ],
    source: {
      label: "Unidades decimales y binarias · IEC",
      href: "https://styleguide.iec.ch/?docs=iec/typographic/units-and-symbols",
    },
  },
  "relacion-aspecto": {
    formula:
      "Alto = ancho × proporción vertical / proporción horizontal. Para obtener ancho, se invierte la relación.",
    assumptions: [
      "Se asumen píxeles cuadrados. No aplica desanamorfización ni cambia metadatos de aspecto del píxel.",
      "Las dimensiones van de 1 a 131 072 píxeles enteros. La dimensión calculada se redondea al píxel más cercano; puede variar ligeramente la proporción y no se fuerza a múltiplos pares.",
      "Puedes introducir 2.39 y 1 para un cuadro 2.39:1. Confirma los múltiplos de dimensiones admitidos por tu códec antes de exportar.",
    ],
  },
  "focal-equivalente": {
    formula:
      "Crop diagonal = √(36² + 24²) / √(ancho² + alto²). Focal equivalente = focal física × crop.",
    assumptions: [
      "La referencia full frame es 36 × 24 mm. Usa las dimensiones del área activa del modo de grabación, no necesariamente las del sensor completo.",
      "La equivalencia por dimensiones compara la diagonal. Si cambia la relación de aspecto, no iguala simultáneamente el encuadre horizontal y vertical. Se asume un objetivo rectilíneo, sin anamorfización.",
      "El crop no cambia la focal física ni la perspectiva desde la misma posición. Este cálculo no estima profundidad de campo ni equivalencia de apertura.",
      "Se admiten focales de 0.1–10 000 mm, factores de 0.01–100× y dimensiones activas de 1–1 000 mm.",
    ],
    source: {
      label: "Referencia de formato FX 36 × 24 mm · Nikon",
      href: "https://www.nikonusa.com/learn-and-explore/c/products-and-innovation/dx-nikkor-lenses",
    },
  },
};
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = getUtility((await params).slug);
  return { title: tool?.name ?? "Utilidad no encontrada" };
}
export default async function UtilityPage({ params }: Props) {
  const tool = getUtility((await params).slug);
  if (!tool?.utility) notFound();
  const note = notes[tool.utility];
  return (
    <div className="editorial-page">
      <SiteHeader
        contextLink={{ href: "/tools/utilidades", label: "← Utilidades" }}
      />
      <main className="editorial-container py-14">
        <p className="eyebrow">Tools / {tool.category} / Disponible</p>
        <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
          {tool.name}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">
          {tool.description}
        </p>
        <div className="my-12">
          <Calculator slug={tool.utility} />
        </div>
        <section className="max-w-4xl border-t border-white/15 py-10">
          <h2 className="text-2xl">Fórmula y supuestos</h2>
          <p className="mt-5 break-words text-lg leading-8 text-[#BFC0D7]">
            {note.formula}
          </p>
          <ul className="mt-6 list-disc space-y-4 pl-5 leading-8 text-white/70">
            {note.assumptions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {note.source && (
            <a
              href={note.source.href}
              className="editorial-secondary mt-7"
              target="_blank"
              rel="noopener noreferrer"
            >
              {note.source.label} ↗
            </a>
          )}
          <p className="mt-8">
            <Link className="editorial-secondary" href="/tools/utilidades">
              Ver todas las utilidades →
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
