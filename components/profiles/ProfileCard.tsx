import StatusBadge from "@/components/ui/StatusBadge";
import { MetaChips } from "@/components/ui/MetaChip";
import Link from "next/link";
import type { ProfileSummary } from "@/lib/profiles/catalog";
import { AVAILABILITY_LABELS } from "@/lib/profiles/constants";
import ProfileAvatar from "./ProfileAvatar";
import "./profile-card.css";
export default function ProfileCard({
  profile,
}: {
  profile: ProfileSummary;
  talent?: boolean;
}) {
  const p = profile.presentation,
    name = p.stage_name || profile.display_name;
  return (
    <Link href={`/perfiles/${profile.slug}`} className="profile-card">
      <div className="profile-card-identity">
        <div className="profile-card-avatar">
          <ProfileAvatar
            id={p.portrait_media_id}
            fallbackUrl={p.portrait_url}
            name={name}
          />
        </div>
        <div className="profile-card-name">
          <h2>{name}</h2>
          <p className="profile-card-disciplines">{profile.disciplines[0]}</p>
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
      </div>
      <p className="profile-card-city">
        {[profile.city, p.work_area].filter(Boolean).join(" · ") ||
          "Ciudad por confirmar"}
      </p>
      <div className="profile-card-details">
        <MetaChips labels={profile.disciplines} limit={3} />
      </div>
      <span className="profile-card-cta">
        Ver perfil <span aria-hidden="true">↗</span>
      </span>
    </Link>
  );
}
