import SiteHeader from "@/components/SiteHeader";
import ToolCards from "@/components/tools/ToolCards";
import { utilityTools } from "@/lib/tools/registry";
export const metadata = { title: "Utilidades · Calculadoras audiovisuales" };
export default function UtilitiesPage() {
  return (
    <div className="editorial-page">
      <SiteHeader contextLink={{ href: "/tools", label: "← Tools" }} />
      <main className="editorial-container py-16">
        <p className="eyebrow">Tools / Utilidades</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl">
          Resuelve lo técnico. Sigue creando.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-white/70">
          Calculadoras y conversores para cámara y video, con resultados claros
          y supuestos visibles. Cuatro utilidades disponibles, sin registro.
        </p>
        <div className="my-12">
          <ToolCards items={utilityTools} />
        </div>
        <section className="grid gap-8 border-t border-white/15 pt-10 md:grid-cols-3">
          {[
            [
              "Cámara y óptica.",
              "Relaciona exposición, frecuencia de grabación y encuadre.",
            ],
            [
              "Video y almacenamiento.",
              "Calcula dimensiones y estima espacio para tus archivos.",
            ],
            [
              "La siguiente iteración.",
              "FOV avanzado, profundidad de campo, electricidad y seguridad de set quedan pendientes de revisión técnica.",
            ],
          ].map(([t, d]) => (
            <div key={t}>
              <h2 className="text-2xl">{t}</h2>
              <p className="mt-4 leading-7 text-white/65">{d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
