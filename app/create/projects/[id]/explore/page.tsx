import { redirect } from "next/navigation";

export default async function LegacyExplorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/create/projects/${encodeURIComponent(id)}/sandbox`);
}
