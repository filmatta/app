import Link from "next/link";
import type { Viewer } from "@/lib/auth/get-viewer";
import BillingPlanBadge from "@/components/BillingPlanBadge";
import GlobalNavigation from "@/components/navigation/GlobalNavigation";

export type HeaderBreadcrumb = {
  label: string;
  href?: string;
};

export default function AuthenticatedHeader({
  viewer,
  breadcrumbs,
}: {
  viewer: Viewer;
  breadcrumbs: HeaderBreadcrumb[];
}) {
  return (
    <GlobalNavigation authenticated role={viewer.role} badge={<BillingPlanBadge authenticated />}>
      <nav aria-label="Ruta actual" className="mx-auto max-w-[1800px] px-6 pb-3 text-xs text-white/60 lg:px-8 xl:px-12">
        <BreadcrumbItems breadcrumbs={breadcrumbs} />
      </nav>
    </GlobalNavigation>
  );
}

function BreadcrumbItems({
  breadcrumbs,
  compact = false,
}: {
  breadcrumbs: HeaderBreadcrumb[];
  compact?: boolean;
}) {
  return (
    <ol
      className={`flex min-w-0 items-center overflow-hidden whitespace-nowrap ${
        compact ? "gap-1.5" : "gap-2"
      }`}
    >
      {breadcrumbs.map((item, index) => {
        const current = index === breadcrumbs.length - 1;

        return (
          <li
            key={`${item.label}-${index}`}
            className="flex min-w-0 items-center gap-1.5"
          >
            {index > 0 && (
              <span aria-hidden="true" className="shrink-0 text-white/20">
                /
              </span>
            )}
            {item.href && !current ? (
              <Link
                href={item.href}
                className={`truncate transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  compact ? "max-w-28" : "max-w-44"
                }`}
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={current ? "page" : undefined}
                className={`truncate ${
                  compact ? "max-w-32" : "max-w-52"
                } ${current ? "text-white/75" : ""}`}
              >
                {item.label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
