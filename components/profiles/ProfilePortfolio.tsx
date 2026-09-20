import Link from "next/link";
import type { ReactNode } from "react";
import {
  AVAILABILITY_LABELS,
  PORTFOLIO_KIND_LABELS,
} from "@/lib/profiles/constants";
import {
  isTalent,
  leadReel,
  portfolioWebUrl,
  professionalName,
  reelSource,
} from "@/lib/profiles/presentation";
import type { PublicProfessionalProfile } from "@/lib/profiles/types";
import ProfileImage from "./ProfileImage";
import ReelPlayer from "./ReelPlayer";
import ShareProfile from "./ShareProfile";
import ProfileBio from "./ProfileBio";
import ProfileContactDialog from "./ProfileContactDialog";
import "./profile-public-v2.css";

export default function ProfilePortfolio({
  profile,
  signedIn = false,
  owner = false,
  preview = false,
  media,
  sectionControls = {},
}: {
  profile: PublicProfessionalProfile;
  signedIn?: boolean;
  owner?: boolean;
  preview?: boolean;
  media?: ReactNode;
  sectionControls?: Partial<
    Record<"identity" | "about" | "credits" | "skills", ReactNode>
  >;
}) {
  const talent = isTalent(profile.disciplines),
    p = profile.presentation;
  const name = professionalName(profile);
  const reel = leadReel(profile.portfolio_items);
  const work = profile.portfolio_items.filter(
    (item) => item !== reel && portfolioWebUrl(item.url),
  );
  const secondary = work
    .filter((item) => item.kind !== "link" && reelSource(item.url))
    .slice(0, 2);
  const remaining = work.filter((item) => !secondary.includes(item));
  const location = [profile.city, p.work_area].filter(Boolean).join(" · ");
  const cover =
    p.book.find((item) => item.url !== p.portrait_url)?.url ||
    (reel ? reelSource(reel.url)?.thumbnail : undefined);
  const visual = Boolean(media || reel || p.book.length);
  return (
    <article className={`profile-public-v2 ${talent ? "p2-talent" : ""}`}>
      <header className={`p2-hero ${cover ? "p2-hero--image" : ""}`}>
        {cover && (
          <div className="p2-cover" aria-hidden="true">
            <ProfileImage src={cover} alt="" eager />
          </div>
        )}
        <p className="eyebrow">FILMATTA / {talent ? "Talento" : "Perfiles"}</p>
        <div className="p2-identity">
          {p.portrait_url && (
            <div className="p2-portrait profile-portrait">
              <ProfileImage
                src={p.portrait_url}
                alt={`Retrato de ${name}`}
                eager
                fallback={name.slice(0, 1)}
              />
            </div>
          )}
          <div className="p2-name">
            <h1>{name}</h1>
            <p>{profile.disciplines.join(" · ")}</p>
            <div className="p2-meta">
              {location && <span>{location}</span>}
              <span
                className="profile-availability"
                data-available={profile.availability === "available"}
              >
                {AVAILABILITY_LABELS[profile.availability]}
              </span>
            </div>
          </div>
          <div className="p2-actions">
            {preview ? null : owner ? (
              <Link className="p2-contact-button" href="/mi-perfil">Editar perfil</Link>
            ) : profile.contact_policy === "members_only" ? (
              signedIn ? <ProfileContactDialog slug={profile.slug} name={name} compact /> :
                <Link className="p2-contact-button" href={`/login?next=${encodeURIComponent("/perfiles/" + profile.slug + "#contact")}`}>Contactar ↗</Link>
            ) : null}
            {!preview && <ShareProfile slug={profile.slug} compact />}
          </div>
        </div>
        {sectionControls.identity}
      </header>
      <div className="p2-layout">
        <div className="p2-main">
          <nav className="p2-nav" aria-label="Secciones del perfil">
            {visual && <a href="#portfolio">Portfolio</a>}
            {profile.bio && <a href="#about">Sobre mí</a>}
            {p.credits.length > 0 && <a href="#credits">Créditos</a>}
            <a href="#contact">Contacto</a>
          </nav>
          {media}
          {media === undefined && visual && (
            <section className="p2-portfolio" id="portfolio">
              <div className="p2-section-heading">
                <h2>
                  {reel
                    ? "Trabajo destacado"
                    : talent
                      ? "Book"
                      : "Trabajo seleccionado"}
                </h2>
                {reel && <span>Reel principal</span>}
              </div>
              {reel && (
                <div
                  className={`p2-feature ${secondary.length ? "p2-feature--multiple" : ""}`}
                >
                  <ReelPlayer
                    item={reel}
                    poster={
                      reelSource(reel.url)?.thumbnail
                        ? undefined
                        : cover || p.portrait_url
                    }
                  />
                  {secondary.length > 0 && (
                    <div className="p2-secondary">
                      {secondary.map((item, i) => (
                        <ReelPlayer
                          key={i}
                          item={item}
                          poster={
                            reelSource(item.url)?.thumbnail
                              ? undefined
                              : p.book[i + 1]?.url || cover || undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {p.book.length > 0 && (
                <section className="p2-gallery-section">
                  {reel && (
                    <div className="p2-section-heading">
                      <h2>{talent ? "Book" : "Imágenes de mi trabajo"}</h2>
                      <span>
                        {p.book.length}{" "}
                        {p.book.length === 1 ? "imagen" : "imágenes"}
                      </span>
                    </div>
                  )}
                  <div
                    className={`p2-gallery ${talent ? "p2-gallery--talent" : ""} ${!reel ? "p2-gallery--lead" : ""}`}
                  >
                    {p.book.map((item, i) => (
                      <figure key={i}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir imagen: ${item.caption || i + 1}`}
                        >
                          <ProfileImage
                            src={item.url}
                            alt={
                              item.caption || `Book de ${name}, imagen ${i + 1}`
                            }
                            eager={!reel && i === 0}
                          />
                        </a>
                        {item.caption && (
                          <figcaption>{item.caption}</figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                </section>
              )}
            </section>
          )}
          {media === undefined && remaining.length > 0 && (
            <section className="p2-work">
              <h2>Trabajos y enlaces</h2>
              {remaining.map((item, i) => (
                <a
                  key={i}
                  href={portfolioWebUrl(item.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div>
                    <span>{PORTFOLIO_KIND_LABELS[item.kind]}</span>
                    <h3>{item.title}</h3>
                    {item.summary && <p>{item.summary}</p>}
                  </div>
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            </section>
          )}
          {sectionControls.about}
          {profile.bio && <ProfileBio text={profile.bio} />}
          {sectionControls.credits}
          {p.credits.length > 0 && (
            <section className="p2-credits" id="credits">
              <h2>Créditos seleccionados</h2>
              <ul>
                {p.credits.map((credit, i) => (
                  <li key={i}>
                    <h3>{credit.title}</h3>
                    <p>
                      {[credit.role, credit.year].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!visual &&
            !profile.bio &&
            !p.credits.length &&
            !remaining.length && (
              <p className="p2-empty">El portfolio aún está en preparación.</p>
            )}
        </div>
        <aside className="p2-aside">
          <section className="p2-information">
            <h2>Información profesional</h2>
            {sectionControls.skills}
            <dl>
              {location && (
                <div>
                  <dt>Ciudad / zona</dt>
                  <dd>{location}</dd>
                </div>
              )}
              <div>
                <dt>Disciplinas</dt>
                <dd>{profile.disciplines.join(" · ")}</dd>
              </div>
              <div>
                <dt>Disponibilidad</dt>
                <dd>{AVAILABILITY_LABELS[profile.availability]}</dd>
              </div>
              {profile.skills.length > 0 && (
                <div>
                  <dt>{talent ? "Habilidades en escena" : "Habilidades"}</dt>
                  <dd>{profile.skills.join(" · ")}</dd>
                </div>
              )}
              {profile.equipment.length > 0 && (
                <div>
                  <dt>Equipo / herramientas</dt>
                  <dd>{profile.equipment.join(" · ")}</dd>
                </div>
              )}
              {p.rate_range && (
                <div>
                  <dt>Rango orientativo</dt>
                  <dd>{p.rate_range}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className="p2-contact" id="contact">
            <h2>Contacto protegido</h2>
            {profile.contact_policy === "closed" ? (
              <p>No recibe solicitudes por ahora.</p>
            ) : (
              <>
                {preview ? (
                  <p>Contactar · acceso con cuenta</p>
                ) : owner ? (
                  <><Link className="p2-contact-button" href="/mi-perfil">Editar mi perfil</Link><p>Este es tu perfil público.</p></>
                ) : signedIn ? (
                  <ProfileContactDialog slug={profile.slug} name={name} />
                ) : (
                  <>
                    <Link
                      className="p2-contact-button"
                      href={`/login?next=${encodeURIComponent("/perfiles/" + profile.slug + "#contact")}`}
                    >
                      Contactar ↗
                    </Link>
                    <p>
                      Inicia sesión para enviar una consulta privada.
                    </p>
                  </>
                )}
                <p>El correo y teléfono no se muestran en esta página.</p>
              </>
            )}
          </section>
          {!preview && <ShareProfile slug={profile.slug} />}
        </aside>
      </div>
      <footer className="p2-footer">
        <Link href={talent ? "/talento" : "/perfiles"}>
          ← {talent ? "Explorar talento" : "Explorar profesionales"}
        </Link>
        <span>FILMATTA / Portfolio profesional</span>
      </footer>
    </article>
  );
}
