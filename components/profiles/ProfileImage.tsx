"use client";
import { useState } from "react";
// User-supplied HTTPS images stay in the browser, never in a server image proxy.
export default function ProfileImage({
  src,
  alt,
  className = "",
  eager = false,
  fallback = "F",
  onError,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
  fallback?: string;
  onError?: () => void;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div className={`profile-image ${className}`}>
      <span aria-hidden="true" className="profile-image-fallback">
        {fallback}
      </span>
      {src && src !== failedSource && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => { setFailedSource(src); onError?.(); }}
        />
      )}
    </div>
  );
}
