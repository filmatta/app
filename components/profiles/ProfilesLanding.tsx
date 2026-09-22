import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { landings, landingActionHref } from "@/content/landings";
export default function ProfilesLanding({
  talent,
  signedIn,
}: {
  talent: boolean;
  signedIn: boolean;
}) {
  const landing = landings[talent ? "talento" : "perfiles"];
  const createHref = landingActionHref("/mi-perfil", signedIn);
  const catalogHref = talent ? "/talento" : "/perfiles";
  const catalogLabel = talent ? "Buscar talento" : "Explorar profesionales";
  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <main>
        <section
          className={`editorial-container profiles-landing-hero ${talent ? "profiles-landing-hero--talent" : ""}`}
        >
          <div className="profiles-hero-copy">
            <p className="eyebrow">FILMATTA / {landing.name}</p>
            <h1>{landing.title}</h1>
            <p>{landing.description}</p>
            <div className="editorial-actions">
              <Link href={createHref} className="editorial-primary">
                {landing.primary.label} ↗
              </Link>
              <Link
                href={catalogHref}
                className="editorial-secondary"
              >
                {catalogLabel} →
              </Link>
            </div>
            <p className="profiles-hero-note">
              Una identidad profesional. Todas tus disciplinas.
            </p>
          </div>
          <figure className="profiles-hero-figure">
            <div className="profiles-image-label">
              <span>{talent ? "ENCUADRE / 01" : "PORTAFOLIO / 01"}</span>
              <span>FILMATTA</span>
            </div>
            <Image
              src={
                talent
                  ? "/images/talent-portrait-8089657.webp"
                  : "/images/editorial/monitor.webp"
              }
              alt={
                talent
                  ? "Actriz en set de producción audiovisual frente a cámara"
                  : "Equipo audiovisual revisando una escena en un monitor"
              }
              width={talent ? 1200 : 1800}
              height={talent ? 1500 : 1200}
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
            />
            <figcaption>
              <span>
                {talent
                  ? "Presencia / Expresión / Interpretación"
                  : "Mirada / Oficio / Experiencia"}
              </span>
              <span>Imagen editorial · no es un perfil de FILMATTA</span>
            </figcaption>
          </figure>
        </section>
        <section className="editorial-container profiles-manifesto">
          <p className="eyebrow">
            01 / {talent ? "Material que habla por ti" : "Primero, tu trabajo"}
          </p>
          <div>
            <h2>
              {talent
                ? "Una imagen abre la conversación. Tu reel la continúa."
                : "Antes de leer lo que haces, que puedan verlo."}
            </h2>
            <p>
              {talent
                ? "Un retrato actual, un book cuidado y escenas que muestran tu registro. El material al frente; tu experiencia, justo donde aporta contexto."
                : "Tu luz. Tu montaje. Tu forma de contar. Selecciona un reel y las piezas que mejor presentan tu oficio. Cada proyecto tiene espacio para explicar tu participación."}
            </p>
            <div className="profiles-material-index">
              <span>01 — {talent ? "Retrato / Book" : "Demo reel"}</span>
              <span>
                02 — {talent ? "Reel / Escenas" : "Trabajo seleccionado"}
              </span>
              <span>03 — Experiencia</span>
            </div>
          </div>
        </section>
        <section className="editorial-container profiles-identity-story">
          <div>
            <p className="eyebrow">02 / Una identidad profesional</p>
            <h2>
              {talent
                ? "Tu experiencia, en contexto."
                : "Tu oficio no cabe en una sola etiqueta."}
            </h2>
            <p>
              {talent
                ? "Actuación, modelaje y otras disciplinas pueden convivir en una misma página. Presenta tus créditos y habilidades sin perder el centro: tu trabajo frente a cámara."
                : "Dirección y fotografía. Actuación y guion. Reúne tus disciplinas, experiencia, habilidades y equipo en un perfil que crece contigo."}
            </p>
          </div>
          <dl>
            {[
              [
                talent ? "Experiencia" : "Disciplinas",
                talent
                  ? "Producción, participación y año. Cada crédito con su contexto."
                  : "Varias formas de crear. Una misma identidad.",
              ],
              [
                "Ciudad y disponibilidad",
                "Dónde trabajas y cuándo puedes sumarte a un proyecto.",
              ],
              [
                talent ? "Habilidades" : "Habilidades y equipo",
                talent
                  ? "Idiomas, movimiento y recursos para la interpretación."
                  : "Tu práctica, tus herramientas y lo que puedes aportar.",
              ],
            ].map(([title, text], i) => (
              <div key={title}>
                <span aria-hidden="true">0{i + 1}</span>
                <div>
                  <dt>{title}</dt>
                  <dd>{text}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
        <section className="profiles-share-story">
          <div className="editorial-container">
            <p className="eyebrow">03 / Tu trabajo, donde te encuentren</p>
            <h2>Comparte tu perfil FILMATTA.</h2>
            <p>
              Un enlace para tu próxima conversación, tu firma de correo o una
              convocatoria. Publica cuando estés listo y vuelve a borrador
              cuando lo necesites.
            </p>
            <div className="profiles-url-example">
              <span>app.filmatta.com / perfiles /</span>
              <strong>tu-nombre</strong>
              <span aria-hidden="true">↗</span>
            </div>
            <p className="profiles-small-print">
              URL ilustrativa. Tu correo y teléfono permanecen privados. El
              contacto entre perfiles requerirá una cuenta cuando esté
              disponible.
            </p>
            <Link className="editorial-secondary" href={createHref}>
              Preparar mi perfil →
            </Link>
            <Link className="profiles-catalog-link" href={catalogHref}>
              {catalogLabel} ↗
            </Link>
          </div>
        </section>
        <section className="editorial-container profiles-ecosystem">
          <p className="eyebrow">04 / Parte de FILMATTA</p>
          <h2>
            {talent
              ? "Listo para la próxima convocatoria."
              : "Tu trabajo es el punto de partida."}
          </h2>
          <div>
            {(talent
              ? [
                  [
                    "Castings y oportunidades",
                    "Consulta requisitos y condiciones.",
                    "/oportunidades",
                  ],
                  ["Learn", "Sigue construyendo tu oficio.", "/cursos"],
                ]
              : [
                  [
                    "Oportunidades",
                    "Descubre convocatorias para tu disciplina.",
                    "/oportunidades",
                  ],
                  ["Jobs", "Explora encargos audiovisuales.", "/jobs"],
                  [
                    "Servicios",
                    "Conoce recursos para producir.",
                    "/marketplace",
                  ],
                  ["Learn", "Sigue construyendo tu oficio.", "/cursos"],
                ]
            ).map(([title, text, href]) => (
              <Link href={href} key={title}>
                <h3>
                  {title}
                  <span aria-hidden="true">↗</span>
                </h3>
                <p>{text}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="editorial-container profiles-final">
          <p className="eyebrow">Empieza con tu mejor trabajo</p>
          <h2>
            {talent
              ? "Que te vean como te presentas."
              : "Dale a tu trabajo su propio espacio."}
          </h2>
          <div className="editorial-actions">
            <Link className="editorial-primary" href={createHref}>
              {landing.primary.label} ↗
            </Link>
            <Link className="editorial-secondary" href={catalogHref}>
              {catalogLabel} →
            </Link>
          </div>
        </section>
      </main>
      <footer className="editorial-container editorial-footer">
        <Link href="/">FILMATTA</Link>
        <span>Personas, espacios y conocimiento para producir.</span>
        <Link href="/perfiles">Explorar perfiles</Link>
      </footer>
    </div>
  );
}
