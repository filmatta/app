import ProfileAvatar from "./ProfileAvatar";
import "./activation-owner.css";
import StatusBadge from "@/components/ui/StatusBadge";
import { MetaChips } from "@/components/ui/MetaChip";
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
import IdentityImage from "./IdentityImage";
import { sortedCredits, creditPeriod } from "@/lib/profiles/credits";
import { formatRate } from "@/lib/profiles/rate";
import ReelPlayer from "./ReelPlayer";
import ShareProfile from "./ShareProfile";
import ProfileBio from "./ProfileBio";
import ProfessionalDetails from "./ProfessionalDetails";
import ProfileContactSection from "./ProfileContactSection";
import ProfileProjectPreferences from "./ProfileProjectPreferences";
import ProfileDetailIcon from "./ProfileDetailIcon";
import type { ProjectPreferences } from "@/lib/profiles/project-preferences";
import type { ContactAccess } from "@/lib/profiles/social";
import "./profile-public-v2.css";

export default function ProfilePortfolio({
  profile,
  signedIn = false,
  owner = false,
  preview = false,
  media,
  mediaSections,
  follow,
  socialProof,
  preferences = null,
  contactAccess,
  editAction,
  sectionControls = {},
}: {
  profile: PublicProfessionalProfile;
  signedIn?: boolean;
  owner?: boolean;
  preview?: boolean;
  media?: ReactNode;
  mediaSections?: string[];
  follow?: ReactNode;
  socialProof?: ReactNode;
  preferences?: ProjectPreferences | null;
  contactAccess?: ContactAccess | null;
  editAction?: ReactNode;
  sectionControls?: Partial<
    Record<"identity" | "cover" | "about" | "credits" | "skills", ReactNode>
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
  const cover = undefined; // Cover never derives from Book or Reel.
  const visual = Boolean(media || reel || p.book.length);
  return (
    <article className={`profile-public-v2 ${talent ? "p2-talent" : ""}`}>
      {sectionControls.cover}
      <header
        data-tour-target={preview ? "preview" : undefined}
        className={`p2-hero ${p.cover_media_id || cover ? "p2-hero--image" : "p2-hero--neutral"}`}
      >
        {(p.cover_media_id || cover) && (
          <div className="p2-cover" aria-hidden="true">
            <IdentityImage
              id={p.cover_media_id}
              fallbackUrl={cover}
              alt=""
              eager
            />
          </div>
        )}
        <div className="p2-availability" data-state={profile.availability}>
          <StatusBadge
            tone={
              profile.availability === "available"
                ? "success"
                : profile.availability === "limited"
                  ? "warning"
                  : "neutral"
            }
          >
            {AVAILABILITY_LABELS[profile.availability]}
          </StatusBadge>
        </div>
        <p className="eyebrow">FILMATTA / {talent ? "Talento" : "Perfiles"}</p>
        <div className="p2-identity">
          <div className="p2-portrait profile-portrait">
            <ProfileAvatar
              id={p.portrait_media_id}
              fallbackUrl={p.portrait_url}
              name={name}
            />
          </div>
          <div className="p2-name">
            <h1>{name}</h1>
            {follow}
            <MetaChips labels={profile.disciplines} limit={3} />
            <div className="p2-meta">{location && <span>{location}</span>}</div>
          </div>
          <div className="p2-actions">
            {editAction}
            {preview ? null : owner ? (
              <Link className="p2-contact-button" href="/mi-perfil">
                Editar perfil
              </Link>
            ) : null}
            {!preview && <ShareProfile slug={profile.slug} compact />}
          </div>
        </div>
        {sectionControls.identity}
      </header>
      <div className="p2-layout">
        <nav className="p2-nav" aria-label="Secciones del perfil">
          {(profile.bio || preview) && <a href="#about">Sobre mí</a>}
          {(preview ||
            (mediaSections ? mediaSections.includes("reel") : reel)) && (
            <a href="#reel">Reel</a>
          )}
          {(preview ||
            (mediaSections
              ? mediaSections.includes("work")
              : secondary.length > 0)) && <a href="#videos">Videos</a>}
          {(preview ||
            (mediaSections
              ? mediaSections.includes("book")
              : p.book.length > 0)) && <a href="#book">Book</a>}
          {(p.credits.length > 0 || preview) && (
            <a href="#credits">Trayectoria</a>
          )}
        </nav>
        {(profile.bio || sectionControls.about) && (
          <div className="p2-about">
            {sectionControls.about}
            {profile.bio && <ProfileBio text={profile.bio} />}
          </div>
        )}
        <aside className="p2-aside">
          {sectionControls.skills}
          <ProfessionalDetails>
            <section className="p2-information">
              <dl>
                {(p.rate || p.rate_range) && (
                  <div>
                    <dt>Tarifa aproximada</dt>
                    <dd>{p.rate ? formatRate(p.rate) : p.rate_range}</dd>
                  </div>
                )}
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
                {profile.skills.length > 0 && (
                  <div>
                    <dt>
                      <ProfileDetailIcon kind="skills" />
                      {talent ? "Habilidades en escena" : "Habilidades"}
                    </dt>
                    <dd className="p2-detail-chips">
                      {profile.skills.map((skill) => (
                        <span key={skill}>{skill}</span>
                      ))}
                    </dd>
                  </div>
                )}
                {profile.equipment.length > 0 && (
                  <div>
                    <dt>
                      <ProfileDetailIcon kind="equipment" />
                      Equipo / herramientas
                    </dt>
                    <dd className="p2-detail-chips">
                      {profile.equipment.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          </ProfessionalDetails>
          {!preview && <ShareProfile slug={profile.slug} />}
        </aside>
        <div className="p2-main">
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
                  id="reel"
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
                    <div className="p2-secondary" id="videos">
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
                <section className="p2-gallery-section" id="book">
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
          {sectionControls.credits}
          {p.credits.length > 0 && (
            <section className="p2-credits" id="credits">
              <h2>Trayectoria</h2>
              <ul>
                {sortedCredits(p.credits).map((credit, i) => (
                  <li key={i}>
                    <p className="p2-credit-period">{creditPeriod(credit)}</p>
                    <h3>{credit.title}</h3>
                    <p>
                      {[credit.role, credit.company, credit.production_type]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {credit.description && <p>{credit.description}</p>}
                    {credit.url && (
                      <a
                        href={credit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver proyecto ↗
                      </a>
                    )}
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
          <ProfileProjectPreferences value={preferences} />
          <ProfileContactSection
            slug={profile.slug}
            name={name}
            closed={profile.contact_policy === "closed"}
            owner={owner}
            preview={preview}
            signedIn={signedIn}
            access={contactAccess}
          />
          {socialProof}
        </div>
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
