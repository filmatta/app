import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (!userId) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "admin") {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link href="/" className="text-xl font-black tracking-[0.25em]">
            FILMATTA
          </Link>

          <span className="text-xs uppercase tracking-[0.2em] text-white/35">
            Admin
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Panel de administración
        </p>

        <h1 className="text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          FILMATTA CMS
        </h1>

        <p className="mt-6 max-w-xl text-lg text-white/50">
          Administra el contenido y las herramientas de la plataforma.
        </p>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/cursos"
            className="group min-h-64 rounded-2xl border border-white/10 bg-white/[0.025] p-8 transition hover:bg-white/[0.06]"
          >
            <span className="text-xs text-white/30">01</span>

            <h2 className="mt-20 text-3xl font-semibold">
              Cursos
            </h2>

            <p className="mt-3 text-white/45">
              Crear, editar y publicar cursos.
            </p>

            <p className="mt-8 text-sm text-white/60 group-hover:text-white">
              Administrar →
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}