import Link from "next/link";
import { getViewer } from "@/lib/auth/get-viewer";
import BillingPlanBadge from "@/components/BillingPlanBadge";
import GlobalNavigation from "@/components/navigation/GlobalNavigation";

export default async function SiteHeader({ contextLink }: {
  showPrimaryNavigation?: boolean;
  contextLink?: { href: string; label: string };
  hideAccountLink?: boolean;
}) {
  const viewer = await getViewer();
  return (
    <GlobalNavigation authenticated={Boolean(viewer)} role={viewer?.role}
      accountName={viewer?.displayName} hasContextLink={Boolean(contextLink)}
      badge={<BillingPlanBadge authenticated={Boolean(viewer)} />}>
      {contextLink && <div className="mx-auto max-w-[1800px] px-6 pb-3 text-xs text-white/65 lg:px-8 xl:px-12">
        <Link href={contextLink.href}>{contextLink.label}</Link>
      </div>}
    </GlobalNavigation>
  );
}
