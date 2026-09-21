"use client";
import FilmattaAccordion from "@/components/ui/FilmattaAccordion";
import { useEffect, useState, type ReactNode } from "react";
export default function ProfessionalDetails({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = matchMedia("(min-width: 1024px)");
    const update = () => setOpen(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return <FilmattaAccordion title="Información profesional" className="p2-professional-details" open={open} onOpenChange={setOpen}>{children}</FilmattaAccordion>;
}
