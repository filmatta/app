import Link from "next/link";

export default function AdminHeader() {
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5 lg:px-8">
        <Link href="/" className="text-xl font-black tracking-[0.25em]">
          FILMATTA
        </Link>

        <nav aria-label="Navegación administrativa" className="flex items-center gap-4">
          <Link
            href="/admin"
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-white/65 transition hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
          >
            Panel
          </Link>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-white/30 sm:inline">
            CMS
          </span>
        </nav>
      </div>
    </header>
  );
}
