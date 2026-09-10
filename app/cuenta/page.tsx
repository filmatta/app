import Link from "next/link";
import { redirect } from "next/navigation";
import {
  logout,
  requestEmailChange,
  updatePersonalProfile,
} from "@/app/cuenta/actions";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { createClient } from "@/lib/supabase/server";

type Enrollment = {
  id: string;
  course_id: string;
  status: "active" | "completed";
  enrolled_at: string;
  completed_at: string | null;
};

type EnrolledCourse = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  cover_image_url: string | null;
  category: string | null;
  level: string | null;
  duration_minutes: number | null;
};

type CourseWithEnrollment = Enrollment & { course: EnrolledCourse };

type AccountSearchParams = {
  profile?: string;
  profile_error?: string;
  email?: string;
  email_error?: string;
  password?: string;
  session_error?: string;
};

export default async function CuentaPage({
  searchParams,
}: {
  searchParams: Promise<AccountSearchParams>;
}) {
  const viewer = await getViewer();

  if (!viewer) {
    redirect("/login?next=%2Fcuenta");
  }

  const feedback = await searchParams;

  const supabase = await createClient();
  const { data: enrollmentData, error: enrollmentError } = await supabase
    .from("course_enrollments")
    .select("id, course_id, status, enrolled_at, completed_at")
    .eq("user_id", viewer.id)
    .in("status", ["active", "completed"])
    .order("enrolled_at", { ascending: false });

  const enrollments = (enrollmentData ?? []) as Enrollment[];
  const courseIds = [...new Set(enrollments.map((item) => item.course_id))];
  const coursesResult = courseIds.length
    ? await supabase
        .from("courses")
        .select(
          "id, title, slug, short_description, cover_image_url, category, level, duration_minutes"
        )
        .in("id", courseIds)
    : { data: [] as EnrolledCourse[], error: null };

  const courseById = new Map(
    ((coursesResult.data ?? []) as EnrolledCourse[]).map((course) => [
      course.id,
      course,
    ])
  );
  const visibleEnrollments = enrollments.flatMap((enrollment) => {
    const course = courseById.get(enrollment.course_id);
    return course ? [{ ...enrollment, course }] : [];
  });
  const activeCourses = visibleEnrollments.filter(
    (item) => item.status === "active"
  );
  const completedCourses = visibleEnrollments.filter(
    (item) => item.status === "completed"
  );
  const loadingError = enrollmentError || coursesResult.error;

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader contextLink={{ href: "/cursos", label: "Explorar cursos" }} />

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
          FILMATTA Learn
        </p>
        <div className="mt-4 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
              Hola, {viewer.displayName}.
            </h1>
            {viewer.email && (
              <p className="mt-3 text-sm text-white/35">{viewer.email}</p>
            )}
          </div>
          <Link
            href="/cursos"
            className="w-fit rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
          >
            Descubrir cursos
          </Link>
        </div>

        <nav
          aria-label="Secciones de la cuenta"
          className="mt-10 flex flex-wrap gap-2 border-y border-white/10 py-4"
        >
          <AccountLink href="#mis-cursos">Mis cursos</AccountLink>
          <AccountLink href="#actividad">Tu actividad</AccountLink>
          <AccountLink href="#perfil">Datos personales</AccountLink>
          <AccountLink href="#seguridad">Seguridad</AccountLink>
        </nav>

        {loadingError && (
          <p className="mt-10 rounded-xl border border-red-500/20 bg-red-500/[0.05] p-4 text-sm text-red-200">
            No pudimos cargar tus cursos en este momento.
          </p>
        )}

        <section
          id="mis-cursos"
          aria-labelledby="my-courses-heading"
          className="scroll-mt-8 pt-16"
        >
          <div className="flex items-end justify-between gap-6 border-b border-white/10 pb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-white/30">
                Biblioteca
              </p>
              <h2 id="my-courses-heading" className="mt-2 text-3xl font-semibold">
                Mis cursos
              </h2>
            </div>
            {visibleEnrollments.length > 0 && (
              <span className="text-sm text-white/35">
                {visibleEnrollments.length} en total
              </span>
            )}
          </div>

          {!loadingError && visibleEnrollments.length === 0 ? (
            <div className="py-16 text-center sm:py-24">
              <p className="text-2xl font-medium">Tu próxima historia empieza aquí.</p>
              <p className="mx-auto mt-3 max-w-md leading-7 text-white/40">
                Aún no tienes cursos. Explora el catálogo y añade el primero a
                tu cuenta.
              </p>
              <Link
                href="/cursos"
                className="mt-8 inline-flex rounded-full bg-white px-6 py-3.5 font-semibold text-black transition hover:bg-white/85"
              >
                Explorar cursos
              </Link>
            </div>
          ) : (
            <div className="mt-8 space-y-14">
              {activeCourses.length > 0 && (
                <CourseGroup
                  title="Cursos activos"
                  courses={activeCourses}
                  actionLabel="Continuar curso"
                />
              )}
              {completedCourses.length > 0 && (
                <CourseGroup
                  title="Cursos completados"
                  courses={completedCourses}
                  actionLabel="Volver al curso"
                />
              )}
            </div>
          )}
        </section>

        <section
          id="actividad"
          aria-labelledby="activity-heading"
          className="mt-20 scroll-mt-8 border-t border-white/10 pt-12"
        >
          <p className="text-xs uppercase tracking-[0.24em] text-white/30">
            Aprendizaje
          </p>
          <h2 id="activity-heading" className="mt-2 text-3xl font-semibold">
            Tu actividad
          </h2>

          {visibleEnrollments.length === 0 ? (
            <p className="mt-6 max-w-xl leading-7 text-white/40">
              Tu actividad aparecerá aquí cuando empieces a estudiar.
            </p>
          ) : (
            <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
              <ActivityMetric label="Cursos activos" value={activeCourses.length} />
              <ActivityMetric
                label="Cursos completados"
                value={completedCourses.length}
              />
              <p className="bg-[#0b0b0b] p-6 text-sm leading-6 text-white/35 sm:col-span-2">
                El tiempo estudiado, las lecciones completadas y las rachas se
                mostrarán cuando el seguimiento real de aprendizaje esté activo.
              </p>
            </div>
          )}
        </section>

        <section
          id="perfil"
          aria-labelledby="profile-heading"
          className="mt-20 scroll-mt-8 border-t border-white/10 pt-12"
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-white/30">
                Perfil
              </p>
              <h2 id="profile-heading" className="mt-2 text-3xl font-semibold">
                Datos personales
              </h2>
              <p className="mt-4 max-w-md leading-7 text-white/40">
                Este nombre se usa para saludarte y será la base de tu futuro
                perfil profesional en FILMATTA.
              </p>
            </div>

            <form
              action={updatePersonalProfile}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8"
            >
              <label htmlFor="full_name" className="text-sm text-white/60">
                Nombre
              </label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                minLength={2}
                maxLength={80}
                required
                autoComplete="name"
                defaultValue={viewer.fullName ?? ""}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 outline-none transition focus:border-white/30"
              />

              {feedback.profile === "saved" && (
                <Feedback variant="success">Nombre actualizado.</Feedback>
              )}
              {feedback.profile_error && (
                <Feedback variant="error">{feedback.profile_error}.</Feedback>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs leading-5 text-white/30">
                  Nombre profesional, ciudad, bio y avatar estarán disponibles
                  cuando exista su estructura de perfil.
                </p>
                <button
                  type="submit"
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85"
                >
                  Guardar nombre
                </button>
              </div>
            </form>
          </div>
        </section>

        <section
          id="seguridad"
          aria-labelledby="security-heading"
          className="mt-20 scroll-mt-8 border-t border-white/10 pb-12 pt-12"
        >
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-white/30">
                Cuenta
              </p>
              <h2 id="security-heading" className="mt-2 text-3xl font-semibold">
                Seguridad de cuenta
              </h2>
              <p className="mt-4 max-w-md leading-7 text-white/40">
                Administra el correo de acceso, recupera tu contraseña o cierra
                la sesión actual.
              </p>
            </div>

            <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.025] px-6 sm:px-8">
              <form action={requestEmailChange} className="py-7">
                <h3 className="font-medium">Correo de acceso</h3>
                {viewer.email && (
                  <p className="mt-2 text-sm text-white/35">
                    Correo actual: {viewer.email}
                  </p>
                )}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <label htmlFor="new_email" className="sr-only">
                    Nuevo correo
                  </label>
                  <input
                    id="new_email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Nuevo correo"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none transition placeholder:text-white/25 focus:border-white/30"
                  />
                  <button
                    type="submit"
                    className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium transition hover:bg-white/[0.06]"
                  >
                    Cambiar correo
                  </button>
                </div>
                {feedback.email === "confirmation" && (
                  <Feedback variant="success">
                    Revisa tu correo para confirmar el cambio.
                  </Feedback>
                )}
                {feedback.email === "confirmed" && (
                  <Feedback variant="success">Correo confirmado.</Feedback>
                )}
                {feedback.email_error && (
                  <Feedback variant="error">{feedback.email_error}.</Feedback>
                )}
              </form>

              <div className="flex flex-col justify-between gap-4 py-7 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-medium">Contraseña</h3>
                  <p className="mt-2 text-sm text-white/35">
                    Recibe un enlace seguro para establecer una nueva.
                  </p>
                  {feedback.password === "updated" && (
                    <Feedback variant="success">
                      Contraseña actualizada.
                    </Feedback>
                  )}
                </div>
                <Link
                  href={`/recuperar-contrasena?next=${encodeURIComponent("/cuenta")}`}
                  className="w-fit rounded-full border border-white/15 px-5 py-3 text-sm font-medium transition hover:bg-white/[0.06]"
                >
                  Cambiar contraseña
                </Link>
              </div>

              <div className="flex flex-col justify-between gap-4 py-7 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-medium">Sesión</h3>
                  <p className="mt-2 text-sm text-white/35">
                    Cierra tu sesión en este navegador.
                  </p>
                  {feedback.session_error && (
                    <Feedback variant="error">{feedback.session_error}.</Feedback>
                  )}
                </div>
                <form action={logout}>
                  <button
                    type="submit"
                    className="rounded-full border border-red-500/20 px-5 py-3 text-sm font-medium text-red-200 transition hover:bg-red-500/10"
                  >
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function AccountLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-full px-4 py-2 text-sm text-white/50 transition hover:bg-white/[0.05] hover:text-white"
    >
      {children}
    </Link>
  );
}

function Feedback({
  variant,
  children,
}: {
  variant: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      role={variant === "error" ? "alert" : "status"}
      className={`mt-4 text-sm ${
        variant === "error" ? "text-red-300" : "text-green-200"
      }`}
    >
      {children}
    </p>
  );
}

function CourseGroup({
  title,
  courses,
  actionLabel,
}: {
  title: string;
  courses: CourseWithEnrollment[];
  actionLabel: string;
}) {
  return (
    <div>
      <h3 className="mb-5 text-sm font-medium text-white/50">{title}</h3>
      <div className="grid gap-5 lg:grid-cols-2">
        {courses.map(({ id, course }) => (
          <article
            key={id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] sm:grid sm:grid-cols-[11rem_minmax(0,1fr)]"
          >
            <div className="aspect-video bg-white/[0.04] sm:aspect-auto">
              {course.cover_image_url ? (
                <img
                  src={course.cover_image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full min-h-36 items-center justify-center text-[10px] font-semibold tracking-[0.25em] text-white/15">
                  FILMATTA
                </div>
              )}
            </div>
            <div className="flex min-h-56 flex-col p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-white/30">
                {[course.category, course.level].filter(Boolean).join(" · ") ||
                  "FILMATTA Learn"}
              </p>
              <h4 className="mt-3 text-xl font-semibold">{course.title}</h4>
              {course.short_description && (
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/40">
                  {course.short_description}
                </p>
              )}
              <Link
                href={`/cursos/${course.slug}#contenido`}
                className="mt-auto pt-6 text-sm font-semibold text-white/70 transition hover:text-white"
              >
                {actionLabel} →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ActivityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#0b0b0b] p-6 sm:p-8">
      <p className="text-4xl font-semibold tabular-nums">{value}</p>
      <p className="mt-2 text-sm text-white/35">{label}</p>
    </div>
  );
}
