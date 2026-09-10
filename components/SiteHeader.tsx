import Link from "next/link";
import { getViewer } from "@/lib/auth/get-viewer";

export default async function SiteHeader({
  showPrimaryNavigation = false,
  contextLink,
}: {
  showPrimaryNavigation?: boolean;
  contextLink?: { href: string; label: string };
}) {
  const viewer = await getViewer();

  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5 lg:px-8">
        <Link href="/" className="shrink-0 text-xl font-black tracking-[0.25em]">
          FILMATTA
        </Link>

        {showPrimaryNavigation && (
          <nav className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            <Link href="/cursos" className="transition hover:text-white">
              Cursos
            </Link>
            <Link href="/comunidad" className="transition hover:text-white">
              Comunidad
            </Link>
            <Link href="/oportunidades" className="transition hover:text-white">
              Oportunidades
            </Link>
            <Link href="/perfiles" className="transition hover:text-white">
              Profesionales
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          {contextLink && (
            <Link
              href={contextLink.href}
              className="hidden px-3 py-2 text-sm text-white/50 transition hover:text-white sm:block"
            >
              {contextLink.label}
            </Link>
          )}

          {viewer ? (
            <>
              <Link
                href="/cuenta"
                className="px-3 py-2 text-sm text-white/70 transition hover:text-white"
              >
                Mi cuenta
              </Link>
              {viewer.role === "admin" && (
                <Link
                  href="/admin"
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
                >
                  Administrar
                </Link>
              )}
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden px-3 py-2 text-sm text-white/70 transition hover:text-white sm:block"
              >
                Entrar
              </Link>
              <Link
                href="/registro"
                className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85 sm:px-5"
              >
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
