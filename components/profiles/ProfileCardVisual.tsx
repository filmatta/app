"use client";

import { useCallback, useState } from "react";
import { useProfileMediaResource } from "./ProfileMediaResource";
import ProfileImage from "./ProfileImage";

export default function ProfileCardVisual({
  mediaId,
  fallbackUrl,
  name,
}: {
  mediaId: string | null;
  fallbackUrl: string | null;
  name: string;
}) {
  const { ref, resource, error } = useProfileMediaResource(mediaId);
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const src = mediaId ? resource?.image : fallbackUrl;

  return (
    <div ref={ref} className="profile-card-visual">
      {error || failed ? (
        <span className="profile-card-fallback" aria-hidden="true">
          {name.slice(0, 1).toLocaleUpperCase("es")}
        </span>
      ) : (
        <ProfileImage
          src={src}
          pending={Boolean(mediaId && !resource)}
          fallback={name.slice(0, 1).toLocaleUpperCase("es")}
          alt={`Portada del perfil de ${name}`}
          onError={onError}
        />
      )}
    </div>
  );
}
