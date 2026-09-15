"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const DOLLY_IN_SCALE = 1.1;
const DOLLY_IN_DURATION = "5s";
const DOLLY_IN_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function FilmSetStrip() {
  const stripRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    const image = imageRef.current;

    if (!strip || !image) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let hasAnimated = false;
    let observer: IntersectionObserver | null = null;

    const observeStrip = () => {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting || hasAnimated) {
            return;
          }

          hasAnimated = true;
          observer?.disconnect();
          image.style.transition = `transform ${DOLLY_IN_DURATION} ${DOLLY_IN_EASING}`;
          image.style.transform = `scale(${DOLLY_IN_SCALE})`;
        },
        { threshold: 0.3 }
      );

      observer.observe(strip);
    };

    const handleMotionPreference = () => {
      if (reducedMotion.matches) {
        observer?.disconnect();
        image.style.transition = "none";
        image.style.transform = "scale(1)";
        return;
      }

      if (!hasAnimated) {
        observeStrip();
      }
    };

    handleMotionPreference();
    reducedMotion.addEventListener("change", handleMotionPreference);

    return () => {
      observer?.disconnect();
      reducedMotion.removeEventListener("change", handleMotionPreference);
    };
  }, []);

  return (
    <section
      ref={stripRef}
      aria-label="Equipo audiovisual trabajando en una producción"
      className="relative w-screen overflow-hidden bg-black"
    >
      <div className="relative h-[280px] w-full overflow-hidden sm:h-[360px] lg:h-[clamp(440px,32vw,520px)]">
        <Image
          ref={imageRef}
          src="/images/pexels-alejandro-maroto-245702196-13524267.jpg"
          alt="Crew audiovisual en silueta junto a una cámara y un micrófono boom"
          fill
          sizes="100vw"
          className="scale-100 object-cover object-[center_35%] grayscale contrast-[1.1] will-change-transform motion-reduce:transform-none"
        />
      </div>
    </section>
  );
}
