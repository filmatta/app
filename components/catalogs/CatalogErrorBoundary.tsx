"use client";
import Link from "next/link";
export default function CatalogErrorBoundary({ retry }: { retry: () => void }) {
  return (
    <main className="editorial-page min-h-screen px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold">
          No pudimos abrir esta página.
        </h1>
        <p className="mt-5 leading-7 text-white/65">
          Inténtalo de nuevo. Si el problema continúa, vuelve al inicio para
          explorar otra sección.
        </p>
        <div className="editorial-actions">
          <button type="button" className="editorial-primary" onClick={retry}>
            Reintentar
          </button>
          <Link className="editorial-secondary" href="/">
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
