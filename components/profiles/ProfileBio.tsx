"use client";
import { useEffect, useId, useRef, useState } from "react";
export default function ProfileBio({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () =>
      setOverflow(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <section className="p2-bio" id="about">
      <h2>Sobre mí</h2>
      <div>
        <p id={id} ref={ref} data-expanded={expanded}>
          {text}
        </p>
        {(overflow || expanded) && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Ver menos" : "Ver más"}
          </button>
        )}
      </div>
    </section>
  );
}
