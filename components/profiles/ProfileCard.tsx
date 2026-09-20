import Link from "next/link";
import type { ProfileSummary } from "@/lib/profiles/catalog";
import { AVAILABILITY_LABELS } from "@/lib/profiles/constants";
import { leadReel, reelSource } from "@/lib/profiles/presentation";
import ProfileImage from "./ProfileImage";
export default function ProfileCard({
  profile,
  talent = false,
}: {
  profile: ProfileSummary;
  talent?: boolean;
}) {
  const reel = leadReel(profile.portfolio_items),
    p = profile.presentation;
  const image = talent
    ? p.portrait_url || p.book[0]?.url
    : p.book[0]?.url ||
      (reel ? reelSource(reel.url)?.thumbnail : null) ||
      p.portrait_url;
  return (
    <Link
      href={`/perfiles/${profile.slug}`}
      className={`profile-card ${talent ? "profile-card--talent" : ""}`}
    >
      <div className="profile-card-frame">
        <ProfileImage
          src={image}
          alt=""
          fallback={(p.stage_name || profile.display_name).slice(0, 1)}
        />
        {(reel || p.book.length > 0) && (
          <span className="profile-card-material">
            {reel ? "▷ Reel" : "Book"}
            {reel && p.book.length > 0 ? " / Book" : ""}
          </span>
        )}
        <span className="profile-card-open" aria-hidden="true">
          ↗
        </span>
      </div>
      <div className="profile-card-name">
        <h2>{p.stage_name || profile.display_name}</h2>
        <span aria-hidden="true">↗</span>
      </div>

      <p className="profile-card-disciplines">
        {profile.disciplines.join(" · ")}
      </p>
      <p className="profile-card-city">
        {[profile.city, p.work_area].filter(Boolean).join(" · ") ||
          "Ciudad por confirmar"}
      </p>
      <p
        className="profile-availability"
        data-available={profile.availability === "available"}
      >
        {AVAILABILITY_LABELS[profile.availability]}
      </p>
    </Link>
  );
}
