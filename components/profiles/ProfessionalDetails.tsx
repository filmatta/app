"use client";
import { useEffect, useState, type ReactNode } from "react";
export default function ProfessionalDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = matchMedia("(min-width: 1024px)");
    const update = () => setOpen(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return <details className="p2-professional-details" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary aria-expanded={open}>{open ? "Ocultar información profesional ↑" : "Ver información profesional ↓"}</summary>{children}
  </details>;
}
