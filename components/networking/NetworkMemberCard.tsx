"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import IdentityImage from "@/components/profiles/IdentityImage";
import { unfollowNetwork } from "@/app/networking-actions";
import type { NetworkMember } from "@/lib/networking/types";
export default function NetworkMemberCard({ member: m, following }: { member: NetworkMember; following: boolean }) {
  const router = useRouter(), [busy,setBusy] = useState(false), [error,setError] = useState("");
  return <article className="network-card"><header><div className="network-avatar">{m.portrait_media_id || m.portrait_url ? <IdentityImage id={m.portrait_media_id} fallbackUrl={m.portrait_url} alt="" interactive={false} /> : <span>{m.display_name[0]}</span>}</div><div><h2>{m.slug ? <Link href={`/perfiles/${m.slug}`}>{m.display_name}</Link> : m.display_name}</h2><p className="network-muted">{m.slug ? [m.discipline,m.city].filter(Boolean).join(" · ") : "Sin perfil público"}</p></div></header>
    {following && <div className="network-actions"><button disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const r = await unfollowNetwork(m.profile_id); if (r.error) setError(r.error); else router.refresh(); } catch { setError("No pudimos actualizar tu red."); } finally { setBusy(false); } }}>Dejar de seguir</button></div>}{error && <p role="alert">{error}</p>}
  </article>;
}
