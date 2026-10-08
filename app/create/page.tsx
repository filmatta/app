import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCreateProjects } from "@/lib/create/project";
import CreateProjectForm from "@/components/create/CreateProjectForm";

export const metadata: Metadata = { title: "Create · Projects", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) redirect("/login?next=/create");
  const projects = await listCreateProjects(db, auth.data.user.id);
  return <main className="min-h-screen bg-[#080808] px-5 py-12 text-white">
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="text-sm text-white/60">← FILMATTA</Link>
      <h1 className="mt-8 text-4xl font-semibold">Create</h1>
      <p className="mt-3 text-white/65">Cada proyecto reúne guion, Shotlists, Storyboards y Production.</p>
      <section className="mt-9"><h2 className="mb-4 text-lg font-semibold">Nuevo proyecto</h2><CreateProjectForm /></section>
      <section className="mt-12"><h2 className="mb-4 text-lg font-semibold">Tus proyectos</h2>
        {projects.length ? <ul className="grid gap-3 sm:grid-cols-2">{projects.map((project) => <li key={project.id}>
          <Link className="block rounded-lg border border-white/20 p-5 hover:border-white/50" href={`/create/projects/${project.id}`}><strong>{project.name}</strong><span className="mt-2 block text-xs text-white/50">Abrir módulos →</span></Link>
        </li>)}</ul> : <p className="text-white/55">Aún no tienes proyectos Create.</p>}
      </section>
    </div>
  </main>;
}
