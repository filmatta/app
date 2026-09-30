export default function ProfileCatalogLoading() {
  return (
    <main className="editorial-container profile-catalog" aria-busy="true">
      <p role="status" className="eyebrow">Cargando perfiles…</p>
      <div className="profile-skeleton-title" aria-hidden="true" />
      <div className="profile-search-layout" aria-hidden="true">
        <div className="profile-filter-skeleton" />
        <div className="profile-grid">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div className="profile-card-skeleton" key={item}>
              <div className="profile-skeleton-image" />
              <div className="profile-skeleton-line" />
              <div className="profile-skeleton-line profile-skeleton-line--short" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
