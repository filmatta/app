import Link from "next/link";

export default function ProductionNotFound() {
  return <main className="production-route-state"><p>PRODUCTION ASSISTANT</p><h1>Producción no disponible</h1><span>No existe o no tienes acceso a ella.</span><Link href="/production">Volver a Production</Link></main>;
}
