import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";

type AdminStats = {
  users_total: number;
  courses_total: number;
  published_courses: number;
  enrollments_total: number;
  enrolled_students: number;
  active_enrollments: number;
};

const emptyStats: AdminStats = {
  users_total: 0,
  courses_total: 0,
  published_courses: 0,
  enrollments_total: 0,
  enrolled_students: 0,
  active_enrollments: 0,
};

export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("get_admin_learn_stats");

  if (error) {
    console.error("Error cargando métricas de administración:", error);
  }

  const stats = ((data?.[0] as AdminStats | undefined) ?? emptyStats);
  const metrics = [
    { label: "Usuarios totales", value: stats.users_total },
    { label: "Cursos totales", value: stats.courses_total },
    { label: "Cursos publicados", value: stats.published_courses },
    { label: "Inscripciones totales", value: stats.enrollments_total },
    { label: "Alumnos inscritos", value: stats.enrolled_students },
    { label: "Inscripciones activas", value: stats.active_enrollments },
  ];

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-6 py-5 lg:px-8">
          <Link href="/" className="text-xl font-black tracking-[0.25em]">
            FILMATTA
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/cuenta" className="text-white/50 transition hover:text-white">
              Mi cuenta
            </Link>
            <span className="hidden uppercase tracking-[0.2em] text-white/25 sm:inline">
              Admin
            </span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          Panel de administración
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          FILMATTA CMS
        </h1>
        <p className="mt-6 max-w-xl text-lg text-white/50">
          Una vista clara del catálogo y sus primeras señales de uso.
        </p>

        {error && (
          <p className="mt-10 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200">
            Las métricas estarán disponibles cuando se aplique la migración de
            Learn.
          </p>
        )}

        <section aria-labelledby="metrics-heading" className="mt-14">
          <h2 id="metrics-heading" className="sr-only">
            Métricas de FILMATTA Learn
          </h2>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="bg-[#0b0b0b] p-7 sm:p-8">
                <p className="text-4xl font-semibold tabular-nums">
                  {formatMetric(metric.value)}
                </p>
                <p className="mt-3 text-sm text-white/35">{metric.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="quick-actions-heading" className="mt-20">
          <p className="text-xs uppercase tracking-[0.24em] text-white/30">
            Accesos rápidos
          </p>
          <h2 id="quick-actions-heading" className="mt-2 text-3xl font-semibold">
            Gestión
          </h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            <QuickLink
              href="/admin/cursos/nuevo"
              eyebrow="Contenido"
              title="Crear curso"
              primary
            />
            <QuickLink
              href="/admin/cursos"
              eyebrow="Catálogo"
              title="Administrar cursos"
            />
            <QuickLink href="/" eyebrow="FILMATTA" title="Ver sitio público" />
          </div>
        </section>
      </section>
    </main>
  );
}

function QuickLink({
  href,
  eyebrow,
  title,
  primary = false,
}: {
  href: string;
  eyebrow: string;
  title: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-2xl border p-7 transition ${
        primary
          ? "border-white bg-white text-black hover:bg-white/85"
          : "border-white/10 bg-white/[0.025] hover:bg-white/[0.06]"
      }`}
    >
      <p
        className={`text-xs uppercase tracking-[0.2em] ${
          primary ? "text-black/45" : "text-white/30"
        }`}
      >
        {eyebrow}
      </p>
      <p className="mt-12 text-xl font-semibold">{title}</p>
      <p className={`mt-3 text-sm ${primary ? "text-black/50" : "text-white/40"}`}>
        Abrir →
      </p>
    </Link>
  );
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("es-MX").format(value);
}
