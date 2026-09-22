"use client";
import { useEffect, useState } from "react";
import { EditorDialog } from "./PortfolioDialogs";
import PrivateContactForm from "@/app/cuenta/PrivateContactForm";
import { loadPrivateContact } from "@/app/cuenta/private-profile-actions";
import type { PrivateContact } from "@/lib/profiles/private-contact";
export default function PrivateContactDialog({ close }: { close: () => void }) {
  const [value,setValue] = useState<PrivateContact | null>(null), [error,setError] = useState("");
  useEffect(() => { let live=true; void loadPrivateContact().then(r => { if (!live) return; if ("data" in r) setValue(r.data); else setError(r.error); }).catch(() => { if(live) setError("No pudimos cargar tus datos."); }); return () => {live=false;}; },[]);
  return <EditorDialog title="Datos de contacto" close={close} busy={false}>{value ? <PrivateContactForm initial={value} profileEditor /> : error ? <p role="alert">{error}</p> : <p role="status">Cargando datos de contacto…</p>}</EditorDialog>;
}
