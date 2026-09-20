"use client";
export default function ProfileEditorError({ retry }: { retry: () => void }) {
  return (
    <main className="editorial-page profiles-page">
      <section className="editorial-container py-20">
        <p className="eyebrow">Mi perfil</p>
        <h1 className="mt-4 text-4xl tracking-tight">
          No pudimos cargar tu perfil.
        </h1>
        <p className="mt-5 max-w-lg leading-7 text-white/70">
          Tu información guardada se conserva. Intenta cargarla de nuevo para
          continuar editando.
        </p>
        <button
          type="button"
          onClick={retry}
          className="editorial-primary mt-8"
        >
          Reintentar
        </button>
      </section>
    </main>
  );
}
