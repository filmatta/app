import { existsSync } from "node:fs";
import { join } from "node:path";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";
import { parseBillingReturnSource } from "@/lib/billing/return-presentation";
import { getProToPlusDowngradeState } from "@/lib/billing/subscription-schedule";
import { getMyScheduledCancellation } from "@/lib/billing/cancellation";
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
  let cancellationEffectiveAt: string | null = null;
  if (parsedSource === "downgrade" && access.plan === "pro") {
    try {
      const downgrade = await getProToPlusDowngradeState(viewer.id);
      downgradeEffectiveAt = downgrade.scheduled ? downgrade.effectiveAt : null;
    } catch {
      console.error("Unable to verify the Pro to Plus schedule");
    }
  }
  if (parsedSource === "cancel" && (access.plan === "plus" || access.plan === "pro")) {
    try {
      const cancellation = await getMyScheduledCancellation(viewer.id);
      if (cancellation.plan === access.plan && cancellation.isCancellationScheduled) {
        cancellationEffectiveAt = cancellation.cancellationEffectiveAt;
      }
    } catch (error) {
      console.error("Unable to verify the scheduled cancellation", error);
    }
  }

  const cancellationMatti = "/brand/matti/matti-plan-cancel.png";
  const mattiSrc =
    parsedSource === "cancel" &&
    existsSync(join(process.cwd(), "public", cancellationMatti))
      ? cancellationMatti
      : "/brand/matti/matti-plan-success.png";

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/planes", label: "← Planes" }} />
      <BillingReturnClient
        initialPlan={access.plan}
        source={parsedSource}
        downgradeEffectiveAt={downgradeEffectiveAt}
        cancellationEffectiveAt={cancellationEffectiveAt}
        mattiSrc={mattiSrc}
      />
    </main>
  );
}
