import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import {
  AVAILABILITY_LABELS,
  PORTFOLIO_KIND_LABELS,
} from "@/lib/profiles/constants";
import { getPublicProfessionalProfile } from "@/lib/profiles/data";
import { getProfileInitial } from "@/lib/profiles/display-name";

type ProfilePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicProfessionalProfile(slug);

  if (!profile) {
    return { title: "Perfil no disponible" };
  }

  const disciplineSummary = profile.disciplines.slice(0, 2).join(" · ");

  return {
    title: profile.display_name,
    description:
      profile.bio?.slice(0, 155) ||
      `${profile.display_name} — ${disciplineSummary} en FILMATTA.`,
  };
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;
  const [profile, viewer] = await Promise.all([
    getPublicProfessionalProfile(slug),
    getViewer(),
  ]);

  if (!profile) {
    notFound();
  }

  const contactEnabled = profile.contact_policy === "members_only";
  const loginHref = `/login?next=${encodeURIComponent(`/perfiles/${slug}`)}`;

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/perfiles", label: "Profiles" }} />

      <article>
        <header className="border-b border-white/10">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[10rem_minmax(0,1fr)] lg:px-8 lg:py-24">
            <div
              aria-hidden="true"
              className="flex size-32 items-center justify-center rounded-full bg-[#8f1736] text-5xl font-semibold shadow-[0_0_70px_rgba(143,23,54,0.18)] md:size-40"
            >
              {getProfileInitial(profile.display_name)}
            </div>

            <div className="min-w-0">
              <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/30">
                    Perfil profesional
                  </p>
                  <h1 className="mt-4 text-5xl font-semibold tracking-[-0.045em] sm:text-7xl">
                    {profile.display_name}
                  </h1>
                </div>
                <AvailabilityBadge value={profile.availability} />
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 text-white/50">
                <span>{profile.disciplines.join(" · ")}</span>
                {profile.city && (
                  <>
                    <span aria-hidden="true" className="text-white/20">
                      /
                    </span>
                    <span>{profile.city}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-16 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-8 lg:py-20">
          <div className="space-y-20">
            {profile.bio && (
              <ProfileSection eyebrow="Sobre mí" title="Perfil">
                <p className="max-w-3xl whitespace-pre-line text-xl leading-9 text-white/65 sm:text-2xl sm:leading-10">
                  {profile.bio}
                </p>
              </ProfileSection>
            )}

            {profile.portfolio_items.length > 0 && (
              <ProfileSection eyebrow="Trabajo seleccionado" title="Reels y portafolio">
                <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
                  {profile.portfolio_items.map((item, index) => (
                    <a
                      key={`${item.url}-${index}`}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex min-h-52 flex-col bg-[#0b0b0b] p-6 transition hover:bg-[#111]"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-[#d75a7a]">
                        {PORTFOLIO_KIND_LABELS[item.kind]}
                      </p>
                      <h3 className="mt-5 text-2xl font-semibold tracking-tight">
                        {item.title}
                      </h3>
                      {item.summary && (
                        <p className="mt-3 leading-6 text-white/40">
                          {item.summary}
                        </p>
                      )}
                      <span className="mt-auto pt-8 text-sm font-medium text-white/55 transition group-hover:text-white">
                        Abrir enlace ↗
                      </span>
                    </a>
                  ))}
                </div>
              </ProfileSection>
            )}

            {profile.skills.length > 0 && (
              <ProfileSection eyebrow="Experiencia" title="Skills">
                <TagList items={profile.skills} />
              </ProfileSection>
            )}

            {profile.equipment.length > 0 && (
              <ProfileSection eyebrow="Herramientas" title="Equipo y sistemas">
                <TagList items={profile.equipment} />
              </ProfileSection>
            )}
          </div>

          <aside className="h-fit border-t border-white/10 pt-8 lg:sticky lg:top-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/30">
              Contacto
            </p>
            {contactEnabled ? (
              <>
                <p className="mt-4 text-sm leading-6 text-white/45">
                  Los datos personales no son públicos. Las solicitudes de
                  contacto se gestionarán dentro de FILMATTA.
                </p>
                {viewer ? (
                  <button
                    type="button"
                    disabled
                    className="mt-6 w-full cursor-not-allowed rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white/40"
                  >
                    Solicitudes próximamente
                  </button>
                ) : (
                  <Link
                    href={loginHref}
                    className="mt-6 block rounded-full bg-white px-5 py-3 text-center text-sm font-semibold text-black transition hover:bg-white/85"
                  >
                    Inicia sesión para contactar
                  </Link>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm leading-6 text-white/45">
                Esta persona no recibe solicitudes por ahora.
              </p>
            )}

            <div className="mt-8 border-t border-white/10 pt-6 text-xs leading-5 text-white/25">
              FILMATTA muestra una identidad abreviada y nunca publica correo o
              teléfono en el perfil.
            </div>
          </aside>
        </div>
      </article>
    </main>
  );
}

function AvailabilityBadge({
  value,
}: {
  value: keyof typeof AVAILABILITY_LABELS;
}) {
  const isAvailable = value === "available";

  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        isAvailable
          ? "border-green-400/20 text-green-200"
          : "border-white/10 text-white/45"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          isAvailable ? "bg-green-300" : "bg-white/30"
        }`}
      />
      {AVAILABILITY_LABELS[value]}
    </span>
  );
}

function ProfileSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/30">
        {eyebrow}
      </p>
      <h2 className="mt-2 mb-7 text-3xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-white/10 bg-white/[0.025] px-4 py-2 text-sm text-white/55"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
