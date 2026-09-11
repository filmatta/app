import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";

export const metadata = {
  title: "Perfiles profesionales",
  description:
    "Crea una página profesional para compartir tu trabajo audiovisual.",
};

export default async function ProfilesPage() {
  const viewer = await getViewer();
  const profile = viewer
    ? await getOwnedProfessionalProfile(viewer.id)
    : null;
  const editorHref = viewer
    ? "/mi-perfil"
    : "/registro?next=%2Fmi-perfil";

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader showPrimaryNavigation />

      <section className="mx-auto grid min-h-[72vh] max-w-7xl items-center gap-16 px-6 py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:px-8 lg:py-28">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
            FILMATTA Profiles · Beta
          </p>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.045em] sm:text-7xl">
            Tu trabajo.
            <br />
            <span className="text-white/35">En un solo enlace.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-white/50">
            Presenta tus disciplinas, reel, proyectos, habilidades y
            disponibilidad en una página profesional hecha para la industria
            audiovisual.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href={editorHref}
              className="rounded-full bg-white px-7 py-4 font-semibold text-black transition hover:bg-white/85"
            >
              {profile ? "Editar mi perfil" : "Crear mi perfil"}
            </Link>
            {profile?.is_public && (
              <Link
                href={`/perfiles/${profile.slug}`}
                className="rounded-full border border-white/15 px-7 py-4 font-semibold transition hover:bg-white/[0.06]"
              >
                Ver página pública
              </Link>
            )}
          </div>
        </div>

        <div className="relative border-l border-white/10 pl-7 sm:pl-10">
          <span className="absolute -left-1 top-0 size-2 rounded-full bg-[#a9163f]" />
          <p className="text-xs uppercase tracking-[0.25em] text-white/30">
            Perfil profesional
          </p>
          <p className="mt-8 text-4xl font-semibold tracking-tight">Alain T.</p>
          <p className="mt-3 text-sm text-white/45">
            Dirección de fotografía · Cámara
          </p>
          <p className="mt-8 max-w-sm leading-7 text-white/45">
            Un nombre público abreviado, experiencia relevante y límites de
            privacidad claros. Sin exponer datos personales.
          </p>
          <div className="mt-10 flex flex-wrap gap-2">
            {[
              "Reel",
              "Portafolio",
              "Disponibilidad",
              "Skills",
              "Equipo",
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/45"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl gap-px bg-white/10 px-6 py-px lg:grid-cols-3 lg:px-8">
          <Feature
            number="01"
            title="Una sola identidad"
            description="Tu cuenta crece contigo. Añade varias disciplinas sin crear perfiles separados."
          />
          <Feature
            number="02"
            title="Hecho para compartir"
            description="Una página limpia para enviar por mensaje, redes o correo cuando alguien pide ver tu trabajo."
          />
          <Feature
            number="03"
            title="Privacidad primero"
            description="Tu nombre completo y datos de contacto se mantienen privados. Tú decides si aceptar solicitudes."
          />
        </div>
      </section>

      <section className="border-t border-white/10 px-6 py-20 text-center lg:px-8">
        <p className="mx-auto max-w-xl leading-7 text-white/40">
          La beta comienza con perfiles compartibles. El catálogo y la búsqueda
          avanzada llegarán cuando exista suficiente comunidad.
        </p>
      </section>
    </main>
  );
}

function Feature({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <article className="bg-[#080808] px-6 py-12 lg:px-8">
      <p className="text-xs tracking-[0.25em] text-white/25">{number}</p>
      <h2 className="mt-8 text-xl font-semibold">{title}</h2>
      <p className="mt-3 max-w-sm leading-7 text-white/40">{description}</p>
    </article>
  );
}
