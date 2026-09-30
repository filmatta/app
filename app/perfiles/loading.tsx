import SiteHeader from "@/components/SiteHeader";
import ProfileCatalogLoading from "@/components/profiles/ProfileCatalogLoading";

export default function Loading() {
  return (
    <div className="editorial-page profiles-page">
      <SiteHeader />
      <ProfileCatalogLoading />
    </div>
  );
}
