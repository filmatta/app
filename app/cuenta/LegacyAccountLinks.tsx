"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Fragments are not sent to the server. Preserve existing account bookmarks.
const sections = new Set(["mis-cursos", "actividad", "perfil", "avatar", "pagos", "metodos-pago", "facturacion", "configuracion", "seguridad", "datos-contacto", "cerrar-sesion"]);
export default function LegacyAccountLinks() {
  const router = useRouter();
  useEffect(() => {
    const forward = () => {
      if (sections.has(window.location.hash.slice(1))) router.replace("/cuenta/configuracion" + window.location.search + window.location.hash);
    };
    forward();
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, [router]);
  return null;
}
