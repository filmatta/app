import { createClient } from "@/lib/supabase/server";
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
  const professional = viewer ? (await (await createClient()).from("professional_profiles").select("display_name,presentation").eq("user_id", viewer.id).maybeSingle()).data : null;
  const portrait = professional?.presentation as { portrait_media_id?: string; portrait_url?: string; stage_name?: string } | null;
  return (
    <GlobalNavigation authenticated={Boolean(viewer)} role={viewer?.role}
      accountName={portrait?.stage_name || professional?.display_name || viewer?.displayName} accountPortrait={{ id: portrait?.portrait_media_id, url: portrait?.portrait_url }} hasContextLink={Boolean(contextLink)}
      badge={<BillingPlanBadge authenticated={Boolean(viewer)} />}>
      {contextLink && <div className="mx-auto max-w-[1800px] px-6 pb-3 text-xs text-white/65 lg:px-8 xl:px-12">
        <Link href={contextLink.href}>{contextLink.label}</Link>
      </div>}
    </GlobalNavigation>
  );
}
