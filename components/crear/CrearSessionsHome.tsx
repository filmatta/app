"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CrearApiError,
  crearJson,
  formatCrearDate,
  sessionFromPayload,
  sessionsFromPayload,
  shortText,
  type CrearSession,
} from "./model";

export default function CrearSessionsHome() {
  const router = useRouter();
  const [sessions, setSessions] = useState<CrearSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<"blank" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void crearJson<{ sessions?: CrearSession[] } | CrearSession[]>("/api/crear/sessions")
      .then((payload) => { if (active) setSessions(sessionsFromPayload(payload)); })
      .catch((cause: unknown) => { if (active) setError(apiMessage(cause, "No pudimos cargar tus ideas.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function createSession(demo: boolean) {
    if (creating) return;
    setCreating(demo ? "demo" : "blank");
    setError(null);
    try {
      const payload = await crearJson<{ session?: CrearSession } | CrearSession>("/api/crear/sessions", {
        method: "POST",
        body: JSON.stringify(demo ? { title: "ARCA", demo: true } : {}),
      });
      const session = sessionFromPayload(payload);
      if (!session?.id) throw new CrearApiError("La sesión se creó sin un identificador válido.");
      router.push(`/crear/${session.id}`);
    } catch (cause) {
      setError(apiMessage(cause, "No pudimos iniciar la idea."));
      setCreating(null);
    }
  }

  return (
    <main className="crear-index-main">
      <section className="crear-index-intro" aria-labelledby="crear-heading">
        <div>
          <p className="crear-kicker">FILMATTA · CREAR</p>
          <h1 id="crear-heading">Tienes una idea.<br />Empieza aquí.</h1>
        </div>
        <div className="crear-index-copy">
          <p>Cuéntanos tu idea. FILMATTA te ayuda a desarrollarla, organizarla y llevarla paso a paso hasta producción.</p>
          <div className="crear-index-actions">
            <button className="crear-primary" type="button" disabled={Boolean(creating)} onClick={() => void createSession(false)}>
              {creating === "blank" ? "Preparando…" : "Empezar una idea"}<span aria-hidden="true">↗</span>
            </button>
            <button className="crear-text-button" type="button" disabled={Boolean(creating)} onClick={() => void createSession(true)}>
              {creating === "demo" ? "Preparando ARCA…" : "Explorar demo ARCA"}
            </button>
          </div>
          <p className="crear-index-hint">Puedes empezar con una escena, una premisa, un personaje o simplemente una idea suelta.</p>
        </div>
      </section>

      <section className="crear-session-library" aria-labelledby="crear-sessions-heading" aria-busy={loading}>
        <header>
          <div><p className="crear-kicker">TU ESPACIO</p><h2 id="crear-sessions-heading">Ideas recientes</h2></div>
          {!loading && sessions.length > 0 && <span>{sessions.length} {sessions.length === 1 ? "idea" : "ideas"}</span>}
        </header>
        {loading ? <div className="crear-session-loading" role="status"><i aria-hidden="true" /><span>Cargando tus ideas…</span></div>
          : sessions.length > 0 ? <div className="crear-session-grid">{sessions.map((session) => (
            <Link key={session.id} href={`/crear/${session.id}`} className="crear-session-card">
              <span className="crear-session-card-mark" aria-hidden="true">✦</span>
              <div><strong>{session.title || "Idea sin título"}</strong><p>{shortText(session.premise || "Continúa la conversación y organiza lo que ya descubriste.")}</p></div>
              <footer><time dateTime={session.updatedAt}>{formatCrearDate(session.updatedAt)}</time><span>Continuar →</span></footer>
            </Link>
          ))}</div>
          : <div className="crear-index-empty"><span aria-hidden="true">✦</span><h3>Tu primera idea empieza con una frase.</h3><p>Abre una conversación. La estructura aparecerá mientras avanzas.</p></div>}
        {error && <div className="crear-inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Reintentar</button></div>}
      </section>

      <footer className="crear-ownership-note">Tus ideas son tuyas. FILMATTA no reclama propiedad sobre tu proyecto.</footer>
    </main>
  );
}

function apiMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
