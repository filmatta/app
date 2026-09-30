import "./opportunities.css";

export default function OpportunitiesLoading() {
  return (
    <main className="opportunity-page" aria-busy="true">
      <div className="opportunity-loading-shell">
        <p role="status" className="opportunity-eyebrow">
          Cargando oportunidades…
        </p>
        <div className="opportunity-skeleton-search" aria-hidden="true" />
        <div className="mt-8" aria-hidden="true">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="opportunity-skeleton-line" />
          ))}
        </div>
      </div>
    </main>
  );
}
