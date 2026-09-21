"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setProfileFollow } from "@/app/perfiles/social-actions";
export default function ProfileFollow({ slug, signedIn, initial }: { slug: string; signedIn: boolean; initial: boolean }) {
  const [following, setFollowing] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  if (!signedIn) return <Link className="p2-follow" href={`/login?next=${encodeURIComponent(`/perfiles/${slug}`)}`}>Seguir</Link>;
  return <span className="p2-follow-control"><button className="p2-follow" type="button" disabled={busy} aria-pressed={following} aria-label={following ? "Dejar de seguir" : "Seguir"} onClick={async () => {
    if (busy) return;
    const previous = following;
    setFollowing(!previous); setBusy(true); setError("");
    try {
      const result = await setProfileFollow(slug, !previous);
      if (result.error) { setFollowing(previous); setError(result.error); }
      else { setFollowing(Boolean(result.following)); router.refresh(); }
    } catch { setFollowing(previous); setError("No pudimos guardar el cambio."); }
    finally { setBusy(false); }
  }}>{following ? "Siguiendo" : "Seguir"}</button>{error && <small role="alert">{error}</small>}</span>;
}
