import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";
import { parseBillingReturnSource } from "@/lib/billing/return-presentation";
import BillingReturnClient from "./BillingReturnClient";

export const dynamic = "force-dynamic";

export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string | string[] }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fbilling%2Freturn");

  const [{ source }, access] = await Promise.all([
    searchParams,
    getBillingAccess(),
  ]);

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/planes", label: "← Planes" }} />
      <BillingReturnClient
        initialPlan={access.plan}
        source={parseBillingReturnSource(source)}
      />
    </main>
  );
}
