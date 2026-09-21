"use client";
import { useCallback, useState } from "react";
import { useResource } from "./PortfolioMedia";
import ProfileImage from "./ProfileImage";
type Props = { id?: string | null; fallbackUrl?: string | null; name: string };
function Avatar({ id, fallbackUrl, name }: Props) {
  const { ref, resource, error } = useResource(id ?? null);
  const [failed,setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const src = id ? resource?.image : fallbackUrl;
  return <div ref={ref} className="p2-follower-avatar">
    {error || failed || (!id && !fallbackUrl) ? <span className="p2-follower-initial" aria-hidden="true">{name.slice(0,1)}</span> : <ProfileImage src={src} pending={Boolean(id && !resource)} alt="" onError={fail} />}
  </div>;
}
export default function ProfileAvatar(props: Props) { return <Avatar key={`${props.id ?? ""}:${props.fallbackUrl ?? ""}`} {...props} />; }
