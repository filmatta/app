"use client";

import { useState } from "react";
import { reelSource } from "@/lib/profiles/presentation";
import styles from "./locations.module.css";

export default function LocationTourVideo({ url, title }: { url: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const source = reelSource(url);
  if (!source) return null;
  if (!playing) return <button type="button" className={styles.videoPlaceholder} onClick={() => setPlaying(true)}><span>▶</span><strong>Reproducir recorrido</strong><small>YouTube o Vimeo · se carga sólo al pulsar</small></button>;
  return <div className={styles.videoFrame}><iframe src={source.embed} title={`Video recorrido de ${title}`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div>;
}
