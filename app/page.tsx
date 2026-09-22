import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";
import { createClient } from "@/lib/supabase/server";
import { homeProfileAction, onboardingPath } from "@/lib/profiles/activation";
import { activationCompletion } from "@/lib/profiles/activation-completion";
import ActivationLink from "@/components/profiles/ActivationLink";
import type { MediaItem } from "@/lib/profiles/media";
import "./home.css";
export const metadata = {
  title: "El ecosistema de la industria audiovisual",
  description:
    "Crea tu presencia profesional, muestra tu trabajo y conecta con la comunidad audiovisual. Perfiles, proyectos, locaciones y aprendizaje en FILMATTA.",
};
export default async function Home() {
  const viewer = await getViewer();
  const profile = viewer ? await getOwnedProfessionalProfile(viewer.id) : null;
  const db = await createClient();
  const [media, preferences] = profile
    ? await Promise.all([
        db.rpc("get_profile_media", { p_slug: profile.slug }),
        db
          .from("profile_private_settings")
          .select("project_preferences")
          .eq("owner_id", viewer!.id)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  const completion = activationCompletion(
    profile,
    media.data as MediaItem[] | null,
    preferences.data?.project_preferences,
  );
  const cta = homeProfileAction(Boolean(viewer), profile, completion.percent);
  const profileHref = (intent: "talent" | "crew") =>
    viewer
      ? onboardingPath(intent)
      : `/registro?next=${encodeURIComponent(onboardingPath(intent))}`;
  const cards = [
    {
      intent: "talent",
      title: "¿Actúas o modelas?",
      text: "Crea un perfil profesional con fotos, Reel, experiencia y disponibilidad.",
      cta: "Crear perfil de talento",
      href: profileHref("talent"),
      image: "talent-portrait-13306757.webp",
      tag: "TALENTO",
    },
    {
      intent: "crew",
      title: "¿Trabajas en el medio audiovisual?",
      text: "Muestra tu trabajo, equipo, experiencia y disponibilidad.",
      cta: "Crear perfil profesional",
      href: profileHref("crew"),
      image: "camera.webp",
      tag: "PROFESIONALES",
    },
    {
      intent: "explore",
      title: "¿Buscas talento o crew?",
      text: "Explora profesionales audiovisuales y conoce el trabajo detrás de cada perfil.",
      cta: "Explorar perfiles",
      href: "/talento",
      image: "monitor.webp",
      tag: "COMUNIDAD",
    },
    {
      intent: "project",
      title: "¿Tienes un proyecto?",
      text: "Organiza la información básica y conecta con profesionales.",
      cta: "Crear proyecto",
      href: viewer ? "/proyectos/nuevo" : "/registro?next=%2Fproyectos%2Fnuevo",
      image: "camera.webp",
      tag: "PROYECTOS",
    },
    {
      intent: "locations",
      title: "¿Buscas dónde filmar?",
      text: "Explora locaciones para tu próxima producción.",
      cta: "Explorar locaciones",
      href: "/locaciones",
      image: "space.webp",
      tag: "LOCACIONES",
    },
    {
      intent: "learn",
      title: "¿Quieres aprender?",
      text: "Cursos prácticos para trabajar mejor en audiovisual.",
      cta: "Explorar Learn",
      href: "/learn",
      image: "monitor.webp",
      tag: "LEARN",
    },
  ] as const;
  return (
    <div className="activation-home">
      <SiteHeader />
      <main>
        <section className="ah-hero">
          <div className="ah-hero-copy">
            <p className="ah-kicker">
              EL ECOSISTEMA DE LA INDUSTRIA AUDIOVISUAL.
            </p>
            <h1>
              CREA.
              <br />
              CONECTA.
              <br />
              <span>HAZ QUE PASE.</span>
            </h1>
            <p className="ah-intro">
              Tu trabajo, tu gente, tu próximo proyecto.
              <br />
              Encuentra tu lugar en la comunidad audiovisual.
            </p>
            <div className="ah-actions">
              <ActivationLink
                href={cta.href}
                className="ah-primary"
                event="profile_completion_cta_clicked"
              >
                {cta.label} ↗
              </ActivationLink>
              <a href="#explorar">Explorar FILMATTA ↓</a>
            </div>
          </div>
          <div className="ah-hero-photo">
            <Image
              src="/images/editorial/camera.webp"
              alt="Cámara de cine durante una producción"
              fill
              priority
              sizes="(max-width: 800px) 100vw, 45vw"
            />
            <span>DE LA IDEA A LA PANTALLA.</span>
          </div>
        </section>
        {viewer && profile && completion.percent < 75 && (
          <aside className="ah-activation">
            <div>
              <span>Tu perfil está {completion.percent}% completo.</span>
              <p>Ayuda a que otros entiendan mejor tu trabajo.</p>
            </div>
            <ActivationLink
              event="profile_completion_cta_clicked"
              href={cta.href}
            >
              Continuar →
            </ActivationLink>
          </aside>
        )}
        <section id="explorar" className="ah-intents">
          <div className="ah-section-heading">
            <p className="ah-kicker">UN PUNTO DE PARTIDA PARA CADA HISTORIA</p>
            <h2>¿Qué quieres hacer?</h2>
            <p>
              Delante de cámara. Detrás de una idea.
              <br />
              Hay un lugar para lo que haces.
            </p>
          </div>
          <div className="ah-grid">
            {cards.map((card, i) => (
              <ActivationLink
                className={`ah-card ah-card--${i}`}
                key={card.intent}
                href={card.href}
                event="home_intent_clicked"
                category={card.intent}
              >
                <Image
                  src={`/images/editorial/${card.image}`}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 100vw, 50vw"
                />
                <div className="ah-card-shade" />
                <div className="ah-card-content">
                  <span className="ah-tag">{card.tag}</span>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                  <span className="ah-card-cta">
                    {card.cta}
                    <span aria-hidden>↗</span>
                  </span>
                </div>
              </ActivationLink>
            ))}
          </div>
        </section>
        <section className="ah-closing">
          <p className="ah-kicker">TU TRABAJO MERECE SER VISTO</p>
          <h2>
            Empieza con lo esencial.
            <br />
            Hazlo tuyo con el tiempo.
          </h2>
          <p>
            Una identidad profesional, una página para compartir y espacio para
            mostrar lo que haces.
          </p>
          <Link className="ah-primary" href={cta.href}>
            {cta.label} ↗
          </Link>
        </section>
      </main>
      <footer className="ah-footer">
        <span>FILMATTA</span>
        <nav>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
        </nav>
        <span>© 2026 FILMATTA</span>
      </footer>
    </div>
  );
}
