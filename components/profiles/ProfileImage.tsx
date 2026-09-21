"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
// User-supplied HTTPS images stay in the browser, never in a server image proxy.
function ImageLoad({
  src,
  alt,
  className = "",
  eager = false,
  fallback = "Imagen no disponible",
  pending = false,
  error = false,
  onError,
  imageStyle,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
  fallback?: string;
  pending?: boolean;
  error?: boolean;
  onError?: () => void;
  imageStyle?: CSSProperties;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if ((!src && !pending) || error || loaded || !root.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      if (image.current?.complete && image.current.naturalWidth > 0) { setLoaded(true); return; }
      timer = setTimeout(() => {
        if (image.current?.complete && image.current.naturalWidth > 0) setLoaded(true);
        else setTimedOut(true);
      }, 20000);
    }, { rootMargin: "250px" });
    observer.observe(root.current);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [src, pending, error, loaded]);
  const failed = error || timedOut || Boolean(src && src === failedSource);
  const loading = !failed && !loaded && Boolean(src || pending);
  return (
    <div ref={root} className={`profile-image ${className}`} data-state={failed ? "error" : loading ? "loading" : loaded ? "ready" : "empty"}>
      {loading && <span className="profile-image-loader" role="status" aria-label="Cargando imagen"><span /></span>}
      {(failed || (!src && !pending)) && <span className="profile-image-fallback" role="img" aria-label={failed ? "Imagen no disponible" : fallback}>{failed ? "Imagen no disponible" : fallback}</span>}
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={element => {
            image.current = element;
            if (!loaded && element?.complete && element.naturalWidth > 0) setLoaded(true);
          }}
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          style={{ ...imageStyle, opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          referrerPolicy="no-referrer"
          onError={() => { setFailedSource(src); onError?.(); }}
        />
      )}
    </div>
  );
}

export default function ProfileImage(props: Parameters<typeof ImageLoad>[0]) {
  return <ImageLoad key={props.src || "empty"} {...props} />;
}
