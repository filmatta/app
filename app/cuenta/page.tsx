import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CuentaPage() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <section className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          FILMATTA
        </p>

        <h1 className="text-5xl font-semibold tracking-tight">
          Sesión iniciada.
        </h1>

        <p className="mt-6 text-lg text-white/50">
          Tu autenticación con Supabase funciona correctamente.
        </p>

        <Link
          href="/"
          className="mt-10 w-fit rounded-full border border-white/15 px-6 py-3 text-sm"
        >
          Volver a FILMATTA
        </Link>
      </section>
    </main>
  );
}