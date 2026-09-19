"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminRouteRevalidator() {
  const router = useRouter();

  useEffect(() => {
    // A previously authorized Admin payload can remain in the browser Router
    // Cache after the session changes. Revalidate it against the server guard.
    router.refresh();

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  return null;
}
