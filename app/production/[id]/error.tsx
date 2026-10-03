"use client";

export default function ProductionErrorPage({ reset }: { reset: () => void }) {
  return <main className="production-route-state"><p>PRODUCTION ASSISTANT</p><h1>No pudimos abrir la producción</h1><span>El plan no se modificó. Puedes intentar cargarlo de nuevo.</span><button type="button" onClick={reset}>Reintentar</button></main>;
}
