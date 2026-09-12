"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function HashScrollSync() {
  const pathname = usePathname();

  useEffect(() => {
    const scrollToCurrentHash = () => {
      const rawHash = window.location.hash.slice(1);
      if (!rawHash) return;

      const target = document.getElementById(rawHash);
      if (!target) return;

      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    };

    const frame = window.requestAnimationFrame(scrollToCurrentHash);
    window.addEventListener("hashchange", scrollToCurrentHash);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", scrollToCurrentHash);
    };
  }, [pathname]);

  return null;
}
