import ProfileCatalog from "@/components/catalogs/ProfileCatalog";
import type { SearchParams } from "@/lib/catalogs/filters";
export const metadata = { title: "Perfiles profesionales", description: "Explora el trabajo de profesionales del audiovisual en FILMATTA." };
export default function ProfilesPage({searchParams}: {searchParams: Promise<SearchParams>}) {
  return <ProfileCatalog searchParams={searchParams} />;
}
