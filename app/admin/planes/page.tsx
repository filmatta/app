import AdminHeader from "@/app/admin/AdminHeader";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getAdminGrantContext,
  type AdminPlanGrant,
} from "@/lib/billing/admin-grants";
import { isAdminGrantActive } from "@/lib/billing/effective-plan";
import { grantPlanToUser, revokePlanGrant } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; success?: string; error?: string }>;
}) {
  await requireAdmin("/admin/planes");
  const query = await searchParams;
  const identifier = query.q?.trim() ?? "";
  let context: Awaited<ReturnType<typeof getAdminGrantContext>> = null;
  let loadError = false;

  if (identifier) {
    try {
      context = await getAdminGrantContext(identifier);
    } catch (error) {
      console.error("Unable to load Admin Grants", error);
      loadError = true;
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <AdminHeader />
      <section className="mx-auto max-w-5xl px-6 py-16 lg:px-8 lg:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Administración · Planes
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
          Accesos otorgados
        </h1>
        <p className="mt-5 max-w-2xl leading-7 text-white/50">
          Otorga Plus o Pro sin crear suscripciones, facturas ni pagos en Stripe.
        </p>

        <form method="get" className="mt-10 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="grant-user-search">
            Email o ID del usuario
          </label>
          <input
            id="grant-user-search"
            name="q"
            defaultValue={identifier}
            placeholder="Email o ID del usuario"
            required
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/35"
          />
          <button className="rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-white/85">
            Buscar usuario
          </button>
        </form>

        {loadError && (
          <p role="alert" className="mt-6 rounded-xl border border-red-300/20 bg-red-300/[0.05] p-4 text-sm text-red-100">
            No pudimos cargar Admin Grants. Confirma que la migración pendiente ya fue aplicada.
          </p>
        )}
        {identifier && !context && !loadError && (
          <p className="mt-6 text-sm text-white/55">No encontramos ese usuario.</p>
        )}
        {query.error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-300/20 bg-red-300/[0.05] p-4 text-sm text-red-100">
            No pudimos {query.error === "revoke" ? "revocar" : "otorgar"} el acceso. Revisa los datos e intenta nuevamente.
          </p>
        )}
        {query.success && (
          <p role="status" className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] p-4 text-sm text-emerald-100">
            {query.success === "revoked" ? "Acceso otorgado revocado." : "Acceso otorgado correctamente."}
          </p>
        )}

        {context && (
          <div className="mt-10 space-y-8">
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
              <p className="text-sm text-white/45">Usuario</p>
              <p className="mt-2 break-all text-lg font-semibold">
                {context.user.email ?? context.user.id}
              </p>
              {context.user.email && (
                <p className="mt-1 break-all text-xs text-white/35">{context.user.id}</p>
              )}
              <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                <PlanDatum label="Plan Stripe" plan={context.access.stripePlan} />
                <PlanDatum label="Admin Grant" plan={context.access.adminGrantPlan} />
                <PlanDatum label="Plan efectivo" plan={context.access.plan} />
              </dl>
              <p className="mt-4 text-sm text-white/45">
                Origen efectivo: {sourceLabel(context.access.source)}
              </p>
            </section>

            <section className="rounded-2xl border border-white/10 p-6 sm:p-8">
              <h2 className="text-2xl font-semibold">Otorgar acceso</h2>
              <form action={grantPlanToUser} className="mt-6 grid gap-5">
                <input type="hidden" name="target" value={context.user.id} />
                <label className="grid gap-2 text-sm text-white/65">
                  Duración
                  <select name="duration" required className="rounded-xl border border-white/15 bg-[#151515] px-4 py-3 text-white">
                    <option value="7d">7 días</option>
                    <option value="30d">30 días</option>
                    <option value="90d">90 días</option>
                    <option value="none">Sin expiración</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm text-white/65">
                  Motivo opcional
                  <textarea name="reason" maxLength={500} rows={3} className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-white/35" />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button name="plan" value="plus" className="rounded-full border border-emerald-300/30 px-5 py-3 font-semibold text-emerald-100 transition hover:bg-emerald-300/10">
                    Otorgar Plus
                  </button>
                  <button name="plan" value="pro" className="rounded-full border border-amber-300/30 px-5 py-3 font-semibold text-amber-100 transition hover:bg-amber-300/10">
                    Otorgar Pro
                  </button>
                </div>
              </form>
            </section>

            <section>
              <h2 className="text-2xl font-semibold">Historial de grants</h2>
              <div className="mt-5 space-y-3">
                {context.grants.length === 0 && (
                  <p className="rounded-xl border border-white/10 p-5 text-sm text-white/45">
                    Este usuario todavía no tiene accesos otorgados.
                  </p>
                )}
                {context.grants.map((grant) => (
                  <GrantRow
                    key={grant.id}
                    grant={grant}
                    target={context.user.id}
                    evaluatedAt={context.evaluatedAt}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function PlanDatum({ label, plan }: { label: string; plan: "plus" | "pro" | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.16em] text-white/35">{label}</dt>
      <dd className="mt-1 font-semibold">{planLabel(plan)}</dd>
    </div>
  );
}

function GrantRow({ grant, target, evaluatedAt }: {
  grant: AdminPlanGrant;
  target: string;
  evaluatedAt: string;
}) {
  const now = new Date(evaluatedAt);
  const active = isAdminGrantActive(grant, now);
  const revocable = grant.revokedAt === null &&
    (!grant.expiresAt || Date.parse(grant.expiresAt) > now.getTime());
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="font-semibold">FILMATTA {planLabel(grant.plan)}</p>
          <p className="mt-1 text-sm text-white/45">{grantStatus(grant, active, now)}</p>
          {grant.expiresAt && <p className="mt-1 text-sm text-white/45">Disponible hasta {formatDate(grant.expiresAt)}</p>}
          {grant.reason && <p className="mt-3 text-sm leading-6 text-white/60">{grant.reason}</p>}
          <p className="mt-3 text-xs text-white/25">Otorgado el {formatDate(grant.createdAt)}</p>
        </div>
        {revocable && (
          <form action={revokePlanGrant}>
            <input type="hidden" name="target" value={target} />
            <input type="hidden" name="grantId" value={grant.id} />
            <button className="rounded-full border border-red-200/20 px-4 py-2 text-sm text-red-100/80 transition hover:border-red-200/35">
              Revocar acceso otorgado
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

function grantStatus(grant: AdminPlanGrant, active: boolean, now: Date) {
  if (grant.revokedAt) return `Revocado el ${formatDate(grant.revokedAt)}`;
  if (Date.parse(grant.startsAt) > now.getTime()) return `Programado para ${formatDate(grant.startsAt)}`;
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now.getTime()) return "Expirado";
  return active ? "Activo" : "Inactivo";
}

function planLabel(plan: "plus" | "pro" | null) {
  return plan === "pro" ? "Pro" : plan === "plus" ? "Plus" : "Free";
}

function sourceLabel(source: "stripe" | "admin_grant" | "both" | null) {
  return source === "both" ? "Stripe + Admin Grant" : source === "stripe" ? "Stripe" : source === "admin_grant" ? "Admin Grant" : "Sin acceso premium";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}
