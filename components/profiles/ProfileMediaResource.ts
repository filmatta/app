"use client";

import { useEffect, useRef, useState } from "react";

export type ProfileMediaResource = {
  resourceId?: string;
  image?: string;
  expiresAt?: number;
  playbackId?: string;
  tokens?: { playback: string; thumbnail: string };
};

export function useProfileMediaResource(id: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [resource, setResource] = useState<ProfileMediaResource | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id || !ref.current) return;
    let live = true;
    const controller = new AbortController();
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let expiresAt = 0;
    const resume = () => {
      if (
        document.visibilityState === "visible" &&
        expiresAt &&
        Date.now() > expiresAt - 15_000
      )
        setAttempt((value) => value + 1);
    };
    document.addEventListener("visibilitychange", resume);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        fetch(`/api/portfolio/media/${id}/resource`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15_000),
          ]),
        })
          .then(async (response) => {
            if (!response.ok) throw new Error();
            const result = await response.json();
            if (!live) return;
            setResource({ ...result, resourceId: id });
            setErrorId(null);
            expiresAt = result.expiresAt ?? 0;
            if (result.expiresAt)
              refresh = setTimeout(
                () => {
                  if (document.visibilityState === "visible")
                    setAttempt((value) => value + 1);
                },
                Math.max(1_000, result.expiresAt - Date.now() - 15_000),
              );
          })
          .catch(() => {
            if (live) setErrorId(id);
          });
      },
      { rootMargin: "250px" },
    );
    observer.observe(ref.current);
    return () => {
      live = false;
      controller.abort();
      clearTimeout(refresh);
      document.removeEventListener("visibilitychange", resume);
      observer.disconnect();
    };
  }, [id, attempt]);

  return {
    ref,
    resource: resource?.resourceId === id ? resource : null,
    error: Boolean(id && errorId === id),
    retry: () => {
      setErrorId(null);
      setAttempt((value) => value + 1);
    },
  };
}
