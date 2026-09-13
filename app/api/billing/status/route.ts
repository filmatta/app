import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return Response.json(
      { plan: null },
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const access = await getBillingAccess();
  return Response.json(
    { plan: access.plan },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
