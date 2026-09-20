"use client";
import { useId, useState } from "react";
export default function ProfileFilters({
  active,
  children,
}: {
  active: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(active > 0);
  const id = useId();
  return (
    <div className="profile-filter-disclosure" data-expanded={expanded}>
      <button
        type="button"
        className="profile-filter-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((v) => !v)}
      >
        Filtros {active > 0 ? `· ${active} activos` : ""}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      <div id={id} className="profile-filter-content">
        {children}
      </div>
    </div>
  );
}
