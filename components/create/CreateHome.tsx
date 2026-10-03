import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { createSurfaces, getCreateSurface } from "@/lib/create/catalog";
import {
  ProductionVisual,
  RecVisual,
  ShotlistVisual,
  SketcherVisual,
  StoryboardVisual,
  WriterVisual,
} from "./ProductVisuals";
import "./create.css";

const journey = createSurfaces.filter((surface) =>
  ["writer", "shotlist", "storyboard", "production", "rec"].includes(surface.id),
);

function Status({ id }: { id: "writer" | "shotlist" | "storyboard" | "production" | "rec" }) {
  const surface = getCreateSurface(id);
  return <span className={`create-status is-${surface.availability}`}>{surface.statusLabel}</span>;
}

function FeatureList({ children }: { children: React.ReactNode }) {
  return <ul className="create-features">{children}</ul>;
}

export default function CreateHome() {
  return (
    <div className="create-home">
      <SiteHeader />
      <main>
        <section className="create-hero">
          <div className="create-hero-copy">
            <p className="create-lockup"><span>FILMATTA</span> CREATE</p>
            <h1>De la primera página al set.</h1>
            <p className="create-hero-intro">
              Empieza con Writer y convierte tus escenas en una shotlist. Una
              suite de herramientas conectadas para desarrollar, visualizar y
              preparar tu proyecto audiovisual.
            </p>
            <div className="create-actions">
              <Link className="create-primary" href="/writer">Empezar con Writer <span>↗</span></Link>
              <a className="create-secondary" href="#herramientas">Explorar herramientas <span>↓</span></a>
            </div>
            <div className="create-availability">
              <span><i className="is-live" /> Writer disponible</span>
              <span><i className="is-beta" /> Shotlist en beta</span>
              <span><i /> Visión de producto identificada</span>
            </div>
          </div>
          <div className="create-hero-product" aria-label="Writer y Shotlist conectados con el proyecto de demostración La Frecuencia">
            <div className="create-hero-writer"><WriterVisual compact /></div>
            <div className="create-hero-shotlist"><ShotlistVisual compact /></div>
            <div className="create-callout is-one"><b>01</b><span>Escribe la escena</span></div>
            <div className="create-callout is-two"><b>02</b><span>Diseña cada plano</span></div>
          </div>
        </section>

        <section id="herramientas" className="create-journey" aria-labelledby="journey-title">
          <div className="create-section-heading">
            <p>UN MISMO CONTEXTO CREATIVO</p>
            <h2 id="journey-title">Tu proceso. No una receta.</h2>
            <span>Las herramientas se conectan sin obligarte a usar cada etapa.</span>
          </div>
          <ol>
            {journey.map((surface, index) => (
              <li key={surface.id}>
                <a href={`#${surface.id}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{surface.name}</strong>
                  <small>{surface.statusLabel}</small>
                </a>
              </li>
            ))}
          </ol>
          <p className="create-journey-note">Storyboard es una capa visual opcional de Shotlist.</p>
        </section>

        <section id="writer" className="create-product-section">
          <div className="create-product-copy">
            <div className="create-product-title"><p>01 · ESCRITURA</p><Status id="writer" /></div>
            <h2>Escribe. Revisa. Entiende tu historia.</h2>
            <p>
              Writer mantiene el guion en el centro: formato audiovisual,
              versiones, navegación por escenas y herramientas de revisión que
              trabajan sobre tu propio texto.
            </p>
            <FeatureList>
              <li><b>Escritura y formato</b><span>Edición, importación y exportación según los formatos soportados.</span></li>
              <li><b>Revisión narrativa</b><span>Dudas, observaciones, Setup/Payoff, guía y Pulse.</span></li>
              <li><b>Breakdown integrado</b><span>Inspecciona personajes, locaciones, props y sus apariciones.</span></li>
            </FeatureList>
            <Link className="create-text-link" href="/writer">Abrir Writer <span>↗</span></Link>
          </div>
          <div className="create-product-evidence">
            <div className="create-real-shot is-writer">
              <Image
                src="/create-v1/writer-product.webp"
                alt="Writer de FILMATTA con el guion sintético La Frecuencia abierto"
                width={1440}
                height={684}
                sizes="(max-width: 820px) 100vw, 68vw"
                priority
              />
            </div>
            <div className="create-evidence-caption"><span>CAPTURA REAL · DATOS SINTÉTICOS</span><b>Revisa relaciones narrativas</b></div>
          </div>
        </section>

        <section id="shotlist" className="create-product-section is-reversed">
          <div className="create-product-copy">
            <div className="create-product-title"><p>02 · PREPRODUCCIÓN</p><Status id="shotlist" /></div>
            <h2>De la escena al plano, sin perder el contexto.</h2>
            <p>
              Shotlist convierte la intención del guion en cobertura editable.
              Cada fila conserva su escena, propiedades técnicas y objetivo
              narrativo.
            </p>
            <FeatureList>
              <li><b>Grid editable</b><span>Escenas agrupadas, planos, movimiento, lente, setup y estado.</span></li>
              <li><b>Libre / Asistido / Sugerido</b><span>La cobertura asistida es determinista; las propuestas de IA requieren acción explícita.</span></li>
              <li><b>Referencias y exportación</b><span>Adjunta referencias manuales y exporta el trabajo disponible.</span></li>
            </FeatureList>
            <Link className="create-text-link" href="/shotlists">Abrir Shotlist <span>↗</span></Link>
          </div>
          <div className="create-product-evidence">
            <div className="create-real-shot is-shotlist">
              <Image
                src="/create-v1/shotlist-product.webp"
                alt="Shotlist de FILMATTA con cobertura sintética de La Frecuencia"
                width={1440}
                height={900}
                sizes="(max-width: 820px) 100vw, 68vw"
              />
            </div>
            <div className="create-evidence-caption"><span>CAPTURA REAL · DATOS SINTÉTICOS</span><b>Edita cada plano</b></div>
          </div>
        </section>

        <section id="storyboard" className="create-concept-section">
          <div className="create-concept-heading">
            <div><p>03 · CAPA VISUAL OPCIONAL</p><Status id="storyboard" /></div>
            <h2>Piensa la secuencia antes de filmarla.</h2>
            <p>
              Visual Board reúne el brief de cada shot, referencias y bocetos
              en el orden narrativo de la shotlist. Úsalo cuando una escena
              necesite resolverse visualmente.
            </p>
          </div>
          <StoryboardVisual />
          <div className="sketcher-copy">
            <div>
              <p>SKETCHER</p>
              <h3>No necesitas un render perfecto para decidir un plano.</h3>
              <span>Dibuja, anota o añade referencias desde el contexto de tu shotlist.</span>
            </div>
            <ul><li>Dibujar</li><li>Subir referencia</li><li>Generar opcionalmente</li></ul>
          </div>
          <SketcherVisual />
        </section>

        <section id="production" className="create-concept-section production-section">
          <div className="create-concept-heading">
            <div><p>04 · PLANEACIÓN OPERATIVA</p><Status id="production" /></div>
            <h2>Convierte decisiones creativas en un plan filmable.</h2>
            <p>
              Production está diseñado para organizar jornadas, tareas,
              departamentos, recursos y faltantes. La necesidad detectada y el
              recurso confirmado permanecen claramente separados.
            </p>
          </div>
          <ProductionVisual />
        </section>

        <section id="rec" className="create-rec-section">
          <div className="create-rec-copy">
            <div className="create-product-title"><p>05 · EN EL SET</p><Status id="rec" /></div>
            <h2>Lleva el plan al set.</h2>
            <p>
              Production planea. REC consulta y registra la ejecución: jornada,
              shotlist, storyboard, tareas, documentos y notas operativas.
            </p>
            <div className="create-rec-points"><span>Jornada</span><span>Shots</span><span>Tareas</span><span>Docs</span></div>
            <small>Concepto de producto. No afirma una app nativa u operación offline disponible hoy.</small>
          </div>
          <RecVisual />
        </section>

        <section id="learn" className="create-learn-section">
          <div><p>LEARN · APOYO TRANSVERSAL</p><h2>Aprende a usar FILMATTA.</h2></div>
          <p>
            Explora los cursos y contenidos que ya están publicados. Los
            tutoriales específicos de CREATE se incorporarán cuando existan.
          </p>
          <Link className="create-secondary" href="/cursos">Ver contenido publicado <span>↗</span></Link>
        </section>

        <section className="create-final-cta">
          <p className="create-lockup"><span>FILMATTA</span> CREATE</p>
          <h2>Tu historia ya tiene una primera página.</h2>
          <p>Escríbela en Writer y prepara sus planos en Shotlist.</p>
          <Link className="create-primary" href="/writer">Empezar con Writer <span>↗</span></Link>
        </section>
      </main>
      <footer className="create-footer">
        <p className="create-lockup"><span>FILMATTA</span> CREATE</p>
        <nav><Link href="/cursos">Learn</Link><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link></nav>
        <span>© 2026 FILMATTA</span>
      </footer>
    </div>
  );
}
