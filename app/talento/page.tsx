import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getOwnedProfessionalProfile } from "@/lib/profiles/data";
import { homeProfileAction } from "@/lib/profiles/activation";
import { activationCompletion } from "@/lib/profiles/activation-completion";
import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/profiles/media";
import "./teaser.css";
export const metadata = {
  title: "Talento · Próximamente",
  description:
    "Crea tu perfil profesional y forma parte de la primera ola de FILMATTA.",
};
export default async function TalentPage() {
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
  const action = homeProfileAction(
    Boolean(viewer),
    profile,
    completion.percent,
  );
  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <main className="editorial-container talent-teaser">
        <div className="talent-teaser-copy">
          <p className="eyebrow">FILMATTA / TALENTO Y PROFESIONALES</p>
          <h1>Próximamente en tu ciudad</h1>
          <p className="talent-teaser-lead">
            Estamos reuniendo talento, crew y profesionales audiovisuales para
            que puedas encontrarlos y conectar desde FILMATTA.
          </p>
          <p className="talent-teaser-note">
            Mientras abrimos el catálogo público, ya puedes crear tu perfil y
            formar parte de la primera ola.
          </p>
          <div className="talent-teaser-actions">
            <Link className="talent-teaser-primary" href={action.href}>
              {!profile ? "Crear perfil" : action.label}
            </Link>
            <Link className="talent-teaser-secondary" href="/">
              Conocer FILMATTA ↗
            </Link>
          </div>
        </div>
        <figure className="talent-teaser-preview">
          <Image
            src="/images/talento-catalog-teaser.webp"
            width={1672}
            height={941}
            sizes="(max-width: 768px) 100vw, 1280px"
            priority
            alt="Vista conceptual del futuro catálogo audiovisual de FILMATTA"
          />
          <figcaption>
            Vista conceptual · El catálogo público aún no está disponible.
          </figcaption>
        </figure>
      </main>
    </div>
  );
}
