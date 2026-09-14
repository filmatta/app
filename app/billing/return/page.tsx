import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";
import { parseBillingReturnSource } from "@/lib/billing/return-presentation";
import { getProToPlusDowngradeState } from "@/lib/billing/subscription-schedule";
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
  const parsedSource = parseBillingReturnSource(source);
  let downgradeEffectiveAt: string | null = null;
  if (parsedSource === "downgrade" && access.plan === "pro") {
    try {
      const downgrade = await getProToPlusDowngradeState(viewer.id);
      downgradeEffectiveAt = downgrade.scheduled ? downgrade.effectiveAt : null;
    } catch {
      console.error("Unable to verify the Pro to Plus schedule");
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/planes", label: "← Planes" }} />
      <BillingReturnClient
        initialPlan={access.plan}
        source={parsedSource}
        downgradeEffectiveAt={downgradeEffectiveAt}
      />
    </main>
  );
}
