export default function ProfileCatalogLoading() {
  return (
    <main className="editorial-page profiles-page" aria-busy="true">
      <div className="editorial-container py-20">
        <p role="status" className="eyebrow">
          Cargando perfiles…
        </p>
        <div aria-hidden="true" className="profile-skeleton-title" />
        <div className="profile-grid" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="profile-skeleton-image" />
              <div className="profile-skeleton-line" />
              <div className="profile-skeleton-line w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
