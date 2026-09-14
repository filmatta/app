import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { getMyScheduledCancellation } from "@/lib/billing/cancellation";

export const dynamic = "force-dynamic";

export default async function BillingPortalReturnPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/acceso?next=%2Fcuenta%2Fsuscripcion");

  let cancellationScheduled = false;
  try {
    const cancellation = await getMyScheduledCancellation(viewer.id);
    cancellationScheduled = cancellation.isCancellationScheduled;
  } catch (error) {
    console.error("Unable to verify a scheduled cancellation after Portal", error);
  }

  if (cancellationScheduled) redirect("/billing/return?source=cancel");
  redirect("/cuenta/suscripcion");
}
