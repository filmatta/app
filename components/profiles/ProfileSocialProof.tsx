import Link from "next/link";
import type { ProfileFollower } from "@/lib/profiles/social";
import IdentityImage from "./IdentityImage";
export default function ProfileSocialProof({ followers }: { followers: ProfileFollower[] }) {
  if (!followers.length) return null;
  const total = Number(followers[0].total_count ?? followers.length);
  return <section className="p2-social-proof" aria-label="Seguido por"><span>Seguido por</span><div>{followers.slice(0,7).map((f,i) => <Link className={i >= 5 ? "p2-proof-desktop" : undefined} href={`/perfiles/${f.slug}`} key={f.slug} aria-label={`Ver perfil de ${f.display_name}`} title={f.display_name}>
    {f.portrait_media_id || f.portrait_url ? <IdentityImage id={f.portrait_media_id} fallbackUrl={f.portrait_url} alt="" interactive={false} /> : <span className="p2-follower-initial" aria-hidden="true">{f.display_name.slice(0,1)}</span>}
  </Link>)}{total > 7 && <span className="p2-proof-desktop p2-proof-count">+{total-7}</span>}{total > 5 && <span className="p2-proof-mobile p2-proof-count">+{total-5}</span>}</div></section>;
}
