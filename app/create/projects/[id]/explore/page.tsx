import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreateProjectContext } from "@/lib/create/project";
import { isIdeationSynthesis, isRecord } from "@/lib/create/ideation/contract";
import { buildIdeationSandboxContext } from "@/lib/create/ideation/sandbox-context";
import { addIdeationPossibility, setIdeationPossibilityState } from "./actions";
import "./explore.css";

export const metadata: Metadata = { title: "Explorar idea · FILMATTA", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ExploreIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/login?next=/create/projects/${encodeURIComponent(id)}/explore`);
  let project;
  try { project = await getCreateProjectContext(db, user.id, id); }
  catch { notFound(); }
  const [guideResult, itemsResult] = await Promise.all([
    db.from("create_ideation_guides").select("context,synthesis").eq("project_id", id).eq("owner_id", user.id).maybeSingle(),
    db.from("create_ideation_possibilities").select("id,content,state,created_at").eq("project_id", id).eq("owner_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (guideResult.error || !guideResult.data || !isIdeationSynthesis(guideResult.data.synthesis) || itemsResult.error) notFound();
  const guide = guideResult.data.synthesis;
  const context = isRecord(guideResult.data.context) ? guideResult.data.context : {};
  const originalIdea = typeof context.originalIdea === "string" ? context.originalIdea : "";
  const possibilities = itemsResult.data ?? [];
  const sandboxContext = buildIdeationSandboxContext(context, guide, possibilities);
  return <main className="ideation-explore">
    <header><Link href={`/create/projects/${id}`}>← {project.name}</Link><span>FILMATTA · IDEATION</span></header>
    <div className="ideation-explore-grid"><section className="ideation-explore-main">
      <p className="ideation-eyebrow">EXPLORAR</p><h1>Tu idea sigue abierta.</h1>
      <p>Éste es el contexto que llevaremos al Creative Sandbox. Aquí puedes guardar posibilidades y decidir cuáles forman parte de tu historia. La conversación con IA del Sandbox aún no está conectada a esta rama.</p>
      <form action={addIdeationPossibility.bind(null, id)}><label htmlFor="ideation-possibility">Nueva posibilidad</label><textarea id="ideation-possibility" name="content" maxLength={2000} required placeholder="¿Qué otro camino podría tomar la historia?" /><button type="submit">Guardar posibilidad</button></form>
      <h2>Posibilidades y decisiones</h2><p className="ideation-empty">{sandboxContext.acceptedDecisions.length} decisiones aceptadas · {sandboxContext.possibilities.length} posibilidades abiertas</p>
      {possibilities.length ? <ul>{possibilities.map((item) => <li key={item.id}><span>{item.state === "canon" ? "Canon" : item.state === "discarded" ? "Descartada" : "Maybe"}</span><p>{item.content}</p><div><form action={setIdeationPossibilityState.bind(null, id, item.id, "canon")}><button type="submit">Canon</button></form><form action={setIdeationPossibilityState.bind(null, id, item.id, "maybe")}><button type="submit">Maybe</button></form><form action={setIdeationPossibilityState.bind(null, id, item.id, "discarded")}><button type="submit">Descartar</button></form></div></li>)}</ul> : <p className="ideation-empty">Todavía no guardas posibilidades.</p>}
    </section><aside className="ideation-explore-context"><p className="ideation-eyebrow">CONTEXTO GUARDADO</p><h2>Lo que sabemos</h2>
      {(["premise", "protagonists", "conflict", "milestones", "openQuestions"] as const).map((key) => <div key={key}><h3>{key === "premise" ? "Premisa" : key === "protagonists" ? "Protagonistas" : key === "conflict" ? "Conflicto" : key === "milestones" ? "Hitos" : "Preguntas abiertas"}</h3><p>{guide.sections[key].text || "Por definir"}</p></div>)}
      <details><summary>Ver idea original</summary><p>{originalIdea}</p></details>
    </aside></div>
  </main>;
}
