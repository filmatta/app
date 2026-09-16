import type { CSSProperties } from "react";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import ToolCards from "@/components/tools/ToolCards";
import { tools } from "@/lib/tools/registry";
export const metadata = { title: "Tools · Herramientas audiovisuales" };
export default function ToolsPage() {
  return (
    <div
      className="editorial-page"
      style={{ "--vertical-accent": "#BFC0D7" } as CSSProperties}
    >
      <SiteHeader />
      <main className="editorial-container py-16">
        <section className="grid gap-12 border-b border-white/15 pb-14 lg:grid-cols-[2fr_1fr]">
          <div>
            <p className="eyebrow">FILMATTA / Tools</p>
            <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-7xl">
              Menos tareas dispersas. Más espacio para crear.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/70">
              Escritura, organización y utilidades técnicas reunidas en un mismo
              lugar para acompañar tu proceso audiovisual.
            </p>
            <Link className="editorial-primary mt-8" href="#herramientas">
              Explorar herramientas ↓
            </Link>
          </div>
          <ol className="self-end border-l border-white/20 pl-7">
            {[
              [
                "01",
                "Escribir y comprender.",
                "Conoce la visión de Writer, en desarrollo.",
              ],
              [
                "02",
                "Preparar y organizar.",
                "Explora la dirección de Production Assistant.",
              ],
              [
                "03",
                "Calcular y resolver.",
                "Usa cuatro calculadoras disponibles hoy.",
              ],
            ].map(([n, t, d]) => (
              <li className="py-5" key={n}>
                <span className="text-xs text-[#BFC0D7]">{n}</span>
                <h2 className="mt-2 text-xl">{t}</h2>
                <p className="mt-2 text-sm leading-6 text-white/65">{d}</p>
              </li>
            ))}
          </ol>
        </section>
        <section id="herramientas" className="scroll-mt-8 py-14">
          <p className="eyebrow mb-6">Elige por lo que necesitas resolver</p>
          <ToolCards items={tools} />
        </section>
        <section className="grid gap-8 border-y border-white/15 py-12 md:grid-cols-2">
          <div>
            <h2 className="text-3xl">Un cálculo, con contexto.</h2>
            <p className="mt-5 max-w-xl leading-8 text-white/70">
              Elige una utilidad, introduce tus valores y revisa el resultado
              junto con sus unidades y supuestos. Los cálculos se realizan en tu
              navegador.
            </p>
          </div>
          <div>
            <h2 className="text-3xl">Del conocimiento a la práctica.</h2>
            <p className="mt-5 max-w-xl leading-8 text-white/70">
              Las herramientas acompañan tu criterio. Learn conecta el cálculo
              con el oficio y el trabajo en set.
            </p>
            <Link href="/cursos" className="editorial-secondary mt-5">
              Explorar Learn ↗
            </Link>
          </div>
        </section>
        <section className="py-16">
          <p className="eyebrow">CREA · CONECTA · HAZ QUE PASE</p>
          <h2 className="mt-5 text-4xl">Resuelve lo siguiente.</h2>
          <Link className="editorial-primary mt-7" href="/tools/utilidades">
            Ver utilidades →
          </Link>
        </section>
      </main>
    </div>
  );
}
