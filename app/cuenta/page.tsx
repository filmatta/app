import LegacyAccountLinks from "./LegacyAccountLinks";
import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getAccountDashboard } from "@/lib/account/dashboard";
import { getBillingAccess } from "@/lib/billing/access";
import StatusBadge from "@/components/ui/StatusBadge";
import ProfileAvatar from "@/components/profiles/ProfileAvatar";
import ProjectMetadata, { ProjectStatus } from "@/components/networking/ProjectMetadata";
import "@/components/networking/networking.css";
import "./dashboard.css";
export const metadata = {title:"Cuenta",robots:{index:false,follow:false}};
function Icon({kind}:{kind:"profile"|"project"|"request"|"network"|"location"|"learn"}) {
 const paths={profile:"M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0",project:"M3 6h7l2 3h9v11H3ZM3 6V4h7l2 2",request:"M3 4h18v13H8l-5 4ZM7 8h10M7 12h7",network:"M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M17 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 16a5 5 0 0 1 10 0M12 22a5 5 0 0 1 10 0",location:"M12 22s8-9 8-14A8 8 0 0 0 4 8c0 5 8 14 8 14ZM12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6",learn:"m9 6 10 6-10 6ZM3 3v18"};
 return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d={paths[kind]}/></svg>;
}
export default async function AccountDashboardPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const feedback=await searchParams;
 if(Object.keys(feedback).some(key=>["profile","profile_error","email","email_error","password","password_error","session_error"].includes(key))){const query=new URLSearchParams();for(const [key,value] of Object.entries(feedback)){if(typeof value==="string")query.set(key,value);}redirect("/cuenta/configuracion?"+query.toString());}
 const viewer=await getViewer();if(!viewer)redirect("/login?next=%2Fcuenta");
 const [d,billing]=await Promise.all([getAccountDashboard(viewer.id),getBillingAccess()]);
 const portrait=d.profile?.presentation as {portrait_media_id?:string;portrait_url?:string}|undefined;
 return <div className="editorial-page"><LegacyAccountLinks/><SiteHeader/><main className="network-shell account-dashboard">
 <header className="account-dashboard-header"><p className="eyebrow">CUENTA</p><h1>Hola, {viewer.fullName || "bienvenido"}.</h1><p>Aquí puedes continuar tu trabajo y administrar tu cuenta.</p></header>
 {d.partial&&<p role="status" className="network-muted">Algunos resúmenes no están disponibles. Puedes seguir usando los accesos.</p>}
 <section aria-labelledby="quick-links"><h2 id="quick-links">Accesos rápidos</h2><div className="account-quick-grid">
 <Link className="network-card account-quick-card" href="/mi-perfil"><div className="account-quick-icon">{<ProfileAvatar id={portrait?.portrait_media_id} fallbackUrl={portrait?.portrait_url} name={d.profile?.display_name||viewer.displayName}/>}</div><h3>Mi perfil</h3>{d.profile?<StatusBadge tone={d.profile.is_public?"success":"neutral"}>{d.profile.is_public?"Publicado":"Borrador"}</StatusBadge>:d.profile===null?<p>Crea tu presencia profesional.</p>:null}<span className="network-card-cta">Editar perfil →</span></Link>
 <Link className="network-card account-quick-card" href="/mis-proyectos"><div className="account-quick-icon"><Icon kind="project"/></div><h3>Mis proyectos</h3>{d.active!==null&&d.pending!==null&&<p>{d.active} activos · {d.pending} por confirmar</p>}<span className="network-card-cta">Abrir proyectos →</span></Link>
 <Link className="network-card account-quick-card" href="/cuenta/contactos"><div className="account-quick-icon"><Icon kind="request"/></div><h3>Solicitudes / Contactos</h3>{d.summary&&(d.summary.pending_received || d.summary.location_pending_received ? <div className="network-credit-metrics">{d.summary.pending_received > 0 && <StatusBadge tone="warning">{d.summary.pending_received} profesionales</StatusBadge>}{Boolean(d.summary.location_pending_received) && <StatusBadge tone="info">{d.summary.location_pending_received} locaciones</StatusBadge>}</div>:<p>No tienes solicitudes pendientes.</p>)}<span className="network-card-cta">Ver solicitudes →</span></Link>
 <Link className="network-card account-quick-card" href="/mi-red"><div className="account-quick-icon"><Icon kind="network"/></div><h3>Mi red</h3>{d.summary&&<p>{d.summary.followers} seguidores · {d.summary.following} siguiendo</p>}<span className="network-card-cta">Ver red →</span></Link>
 <Link className="network-card account-quick-card" href="/mis-locaciones"><div className="account-quick-icon"><Icon kind="location"/></div><h3>Mis locaciones</h3>{d.locations!==null&&<p>{d.locations} publicadas</p>}<span className="network-card-cta">Administrar locaciones →</span></Link>
 <Link className="network-card account-quick-card" href="/cuenta/configuracion#mis-cursos"><div className="account-quick-icon"><Icon kind="learn"/></div><h3>Learn</h3><p>Tu biblioteca y acceso al catálogo.</p><span className="network-card-cta">Continuar aprendiendo →</span></Link>
 </div></section>
 {d.latest&&<section className="account-recent" aria-labelledby="latest-project"><h2 id="latest-project">Último proyecto actualizado</h2><Link className="network-card" href={"/proyectos/"+d.latest.slug}><ProjectStatus project={d.latest}/><h3>{d.latest.title}</h3><ProjectMetadata project={d.latest}/><p className="network-muted">Actualizado {new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeZone:"America/Mexico_City"}).format(new Date(d.latest.updated_at))}</p><span className="network-card-cta">Abrir →</span></Link></section>}
 <section className="account-configuration" aria-labelledby="account-settings"><h2 id="account-settings">Configuración</h2><div className="account-settings-links"><Link href="/cuenta/configuracion#configuracion">Configuración →</Link><Link href="/cuenta/configuracion#datos-contacto">Datos de contacto →</Link><Link href="/cuenta/configuracion#seguridad">Seguridad →</Link><Link href="/cuenta/suscripcion">Plan / suscripción →</Link></div>{billing.plan&&<p className="account-plan">Tu plan <StatusBadge tone={billing.plan==="pro"?"pro":"plus"}>{billing.plan}</StatusBadge></p>}</section>
 </main></div>;
}
