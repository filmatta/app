import ProfileCatalog from "@/components/catalogs/ProfileCatalog";
import type { SearchParams } from "@/lib/catalogs/filters";
export const metadata = { title: "Talento", description: "Perfiles públicos de actuación y modelaje en FILMATTA." };
export default function TalentPage({searchParams}: {searchParams: Promise<SearchParams>}) {
  return <ProfileCatalog searchParams={searchParams} talent />;
}
