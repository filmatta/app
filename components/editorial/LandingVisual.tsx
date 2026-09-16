import Image from "next/image";
import type { Landing } from "@/content/landings";

function Photo({ name, alt, portrait = false }: { name: string; alt: string; portrait?: boolean }) {
  return <Image src={`/images/editorial/${name}.webp`} width={1800} height={portrait ? 2700 : 1200}
    alt={alt} loading="eager" sizes={name === "space" ? "100vw" : "(min-width: 1024px) 50vw, 100vw"} className="editorial-photo" />;
}

export default function LandingVisual({ layout }: { layout: Landing["layout"] }) {
  if (layout === "spaces") return <figure className="space-visual">
    <Photo name="space" alt="Estudio vacío con espejos, ventanas amplias y luz natural" />
    <figcaption className="visual-caption"><span>Luz · Escala · Posibilidades</span><span>Fotografía editorial / Pexels</span></figcaption>
    <div className="space-notes" aria-label="Información para evaluar un espacio">
      {["01 / El espacio", "02 / Las condiciones", "03 / La conversación"].map(label => <span key={label}>{label}</span>)}
    </div>
  </figure>;
  if (layout === "board") return <div className="opportunity-visual">
    <p className="eyebrow">Una convocatoria, con contexto</p>
    <p className="mt-5 max-w-sm text-3xl leading-tight tracking-tight">Las preguntas correctas antes de decir que sí.</p>
    <dl className="mt-9">
      {[["Proyecto", "¿Qué van a producir?"], ["Disciplina", "¿Qué necesita el equipo?"], ["Condiciones", "¿Cuándo, dónde y con qué compensación?"], ["Participación", "¿Qué material debes presentar?"]].map(([term, description]) => <div className="brief-row" key={term}><dt>{term}</dt><dd>{description}</dd></div>)}
    </dl>
    <p className="mt-6 text-xs leading-5 text-white/50">Guía de lectura. No representa una convocatoria publicada.</p>
  </div>;
  if (layout === "learn") return <figure className="learn-visual">
    <Photo name="monitor" alt="Equipo de rodaje revisando una escena en un monitor" />
    <div className="learning-sequence"><span>Observa.</span><span>Practica.</span><span>Vuelve al set.</span></div>
    <figcaption className="visual-caption">El oficio se construye haciendo. / Fotografía editorial</figcaption>
  </figure>;
  if (layout === "talent") return <figure className="talent-visual">
    <Photo name="camera" portrait alt="Un actor aparece en el monitor durante una toma cinematográfica" />
    <figcaption className="visual-caption"><span>Material · Experiencia · Presencia</span><span>Fotografía editorial</span></figcaption>
  </figure>;
  return <figure className="portfolio-visual">
    <div className="flex items-center justify-between px-5 py-4 text-xs uppercase tracking-[0.18em] text-white/65"><span>Tu trabajo, a la vista</span><span aria-hidden="true" className="size-1.5 rounded-full bg-[#a9163f]" /></div>
    <Photo name="monitor" alt="Profesionales revisando material audiovisual en un monitor de rodaje" />
    <div className="portfolio-index"><span>01 / Reel</span><span>02 / Proyectos</span><span>03 / Experiencia</span></div>
    <figcaption className="px-5 pb-4 text-xs text-white/50">Composición editorial. Las personas de la imagen no son perfiles de FILMATTA.</figcaption>
  </figure>;
}
