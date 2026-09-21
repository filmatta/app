import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import NetworkMemberCard from "@/components/networking/NetworkMemberCard";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/get-viewer";
import type { NetworkMember, Summary } from "@/lib/networking/types";
import "@/components/networking/networking.css";
export const metadata = { title: "Mi red", robots: { index: false, follow: false } };
export default async function NetworkPage({ searchParams }: { searchParams: Promise<{ box?: string; page?: string }> }) {
  if (!(await getViewer())) redirect("/login?next=%2Fmi-red");
  const q = await searchParams, box = q.box === "following" ? "following" : "followers", page = Math.max(1,Math.min(1000,Number(q.page)||1));
  const db = await createClient(); const [list,summary] = await Promise.all([db.rpc("get_my_network", { p_box: box, p_page: page }),db.rpc("get_my_network_summary")]);
  const rows = (list.data ?? []) as NetworkMember[], s = summary.data as Summary | null;
  return <div className="editorial-page"><SiteHeader /><main className="network-shell"><header className="network-heading"><p className="eyebrow">TU ESPACIO PRIVADO</p><h1>Mi red</h1><p>Sólo tú puedes consultar tu lista completa.</p></header>
    <nav className="network-tabs" aria-label="Mi red"><Link href="/mi-red" aria-current={box === "followers" ? "page" : undefined}>Seguidores {s?.followers ?? ""}</Link><Link href="/mi-red?box=following" aria-current={box === "following" ? "page" : undefined}>Siguiendo {s?.following ?? ""}</Link></nav>
    {list.error || summary.error ? <p role="alert">No pudimos cargar tu red.</p> : rows.length ? <div className="network-list">{rows.slice(0,24).map(m => <NetworkMemberCard key={m.profile_id} member={m} following={box === "following"} />)}</div> : <p className="network-empty">{box === "followers" ? "Todavía no tienes seguidores." : "Aún no sigues a nadie."}</p>}
    <div className="network-pagination">{page > 1 ? <Link href={`/mi-red?box=${box}&page=${page-1}`}>← Anterior</Link> : <span />}{rows.length > 24 && <Link href={`/mi-red?box=${box}&page=${page+1}`}>Siguiente →</Link>}</div>
  </main></div>;
}
