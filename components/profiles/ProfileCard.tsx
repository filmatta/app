import Link from "next/link";
import type { ProfileSummary } from "@/lib/profiles/catalog";
import { AVAILABILITY_LABELS } from "@/lib/profiles/constants";
import ProfileCardVisual from "./ProfileCardVisual";
import "./profile-card.css";

export default function ProfileCard({
  profile,
  returnTo,
}: {
  profile: ProfileSummary;
  returnTo: string;
}) {
  const presentation = profile.presentation;
  const name = presentation.stage_name || profile.display_name;
  const [primaryDiscipline, ...secondaryDisciplines] = profile.disciplines;
  const href = `/perfiles/${profile.slug}?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <Link href={href} className="profile-card" aria-label={`Ver perfil de ${name}`}>
      <ProfileCardVisual
        mediaId={profile.visual_media_id}
        fallbackUrl={profile.visual_url || presentation.portrait_url}
        name={name}
      />
      <div className="profile-card-body">
        <div className="profile-card-name">
          <div>
            <h2>{name}</h2>
            <p className="profile-card-disciplines">
              {primaryDiscipline || "Profesional audiovisual"}
              {secondaryDisciplines.length > 0 && (
                <span> +{secondaryDisciplines.length}</span>
              )}
            </p>
          </div>
          <span className="profile-card-open" aria-hidden="true">↗</span>
        </div>
        <div className="profile-card-meta">
          <p>{profile.city || "Ciudad por confirmar"}</p>
          <p
            className="profile-availability"
            data-available={profile.availability === "available"}
          >
            {AVAILABILITY_LABELS[profile.availability]}
          </p>
        </div>
        {profile.skills.length > 0 && (
          <ul className="profile-card-skills" aria-label="Especialidades">
            {profile.skills.slice(0, 3).map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}
