import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectError, getCreateProjectContext } from "@/lib/create/project";
import ShotlistCreateButton from "@/components/shotlist/ShotlistCreateButton";
import CreateProjectWriterButton from "@/components/create/CreateProjectWriterButton";

export const metadata: Metadata = { title: "Project · Create", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CreateProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) redirect(`/login?next=/create/projects/${encodeURIComponent(id)}`);
  let project;
  try { project = await getCreateProjectContext(db, auth.data.user.id, id); }
  catch (cause) { if (cause instanceof CreateProjectError && cause.code === "not_found") notFound(); throw cause; }
  const writerRoute = project.writers.length === 1 ? `/writer/${project.writers[0].id}?project=${id}` : "#writer";
  const shotlistRoute = project.shotlists.length === 1 ? `/shotlists/${project.shotlists[0].id}?project=${id}` : "#shotlists";
  const storyboardRoute = project.storyboards.length === 1 ? `/shotlists/${project.storyboards[0].id}/storyboard?project=${id}` : "#storyboards";
  const productionRoute = project.productions.length === 1 ? `/production/${project.productions[0].id}?project=${id}` : "#production";
  return <main className="min-h-screen bg-[#080808] px-5 py-10 text-white">
    <div className="mx-auto max-w-5xl">
      <Link href="/create" className="text-sm text-white/60">← Create</Link>
      <h1 className="mt-8 text-4xl font-semibold">{project.name}</h1>
      <p className="mt-2 text-xs text-white/45">Project ID: {project.id}</p>
      <nav aria-label="Módulos del proyecto" className="mt-8 flex flex-wrap gap-3 border-y border-white/15 py-4 text-sm">
        <Link href={writerRoute}>Writer</Link><Link href={writerRoute}>Breakdown</Link>
        <Link href={shotlistRoute}>Shotlist</Link><Link href={storyboardRoute}>Storyboard</Link>
        <Link href={productionRoute}>Production</Link><span className="text-white/40">Rec</span>
      </nav>
      <div className="mt-9 grid gap-8 md:grid-cols-2">
        <section id="writer"><h2 className="text-xl font-semibold">Writer</h2>
          {project.writers.length ? <ul className="mt-4 grid gap-2">{project.writers.map((writer) => <li key={writer.id}><Link className="block rounded-md border border-white/20 p-3 hover:border-white/50" href={`/writer/${writer.id}?project=${id}`}>{writer.title}</Link></li>)}</ul>
            : <><p className="mt-4 text-white/60">No hay guion activo en este proyecto.</p><CreateProjectWriterButton projectId={id} /></>}
        </section>
        <section id="shotlists"><h2 className="text-xl font-semibold">Shotlists</h2>
          {project.shotlists.length ? <ul className="mt-4 grid gap-2">{project.shotlists.map((shotlist) => <li key={shotlist.id}><Link className="block rounded-md border border-white/20 p-3 hover:border-white/50" href={`/shotlists/${shotlist.id}?project=${id}`}>{shotlist.title}</Link></li>)}</ul>
            : <p className="mt-4 text-white/60">Todavía no hay Shotlists.</p>}
          <div className="mt-4"><ShotlistCreateButton projectId={id} /></div>
        </section>
        <section id="storyboards"><h2 className="text-xl font-semibold">Storyboards</h2>
          {project.storyboards.length ? <ul className="mt-4 grid gap-2">{project.storyboards.map((board) => <li key={board.id}><Link className="block rounded-md border border-white/20 p-3 hover:border-white/50" href={`/shotlists/${board.id}/storyboard?project=${id}`}>{board.title}<span className="ml-2 text-xs text-white/50">{board.panelCount} paneles</span></Link></li>)}</ul>
            : <p className="mt-4 text-white/60">Crea una Shotlist para comenzar su Storyboard.</p>}
        </section>
        <section id="production"><h2 className="text-xl font-semibold">Production</h2>
          {project.productions.length ? <ul className="mt-4 grid gap-2">{project.productions.map((production) => <li key={production.id}><Link className="block rounded-md border border-white/20 p-3 hover:border-white/50" href={`/production/${production.id}?project=${id}`}>{production.title}</Link></li>)}</ul>
            : <p className="mt-4 text-white/60">Todavía no hay planes de Production.</p>}
          <Link className="mt-4 inline-block rounded-md border border-white/30 px-4 py-3 text-sm" href={`/production?project=${id}`}>Abrir Production</Link>
        </section>
      </div>
    </div>
  </main>;
}
