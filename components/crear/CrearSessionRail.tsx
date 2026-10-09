import Link from "next/link";
import { formatCrearDate, type CrearSession } from "./model";

export default function CrearSessionRail({
  sessions,
  activeSessionId,
  loading,
  creating,
  onCreate,
}: {
  sessions: CrearSession[];
  activeSessionId: string;
  loading: boolean;
  creating: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="crear-session-rail-content">
      <div className="crear-rail-brand"><span>F</span><div><strong>FILMATTA</strong><small>CREAR</small></div></div>
      <Link className="crear-rail-back" href="/crear">← Todas las ideas</Link>
      <nav className="crear-rail-product-nav" aria-label="Flujo FILMATTA">
        <Link href="/create">Proyectos</Link><Link href="/writer">Writer</Link><Link href="/shotlists">Shotlist</Link>
      </nav>
      <button className="crear-rail-new" type="button" disabled={creating} onClick={onCreate}>
        <span aria-hidden="true">＋</span>{creating ? "Creando…" : "Nueva idea"}
      </button>
      <nav className="crear-rail-sessions" aria-label="Sesiones de Crear">
        <p>CONVERSACIONES</p>
        {loading ? <span className="crear-rail-loading">Cargando…</span>
          : sessions.map((session) => (
            <Link key={session.id} href={`/crear/${session.id}`} aria-current={session.id === activeSessionId ? "page" : undefined}>
              <span>{session.title || "Idea sin título"}</span>
              <time dateTime={session.updatedAt}>{formatCrearDate(session.updatedAt)}</time>
            </Link>
          ))}
      </nav>
      <footer><span aria-hidden="true">●</span> Guardado en FILMATTA</footer>
    </div>
  );
}
