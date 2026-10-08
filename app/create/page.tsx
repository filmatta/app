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
      <h1 className="mt-8 text-4xl font-semibold">{projects.length ? "Tus proyectos Create" : "Tu primera historia empieza aquí"}</h1>
      <p className="mt-3 max-w-2xl text-white/65">{projects.length ? "Retoma un proyecto o crea uno nuevo. Cada proyecto reúne Writer, Shotlist, Storyboard y Production." : "FILMATTA Create reúne tu guion y la planificación de rodaje en un mismo proyecto. Ponle nombre y empezarás a escribir en Writer."}</p>
      <section className="mt-9" aria-labelledby="new-project-heading"><h2 id="new-project-heading" className="mb-4 text-lg font-semibold">{projects.length ? "Nuevo proyecto" : "Crea tu primer proyecto"}</h2><CreateProjectForm /></section>
      <section className="mt-12"><h2 className="mb-4 text-lg font-semibold">Tus proyectos</h2>
        {projects.length ? <ul className="grid gap-3 sm:grid-cols-2">{projects.map((project) => <li key={project.id}>
          <Link className="block rounded-lg border border-white/20 p-5 hover:border-white/50" href={`/create/projects/${project.id}`}><strong>{project.name}</strong><span className="mt-2 block text-xs text-white/50">Abrir módulos →</span></Link>
        </li>)}</ul> : <p className="text-white/55">Todavía no tienes proyectos. Al crear uno se abrirá un guion nuevo en Writer.</p>}
      </section>
    </div>
  </main>;
}
