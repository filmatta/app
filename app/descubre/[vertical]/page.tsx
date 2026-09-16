import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import LandingVisual from "@/components/editorial/LandingVisual";
import { getLanding, landingActionHref } from "@/content/landings";
import { getViewer } from "@/lib/auth/get-viewer";

type Props = { params: Promise<{ vertical: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const landing = getLanding((await params).vertical);
  return landing ? { title: landing.name, description: landing.description } : {};
}

export default async function EditorialLanding({ params }: Props) {
  const { vertical } = await params;
  const landing = getLanding(vertical);
  if (!landing) notFound();
  const viewer = await getViewer();
  const href = (path: string) => landingActionHref(path, Boolean(viewer));
  return <div className="editorial-page" style={{ "--vertical-accent": landing.accent } as CSSProperties}>
    <SiteHeader />
    <main>
      <section className={`editorial-container editorial-hero hero-${landing.layout}`}>
        <div className="hero-copy">
          <p className="eyebrow"><span aria-hidden="true">/</span> FILMATTA {landing.name}</p>
          <h1>{landing.title}</h1>
          <p className="hero-description">{landing.description}</p>
          <div className="editorial-actions">
            <Link className="editorial-primary" href={href(landing.primary.href)}>{landing.primary.label}<span aria-hidden="true">↗</span></Link>
            <Link className="editorial-secondary" href={href(landing.secondary.href)}>{landing.secondary.label}<span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <LandingVisual layout={landing.layout} />
      </section>
      <section className="editorial-container editorial-capabilities" aria-label={`Qué puedes hacer en ${landing.name}`}>
        {landing.capabilities.map((item, index) => <article key={item.title}>
          <p className="eyebrow">0{index + 1}</p><h2>{item.title}</h2><p>{item.description}</p>
        </article>)}
      </section>
      <section className="editorial-container editorial-process">
        <div><p className="eyebrow">Cómo funciona</p><h2>Un siguiente paso claro.</h2>
          {vertical === "locaciones" && <p>La primera versión permite publicar y evaluar espacios. Las reservas y el contacto privado desde FILMATTA todavía no están disponibles.</p>}
          {vertical === "oportunidades" && <p>Publica una convocatoria con el contexto de su proyecto. Puedes empezar con un borrador y hacerla visible cuando esté lista.</p>}
          {vertical === "jobs" && <p>Jobs forma parte de Oportunidades. La primera versión permite presentar interés por consulta privada; no gestiona contratación ni pagos.</p>}
          {vertical === "marketplace" && <p>Esta primera versión es un directorio de contacto. FILMATTA no gestiona pagos, reservas, depósitos, seguros ni disputas entre participantes.</p>}
        </div>
        <ol>{landing.steps.map((step, index) => <li key={step}><span aria-hidden="true">0{index + 1}</span><p>{step}</p></li>)}</ol>
      </section>
      <section className="editorial-connection"><div className="editorial-container">
        <p className="eyebrow">Parte de un mismo ecosistema</p><h2>{landing.connection.title}</h2>
        <p>{landing.connection.description}</p><Link className="editorial-secondary" href={href(landing.connection.href)}>{landing.connection.label} <span aria-hidden="true">↗</span></Link>
      </div></section>
      <section className="editorial-container editorial-final">
        <p className="eyebrow">CREA · CONECTA · HAZ QUE PASE</p><h2>Haz que pase.</h2>
        <Link className="editorial-primary" href={href(landing.primary.href)}>{landing.primary.label}<span aria-hidden="true">→</span></Link>
      </section>
    </main>
    <footer className="editorial-container editorial-footer"><Link href="/">FILMATTA</Link><span>Personas, espacios y conocimiento para producir.</span><Link href="/planes">Planes</Link></footer>
  </div>;
}
