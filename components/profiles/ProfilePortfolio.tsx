import Link from "next/link";
import {
  AVAILABILITY_LABELS,
  PORTFOLIO_KIND_LABELS,
} from "@/lib/profiles/constants";
import {
  isTalent,
  leadReel,
  portfolioWebUrl,
  reelSource,
} from "@/lib/profiles/presentation";
import type { PublicProfessionalProfile } from "@/lib/profiles/types";
import ProfileImage from "./ProfileImage";
import ReelPlayer from "./ReelPlayer";
import ShareProfile from "./ShareProfile";
export default function ProfilePortfolio({
  profile,
  signedIn = false,
  preview = false,
}: {
  profile: PublicProfessionalProfile;
  signedIn?: boolean;
  preview?: boolean;
}) {
  const talent = isTalent(profile.disciplines),
    p = profile.presentation;
  const reel = leadReel(profile.portfolio_items);
  const work = profile.portfolio_items.filter(
    (item) => item !== reel && portfolioWebUrl(item.url),
  );
  const location = [profile.city, p.work_area].filter(Boolean).join(" · ");
  return (
    <article
      className={`profile-portfolio ${talent ? "profile-portfolio--talent" : ""}`}
    >
      <header className="profile-identity">
        <div>
          <p className="eyebrow">
            FILMATTA / {talent ? "Talento" : "Profesional audiovisual"}
          </p>
          <h1>{profile.display_name}</h1>
          {p.stage_name && <p className="profile-stage">{p.stage_name}</p>}
          <p className="profile-disciplines">
            {profile.disciplines.join(" · ")}
          </p>
          <div className="profile-meta">
            <span>{location || "Ciudad por confirmar"}</span>
            <span
              className="profile-availability"
              data-available={profile.availability === "available"}
            >
              {AVAILABILITY_LABELS[profile.availability]}
            </span>
          </div>
        </div>
        <a className="editorial-secondary" href="#contact">
          Contactar ↗
        </a>
      </header>
      <div className="profile-feature">
        {(talent || p.portrait_url) && (
          <figure className="profile-portrait">
            <ProfileImage
              src={p.portrait_url}
              alt={`Retrato de ${profile.display_name}`}
              eager
              fallback={profile.display_name.slice(0, 1)}
            />
            {talent && (
              <figcaption>Retrato / {profile.display_name}</figcaption>
            )}
          </figure>
        )}
        <div className="min-w-0">
          {reel ? (
            <ReelPlayer
              item={reel}
              poster={
                reelSource(reel.url)?.thumbnail
                  ? undefined
                  : p.book.find((item) => item.url !== p.portrait_url)?.url ||
                    p.portrait_url
              }
            />
          ) : p.book.length ? (
            <figure className="profile-feature-still">
              <ProfileImage
                src={p.book[0].url}
                alt={p.book[0].caption || "Trabajo seleccionado"}
                eager
              />
              <figcaption>
                {p.book[0].caption || "Trabajo seleccionado"}
              </figcaption>
            </figure>
          ) : (
            <div className="profile-no-reel">
              <p className="eyebrow">Presentación profesional</p>
              <p>
                {profile.bio || "Cada trayectoria tiene una forma de mirar."}
              </p>
              <span>El reel aún no está disponible.</span>
            </div>
          )}
        </div>
      </div>
      <div className="profile-body">
        <div className="min-w-0">
          {profile.bio && (
            <section className="profile-section">
              <p className="eyebrow">01 / Sobre mí</p>
              <h2>Una forma de {talent ? "interpretar." : "hacer."}</h2>
              <p className="profile-bio">{profile.bio}</p>
            </section>
          )}
          {(p.book.length > 0 || work.length > 0) && (
            <section className="profile-section">
              <p className="eyebrow">02 / Trabajo seleccionado</p>
              <h2>
                {talent ? "Book y material." : "El trabajo, en imágenes."}
              </h2>
              {p.book.length > 0 && (
                <div
                  className={`profile-book ${talent ? "profile-book--talent" : ""}`}
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
                            item.caption ||
                            `Book de ${profile.display_name}, imagen ${i + 1}`
                          }
                        />
                      </a>
                      <figcaption>{item.caption}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              <div className="profile-work">
                {work.map((item, i) => (
                  <a
                    href={portfolioWebUrl(item.url)!}
                    key={i}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="eyebrow">
                      {PORTFOLIO_KIND_LABELS[item.kind]}
                    </span>
                    <div>
                      <h3>{item.title}</h3>
                      {item.summary && <p>{item.summary}</p>}
                    </div>
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
            </section>
          )}
          {p.credits.length > 0 && (
            <section className="profile-section">
              <p className="eyebrow">03 / Experiencia</p>
              <h2>Detrás de cada crédito.</h2>
              <ul className="profile-credits">
                {p.credits.map((c, i) => (
                  <li key={i}>
                    <span>{c.year || "—"}</span>
                    <div>
                      <h3>{c.title}</h3>
                      <p>{c.role}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(profile.skills.length > 0 || profile.equipment.length > 0) && (
            <section className="profile-section">
              <p className="eyebrow">04 / Capacidades</p>
              <h2>
                {talent ? "Lo que aporto a escena." : "Oficio y herramientas."}
              </h2>
              <div className="profile-capabilities">
                {profile.skills.length > 0 && (
                  <div>
                    <h3>Habilidades</h3>
                    <ul>
                      {profile.skills.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {profile.equipment.length > 0 && (
                  <div>
                    <h3>Equipo y sistemas</h3>
                    <ul>
                      {profile.equipment.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
        <aside className="profile-contact" id="contact">
          <p className="eyebrow">El próximo proyecto</p>
          <h2>Hablemos de trabajo.</h2>
          <dl>
            <div>
              <dt>Base / zona de trabajo</dt>
              <dd>{location || "Por confirmar"}</dd>
            </div>
            <div>
              <dt>Disponibilidad</dt>
              <dd>{AVAILABILITY_LABELS[profile.availability]}</dd>
            </div>
            {p.rate_range && (
              <div>
                <dt>Rango orientativo</dt>
                <dd>{p.rate_range}</dd>
              </div>
            )}
          </dl>
          {profile.contact_policy === "closed" ? (
            <p>No recibe solicitudes por ahora.</p>
          ) : (
            <>
              {preview ? (
                <span className="profile-contact-note">
                  Contactar · acceso con cuenta
                </span>
              ) : signedIn ? (
                <>
                  <button
                    type="button"
                    className="editorial-secondary"
                    disabled
                  >
                    Contactar · próximamente
                  </button>
                  <p>
                    Las solicitudes entre perfiles aún no están disponibles.
                  </p>
                </>
              ) : (
                <>
                  <Link
                    className="editorial-primary"
                    href={`/login?next=${encodeURIComponent("/perfiles/" + profile.slug + "#contact")}`}
                  >
                    Contactar ↗
                  </Link>
                  <p>
                    Inicia sesión. Las solicitudes entre perfiles estarán
                    disponibles próximamente.
                  </p>
                </>
              )}
              <p className="profile-contact-note">
                Tu correo y teléfono no se muestran en esta página.
              </p>
            </>
          )}
          {!preview && <ShareProfile slug={profile.slug} />}
        </aside>
      </div>
      <footer className="profile-signature">
        <Link href={talent ? "/talento" : "/perfiles"}>
          ← {talent ? "Explorar talento" : "Explorar profesionales"}
        </Link>
        <span>Una identidad. Todo tu trabajo. / FILMATTA</span>
      </footer>
    </article>
  );
}
