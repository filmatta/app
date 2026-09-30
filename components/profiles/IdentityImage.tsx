"use client";
import ProfileImage from "./ProfileImage";
import { useProfileMediaResource } from "./ProfileMediaResource";
export default function IdentityImage({ id, fallbackUrl, alt, eager = false, interactive = true }: { id?: string | null; fallbackUrl?: string | null; alt: string; eager?: boolean; interactive?: boolean }) {
  const { ref, resource, error, retry } = useProfileMediaResource(id ?? null);
  return <div className="p2-identity-image" ref={ref}>
    <ProfileImage src={id ? resource?.image : fallbackUrl} alt={alt} eager={eager} pending={Boolean(id && !resource && !error)} error={error} fallback="Sin foto de perfil" />
    {error && interactive && <button type="button" onClick={retry}>Reintentar imagen</button>}
  </div>;
}
