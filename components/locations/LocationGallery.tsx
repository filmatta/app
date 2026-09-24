"use client";

import { useEffect, useState } from "react";
import type { PublicLocationPhoto } from "@/lib/locations/public";
import styles from "./locations.module.css";

export default function LocationGallery({ photos, title }: { photos: PublicLocationPhoto[]; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (active === null) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setActive(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [active]);

  if (photos.length === 0) return null;
  return (
    <>
      <div className={styles.galleryGrid}>
        {photos.map((photo, index) => (
          <button key={photo.id} type="button" className={styles.galleryItem} onClick={() => setActive(index)} aria-label={`Abrir imagen ${index + 1} de ${title}`}>
            <img src={photo.imageUrl} alt={photo.altText || `Vista de ${title}`} loading="lazy" />
          </button>
        ))}
      </div>
      {active !== null && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={`Galería de ${title}`} onClick={() => setActive(null)}>
          <button type="button" className={styles.lightboxClose} onClick={() => setActive(null)} aria-label="Cerrar imagen">×</button>
          <img src={photos[active].imageUrl} alt={photos[active].altText || `Vista de ${title}`} onClick={(event) => event.stopPropagation()} />
          {photos.length > 1 && <div className={styles.lightboxNav} onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setActive((active - 1 + photos.length) % photos.length)} aria-label="Imagen anterior">←</button>
            <span>{active + 1} / {photos.length}</span>
            <button type="button" onClick={() => setActive((active + 1) % photos.length)} aria-label="Imagen siguiente">→</button>
          </div>}
        </div>
      )}
    </>
  );
}
