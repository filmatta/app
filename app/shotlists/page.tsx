import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";
import { listWriterShotlists } from "@/lib/writer/production-server";
import ShotlistCreateButton from "@/components/shotlist/ShotlistCreateButton";

export const metadata: Metadata = { title: "Shotlists · FILMATTA", robots: { index: false, follow: false } };

export default async function ShotlistsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/shotlists");
  const shotlists = await listWriterShotlists(await createClient(), viewer.id);
  return (
    <main className="shotlist-index">
      <header><Link href="/">FILMATTA</Link><span /> <strong>Shotlist</strong></header>
      <section className="shotlist-index-head">
        <div><p>PREPRODUCCIÓN</p><h1>Shotlists</h1><span>Planifica cobertura sin perder el vínculo con tu guion.</span></div>
        <ShotlistCreateButton />
      </section>
      {shotlists.length ? <ul className="shotlist-index-list">{shotlists.map((shotlist) => (
        <li key={shotlist.id}><Link href={`/shotlists/${shotlist.id}`}><strong>{shotlist.title}</strong><span>{shotlist.scriptId ? "Vinculada a Writer" : "Shotlist libre"}</span><small>Actualizada {new Date(shotlist.updatedAt).toLocaleString("es-MX")}</small></Link></li>
      ))}</ul> : <div className="shotlist-index-empty"><h2>Tu primera lista de planos</h2><p>Empieza libremente o créala desde un guion en Writer.</p><ShotlistCreateButton /></div>}
    </main>
  );
}
