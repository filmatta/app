import type { Metadata } from "next";
import ProfileCatalog from "@/components/catalogs/ProfileCatalog";
import type { SearchParams } from "@/lib/catalogs/filters";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const filtered = Object.values(params).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  );

  return {
    title: "Profesionales audiovisuales",
    description:
      "Encuentra talento y profesionales audiovisuales por disciplina, ciudad, disponibilidad y especialidad.",
    alternates: { canonical: "/perfiles" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default function ProfilesPage({ searchParams }: Props) {
  return <ProfileCatalog searchParams={searchParams} />;
}
