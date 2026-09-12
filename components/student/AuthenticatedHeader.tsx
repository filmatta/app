import Link from "next/link";
import type { Viewer } from "@/lib/auth/get-viewer";
import AccountDropdown from "./AccountDropdown";

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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080808]/90 text-white backdrop-blur-xl">
      <div className="grid h-16 w-full max-w-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-white/10 px-4 sm:border-b-0 sm:px-6 min-[1024px]:max-[1099px]:px-8">
        <Link
          href="/"
          className="shrink-0 text-lg font-black tracking-[0.22em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          FILMATTA
        </Link>

        <nav
          aria-label="Breadcrumb"
          className="hidden min-w-0 justify-self-start text-sm text-white/45 sm:block"
        >
          <BreadcrumbItems breadcrumbs={breadcrumbs} />
        </nav>

        <AccountDropdown viewer={viewer} />
      </div>

      <nav
        aria-label="Breadcrumb"
        className="flex h-10 w-full max-w-none items-center overflow-hidden px-4 text-xs text-white/45 sm:hidden"
      >
        <BreadcrumbItems breadcrumbs={breadcrumbs} compact />
      </nav>
    </header>
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
