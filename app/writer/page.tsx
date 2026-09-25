import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import WriterLibrary, { type WriterListItem } from "@/components/writer/WriterLibrary";
import { getViewer } from "@/lib/auth/get-viewer";
import { getBillingAccess } from "@/lib/billing/access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Mis guiones · Writer",
  robots: { index: false, follow: false },
};

export default async function WriterPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/writer");
  const [supabase, billing] = await Promise.all([createClient(), getBillingAccess()]);
  const result = await supabase
    .from("writer_scripts")
    .select("id,title,revision,updated_at")
    .order("updated_at", { ascending: false });
  const scripts = (result.data ?? []) as WriterListItem[];
  return (
    <div className="writer-library-page">
      <SiteHeader contextLink={{ href: "/tools", label: "← Tools" }} />
      <WriterLibrary initialScripts={scripts} limit={writerLimitForPlan(billing.plan)} userId={viewer.id} />
    </div>
  );
}

function writerLimitForPlan(plan: "plus" | "pro" | null) {
  // Writer does not have paid entitlements yet. Keep the product decision explicit.
  switch (plan) {
    case "plus":
    case "pro":
    case null:
      return 3;
  }
}
