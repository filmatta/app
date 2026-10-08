import Link from "next/link";
import { redirect } from "next/navigation";
import LegacyAccountLinks from "./LegacyAccountLinks";
import SiteHeader from "@/components/SiteHeader";
import { PlanBadge } from "@/components/entitlements/PlanBadge";
import { getViewer } from "@/lib/auth/get-viewer";
import {
  getAccountDashboard,
  type CreateDashboardItem,
} from "@/lib/account/dashboard";
import { getBillingAccess } from "@/lib/billing/access";
import { surfacesFor } from "@/lib/create/catalog";
import { listCreateProjects } from "@/lib/create/project";
import { createClient } from "@/lib/supabase/server";
import "./dashboard.css";

export const metadata = {
  title: "Dashboard · FILMATTA CREATE",
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeZone: "America/Mexico_City",
});

function CreationCard({ item, featured = false }: { item: CreateDashboardItem; featured?: boolean }) {
  return (
    <Link className={`create-dashboard-item${featured ? " is-featured" : ""}`} href={item.href}>
      <span className="create-dashboard-kind">{item.kind === "writer" ? "WRITER" : "SHOTLIST"}</span>
      <h3>{item.title}</h3>
      {item.relation && <p>{item.relation}</p>}
      <small>Editado {dateFormatter.format(new Date(item.updatedAt))}</small>
      <b>Abrir <span>↗</span></b>
    </Link>
  );
}
export default async function AccountDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const feedback = await searchParams;
  if (
    Object.keys(feedback).some((key) =>
      ["profile", "profile_error", "email", "email_error", "password", "password_error", "session_error"].includes(key),
    )
  ) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(feedback)) {
      if (typeof value === "string") query.set(key, value);
    }
    redirect("/cuenta/configuracion?" + query.toString());
  }

  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Fcuenta");
  const [dashboard, billing, projects] = await Promise.all([
    getAccountDashboard(viewer.id),
    getBillingAccess(),
    createClient().then((db) => listCreateProjects(db, viewer.id)),
  ]);
  const [continueItem, ...otherRecent] = dashboard.recent;
  const available = surfacesFor("dashboard").filter((surface) => surface.href);
  const upcoming = surfacesFor("dashboard").filter((surface) => !surface.href);

  return (
    <div className="create-dashboard-page">
      <LegacyAccountLinks />
      <SiteHeader />
      <main className="create-dashboard-shell">
        <header className="create-dashboard-header">
          <p><span>FILMATTA</span> CREATE</p>
          <h1>¿En qué vas a trabajar hoy?</h1>
          <span>Hola, {viewer.fullName || "bienvenido"}.</span>
        </header>

        {dashboard.partial && (
          <p role="status" className="create-dashboard-notice">
            Algunos documentos recientes no están disponibles. Puedes seguir usando Writer y Shotlist.
          </p>
        )}

        <section className="create-dashboard-continue" aria-labelledby="continue-heading">
          <div className="create-dashboard-section-title">
            <p>01</p>
            <h2 id="continue-heading">Continúa donde lo dejaste</h2>
          </div>
          {continueItem ? (
            <div className="create-dashboard-continue-grid">
              <CreationCard item={continueItem} featured />
              <div className="create-dashboard-recent-stack">
                {otherRecent.slice(0, 3).map((item) => <CreationCard item={item} key={`${item.kind}-${item.id}`} />)}
              </div>
            </div>
          ) : (
            <div className="create-dashboard-empty">
              <div><span>{projects.length ? "TU PROYECTO" : "PRIMER PASO"}</span><h3>{projects.length ? "Retoma tu proyecto." : "Crea tu primer proyecto y comienza a escribir."}</h3><p>{projects.length ? "Tu guion y las herramientas de planificación viven en el mismo proyecto." : "Dale nombre a tu historia. Crearemos el proyecto y su guion inicial para abrir Writer directamente."}</p></div>
              <Link href={projects.length === 1 ? `/create/projects/${projects[0].id}` : "/create"}>{projects.length ? "Ver proyectos" : "Crear proyecto"} <span>↗</span></Link>
            </div>
          )}
        </section>

        <section aria-labelledby="creations-heading">
          <div className="create-dashboard-section-title">
            <p>02</p>
            <h2 id="creations-heading">Tus guiones y shotlists</h2>
          </div>
          <div className="create-dashboard-libraries">
            <article>
              <header><div><span>WRITER</span><h3>Guiones</h3></div><Link href="/writer">Ver todos ↗</Link></header>
              {dashboard.scripts.length ? dashboard.scripts.slice(0, 3).map((item) => <CreationCard item={item} key={item.id} />) : <p className="create-library-empty">Todavía no tienes guiones.</p>}
            </article>
            <article>
              <header><div><span>SHOTLIST</span><h3>Listas de planos</h3></div><Link href="/shotlists">Ver todas ↗</Link></header>
              {dashboard.shotlists.length ? dashboard.shotlists.slice(0, 3).map((item) => <CreationCard item={item} key={item.id} />) : <p className="create-library-empty">Todavía no tienes shotlists.</p>}
            </article>
          </div>
        </section>

        <section aria-labelledby="tools-heading">
          <div className="create-dashboard-section-title">
            <p>03</p>
            <h2 id="tools-heading">Herramientas disponibles</h2>
          </div>
          <div className="create-dashboard-tools">
            {available.map((surface) => (
              <Link href={surface.href!} key={surface.id}>
                <span>{surface.name.toUpperCase()}</span>
                <h3>{surface.eyebrow}</h3>
                <p>{surface.description}</p>
                <b>{surface.actionLabel} ↗</b>
              </Link>
            ))}
          </div>
        </section>

        <section className="create-dashboard-learn" aria-labelledby="learn-heading">
          <div><p>04 · LEARN</p><h2 id="learn-heading">Aprende FILMATTA.</h2><span>Consulta únicamente los cursos y contenidos publicados.</span></div>
          <Link href="/cursos">Explorar Learn ↗</Link>
        </section>

        <section className="create-dashboard-upcoming" aria-labelledby="upcoming-heading">
          <div className="create-dashboard-section-title"><p>05</p><h2 id="upcoming-heading">Próximamente</h2></div>
          <div>{upcoming.map((surface) => <article key={surface.id}><span>{surface.statusLabel}</span><h3>{surface.name}</h3><p>{surface.eyebrow}</p></article>)}</div>
        </section>

        <section className="create-dashboard-account" aria-label="Cuenta y suscripción">
          <div><h2>Cuenta</h2>{billing.plan && <p>Tu plan <PlanBadge plan={billing.plan} /></p>}</div>
          <nav><Link href="/cuenta/configuracion#configuracion">Configuración</Link><Link href="/cuenta/configuracion#seguridad">Seguridad</Link><Link href="/cuenta/suscripcion">Plan / suscripción</Link></nav>
        </section>
      </main>
    </div>
  );
}
