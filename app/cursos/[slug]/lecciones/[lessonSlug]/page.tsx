import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import EnrollButton from "@/app/cursos/[slug]/EnrollButton";
import { enrollInCourse } from "@/app/cursos/[slug]/actions";
import LessonProgressControls from "@/app/cursos/[slug]/lecciones/[lessonSlug]/LessonProgressControls";
import SiteHeader from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getLearnContentType } from "@/lib/learn/content-type";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { presentVideo, presentVideoPoster } from "@/lib/mux/playback";
import LessonVideoPlayer, { type VideoPresentation } from "@/components/LessonVideoPlayer";

type LessonPageProps = {
  params: Promise<{
    slug: string;
    lessonSlug: string;
  }>;
  searchParams: Promise<{
    enrolled?: string;
    enrollment_error?: string;
  }>;
};

type SyllabusModule = {
  id: string;
  title: string;
  sort_order: number;
};

type SyllabusLesson = {
  id: string;
  module_id: string;
  title: string;
  slug: string;
  sort_order: number;
  is_preview: boolean;
};

export default async function LessonPage({
  params,
  searchParams,
}: LessonPageProps) {
  const [{ slug, lessonSlug }, feedback] = await Promise.all([
    params,
    searchParams,
  ]);
  const viewer = await getViewer();
  const isAdmin = viewer?.role === "admin";
  const supabase = await createClient();

  let courseQuery = supabase
    .from("courses")
    .select("*")
    .eq("slug", slug);

  if (!isAdmin) {
    courseQuery = courseQuery.eq("status", "published");
  }

  const { data: course, error: courseError } = await courseQuery.maybeSingle();

  if (courseError) {
    console.error("Error cargando el curso de la lección:", courseError);
  }

  if (!course) {
    notFound();
  }

  const isQuickGuide = getLearnContentType(course) === "quick_guide";

  let lessonQuery = supabase
    .from("course_lessons")
    .select(
      "id, course_id, module_id, title, slug, description, duration_minutes, is_preview, status"
    )
    .eq("course_id", course.id)
    .eq("slug", lessonSlug);

  if (!isAdmin) {
    lessonQuery = lessonQuery.eq("status", "published");
  }

  const { data: lesson, error: lessonError } = await lessonQuery.maybeSingle();

  if (lessonError) {
    console.error("Error cargando la lección:", lessonError);
  }

  if (!lesson) {
    notFound();
  }

  let moduleQuery = supabase
    .from("course_modules")
    .select("id, course_id, title, status")
    .eq("id", lesson.module_id)
    .eq("course_id", course.id);

  if (!isAdmin) {
    moduleQuery = moduleQuery.eq("status", "published");
  }

  const { data: courseModule, error: moduleError } =
    await moduleQuery.maybeSingle();

  if (moduleError) {
    console.error("Error cargando el módulo de la lección:", moduleError);
  }

  if (!courseModule) {
    notFound();
  }

  const isPublished =
    course.status === "published" &&
    courseModule.status === "published" &&
    lesson.status === "published";
  const coursePath = `/cursos/${course.slug}`;
  const lessonPath = `${coursePath}/lecciones/${lesson.slug}`;

  if (!viewer && isPublished) {
    redirect(`/acceso?next=${encodeURIComponent(lessonPath)}`);
  }

  const [navigation, enrollment] = await Promise.all([
    getPublishedNavigation(supabase, course.id, lesson.id),
    viewer && !isQuickGuide
      ? getEnrollment(supabase, viewer.id, course.id)
      : Promise.resolve(null),
  ]);
  const isEnrolled = !isQuickGuide && enrollment !== null;
  const canOpenLesson =
    isAdmin ||
    (!isQuickGuide && isPublished && lesson.is_preview && isEnrolled);
  const requiresEnrollment =
    Boolean(viewer) &&
    !isAdmin &&
    !isQuickGuide &&
    isPublished &&
    lesson.is_preview &&
    !isEnrolled;
  const canTrackProgress =
    Boolean(viewer) &&
    !isQuickGuide &&
    isEnrolled &&
    isPublished &&
    lesson.is_preview;
  const progress =
    viewer && canTrackProgress
      ? await getProgress(supabase, viewer.id, course.id, lesson.id)
      : null;

  let videoPresentation: VideoPresentation = { status: "none" };
  let lockedPosterUrl: string | null = null;
  if (canOpenLesson) {
    try {
      // Authorization above checks this exact lesson, its parents and enrollment.
      const videoClient = isAdmin ? supabase : createAdminClient();
      const { data: video, error } = await videoClient.from("lesson_videos")
        .select("status, playback_policy, mux_playback_id").eq("lesson_id", lesson.id).maybeSingle();
      if (error) throw error;
      videoPresentation = await presentVideo(video);
    } catch {
      console.error("Lesson video could not be loaded", { lessonId: lesson.id });
      videoPresentation = { status: "unavailable" };
    }
  } else if (viewer && isPublished && !requiresEnrollment) {
    try {
      // A blocked viewer receives only a short-lived thumbnail URL. This query
      // never calls presentVideo, so no playback or storyboard token is minted.
      const { data: video, error } = await createAdminClient()
        .from("lesson_videos")
        .select("status, playback_policy, mux_playback_id")
        .eq("lesson_id", lesson.id)
        .maybeSingle();
      if (error) throw error;
      lockedPosterUrl = await presentVideoPoster(video);
    } catch {
      console.error("Lesson poster could not be loaded", { lessonId: lesson.id });
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <SiteHeader
        contextLink={{
          href: coursePath,
          label: isQuickGuide ? "← Volver a la guía" : "← Volver al curso",
        }}
      />

      <article className="mx-auto max-w-6xl px-6 pb-20 pt-10 lg:px-8 lg:pb-28 lg:pt-14">
        <nav aria-label="Ruta de la lección" className="text-sm text-white/35">
          <Link href={coursePath} className="transition hover:text-white">
            {course.title}
          </Link>
          <span className="px-2 text-white/20">/</span>
          <span>{isQuickGuide ? "Contenido de la guía" : courseModule.title}</span>
        </nav>

        <div className="mt-10 grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-20">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  isQuickGuide
                    ? "bg-white/5 text-white/40"
                    : lesson.is_preview
                    ? "bg-red-500/10 text-red-200"
                    : "bg-white/5 text-white/40"
                }`}
              >
                {isQuickGuide
                  ? "Guía rápida"
                  : lesson.is_preview
                    ? "Lección gratuita"
                    : "Lección premium"}
              </span>
              {isAdmin && !isPublished && (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1.5 text-xs text-amber-200">
                  Vista de administrador · no publicada
                </span>
              )}
            </div>

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.25em] text-white/30">
              {isQuickGuide ? "Contenido de la guía" : courseModule.title}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
              {lesson.title}
            </h1>
            {lesson.duration_minutes !== null && (
              <p className="mt-5 text-sm text-white/35">
                {formatDuration(lesson.duration_minutes)}
              </p>
            )}

            {!isQuickGuide && feedback.enrolled === "1" && (
              <p className="mt-6 w-fit rounded-xl border border-green-500/20 bg-green-500/[0.06] px-4 py-3 text-sm text-green-200">
                Curso añadido a tu cuenta. Ya puedes comenzar la lección.
              </p>
            )}
          </div>
        </div>

        <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-x-20">
          <div className="contents lg:block">
            {canOpenLesson ? (
              <>
                <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                  <LessonVideoPlayer video={videoPresentation} />

                  <div className="p-6 sm:p-8">
                    <h2 className="text-xl font-semibold">
                      {isQuickGuide ? "Sobre este paso" : "Sobre esta lección"}
                    </h2>
                    <p className="mt-4 whitespace-pre-line leading-7 text-white/50">
                      {lesson.description ||
                        (isQuickGuide
                          ? "El contenido de este paso estará disponible aquí."
                          : "El contenido de esta lección estará disponible aquí.")}
                    </p>
                  </div>
                </section>

                {canTrackProgress && (
                  <div className="order-3 mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8 lg:order-none">
                    <LessonProgressControls
                      courseId={course.id}
                      lessonId={lesson.id}
                      courseSlug={course.slug}
                      lessonSlug={lesson.slug}
                      started={Boolean(progress)}
                      completed={Boolean(progress?.completed_at)}
                      nextLesson={
                        navigation.nextAccessible
                          ? {
                              href: `${coursePath}/lecciones/${navigation.nextAccessible.slug}`,
                              title: navigation.nextAccessible.title,
                            }
                          : null
                      }
                      courseHref={`${coursePath}#contenido`}
                    />
                  </div>
                )}

                {canTrackProgress && (
                  <section
                    aria-labelledby="plus-heading"
                    className="order-4 mt-8 rounded-2xl border border-red-400/20 bg-red-500/[0.035] p-6 sm:p-8 lg:order-none"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-200/70">
                      FILMATTA Plus
                    </p>
                    <h2 id="plus-heading" className="mt-3 text-2xl font-semibold">
                      {`Accede a este y todos los cursos de FILMATTA por solo $${FILMATTA_PLAN_PRICES.plus}/mes`}
                    </h2>
                    <p className="mt-3 max-w-2xl leading-7 text-white/50">
                      FILMATTA Plus incluye todos los cursos regulares de Learn y
                      herramientas premium para tu perfil profesional.
                    </p>
                    <p className="mt-3 text-sm text-white/35">
                      Las especialidades se venden por separado.
                    </p>
                    <Link
                      href="/planes#plus"
                      className="mt-6 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                    >
                      Ver FILMATTA Plus
                    </Link>
                  </section>
                )}
              </>
            ) : (
              <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                {!requiresEnrollment && (
                  <LockedVideoPoster
                    posterUrl={lockedPosterUrl}
                    title={lesson.title}
                  />
                )}

                <div className="p-8 sm:p-12">
                {!requiresEnrollment && (
                  <div className="mb-10 border-b border-white/10 pb-9">
                    <h2 className="text-xl font-semibold">
                      {isQuickGuide ? "Sobre este paso" : "Sobre esta lección"}
                    </h2>
                    <p className="mt-4 whitespace-pre-line leading-7 text-white/50">
                      {lesson.description ||
                        (isQuickGuide
                          ? "El contenido de este paso estará disponible aquí."
                          : "El contenido de esta lección estará disponible aquí.")}
                    </p>
                  </div>
                )}
                <span className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/35">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="size-5 fill-none stroke-current"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="5" y="10" width="14" height="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                <h2 className="mt-6 text-2xl font-semibold">
                  {isQuickGuide
                    ? "Guía bloqueada"
                    : requiresEnrollment
                      ? "Inscríbete al curso"
                      : "Lección bloqueada"}
                </h2>
                <p className="mt-3 max-w-xl leading-7 text-white/45">
                  {isQuickGuide
                    ? "Las guías rápidas regulares estarán disponibles con FILMATTA Plus. La inscripción a un curso no concede acceso a esta guía."
                    : requiresEnrollment
                      ? "Inscríbete al curso para ver esta lección gratuita y guardar tu progreso."
                      : "Esta es una lección premium. La inscripción guarda el curso en tu cuenta, pero no concede acceso de pago. Podrás abrirla cuando FILMATTA active los accesos y pagos."}
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  {requiresEnrollment ? (
                    <form
                      action={enrollInCourse.bind(
                        null,
                        course.id,
                        course.slug,
                        lessonPath
                      )}
                      className="w-full sm:w-auto"
                    >
                      <EnrollButton label="Inscribirme al curso" />
                    </form>
                  ) : null}
                  {!requiresEnrollment && (
                    <Link
                      href="/planes#plus"
                      className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      Ver FILMATTA Plus
                    </Link>
                  )}
                  <Link
                    href={`${coursePath}#contenido`}
                    className="px-2 py-3 text-sm font-medium text-white/45 transition hover:text-white"
                  >
                    {isQuickGuide ? "Volver a la guía" : "Volver al temario"}
                  </Link>
                </div>
                {requiresEnrollment && feedback.enrollment_error && (
                  <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
                    No pudimos completar la inscripción. Inténtalo de nuevo.
                  </p>
                )}
                </div>
              </section>
            )}
          </div>

          <aside className="order-2 h-fit border-t border-white/10 pt-6 lg:sticky lg:top-8 lg:order-none">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/30">
              Navegación
            </p>
            <div className="mt-5 space-y-3">
              {navigation.previous ? (
                <LessonNavigationLink
                  courseSlug={course.slug}
                  lesson={navigation.previous}
                  direction="Anterior"
                  isQuickGuide={isQuickGuide}
                />
              ) : (
                <NavigationBoundary
                  label={isQuickGuide ? "Primer paso" : "Primera lección"}
                />
              )}
              {navigation.next ? (
                <LessonNavigationLink
                  courseSlug={course.slug}
                  lesson={navigation.next}
                  direction="Siguiente"
                  isQuickGuide={isQuickGuide}
                />
              ) : (
                <NavigationBoundary
                  label={isQuickGuide ? "Último paso" : "Última lección"}
                />
              )}
            </div>
          </aside>
        </div>
      </article>
    </main>
  );
}

function LockedVideoPoster({
  posterUrl,
  title,
}: {
  posterUrl: string | null;
  title: string;
}) {
  return (
    <div
      role="img"
      aria-label={
        posterUrl
          ? `Vista previa del video de ${title}`
          : `Video premium de ${title}`
      }
      className="relative flex aspect-video items-center justify-center overflow-hidden bg-[#101010] bg-cover bg-center"
      style={posterUrl ? { backgroundImage: `url("${posterUrl}")` } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/20" />
      {!posterUrl && (
        <span className="relative flex size-16 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/45 backdrop-blur-sm">
          <LockIcon className="size-6" />
        </span>
      )}
      <span className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-xs font-medium text-white/75 backdrop-blur-sm">
        <LockIcon className="size-3.5" />
        Contenido premium
      </span>
    </div>
  );
}

function LockIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`${className} fill-none stroke-current`}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

async function getPublishedNavigation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courseId: string,
  currentLessonId: string
) {
  const [modulesResult, lessonsResult] = await Promise.all([
    supabase
      .from("course_modules")
      .select("id, title, sort_order")
      .eq("course_id", courseId)
      .eq("status", "published"),
    supabase
      .from("course_lessons")
      .select("id, module_id, title, slug, sort_order, is_preview")
      .eq("course_id", courseId)
      .eq("status", "published"),
  ]);

  if (modulesResult.error || lessonsResult.error) {
    console.error("Error cargando la navegación de la lección:", {
      modulesError: modulesResult.error,
      lessonsError: lessonsResult.error,
    });
    return { previous: null, next: null, nextAccessible: null };
  }

  const modules = (modulesResult.data ?? []) as SyllabusModule[];
  const lessons = (lessonsResult.data ?? []) as SyllabusLesson[];
  const modulePosition = new Map(
    modules.sort(compareOrder).map((courseModule, index) => [courseModule.id, index])
  );
  const syllabus = lessons
    .filter((item) => modulePosition.has(item.module_id))
    .sort((first, second) => {
      const moduleDifference =
        (modulePosition.get(first.module_id) ?? 0) -
        (modulePosition.get(second.module_id) ?? 0);
      return moduleDifference || compareOrder(first, second);
    });
  const currentIndex = syllabus.findIndex((item) => item.id === currentLessonId);

  if (currentIndex < 0) {
    return { previous: null, next: null, nextAccessible: null };
  }

  return {
    previous: syllabus[currentIndex - 1] ?? null,
    next: syllabus[currentIndex + 1] ?? null,
    nextAccessible:
      syllabus.slice(currentIndex + 1).find((item) => item.is_preview) ?? null,
  };
}

async function getEnrollment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  courseId: string
) {
  const { data, error } = await supabase
    .from("course_enrollments")
    .select("status, access_expires_at")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .in("status", ["active", "completed"])
    .or(
      `access_expires_at.is.null,access_expires_at.gt.${new Date().toISOString()}`
    )
    .maybeSingle();

  if (error) {
    console.error("Error cargando la inscripción de la lección:", error);
    return null;
  }

  return data;
}

async function getProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  courseId: string,
  lessonId: string
) {
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("started_at, completed_at, last_activity_at")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) {
    console.error("Error cargando el progreso de la lección:", error);
    return null;
  }

  return data;
}

function LessonNavigationLink({
  courseSlug,
  lesson,
  direction,
  isQuickGuide,
}: {
  courseSlug: string;
  lesson: SyllabusLesson;
  direction: "Anterior" | "Siguiente";
  isQuickGuide: boolean;
}) {
  return (
    <Link
      href={`/cursos/${courseSlug}/lecciones/${lesson.slug}`}
      className="block rounded-xl border border-white/10 p-4 transition hover:border-white/20 hover:bg-white/[0.03]"
    >
      <span className="text-[11px] uppercase tracking-[0.18em] text-white/25">
        {direction}
      </span>
      <span className="mt-2 block text-sm font-medium leading-5 text-white/70">
        {lesson.title}
      </span>
      <span className="mt-2 block text-xs text-white/30">
        {isQuickGuide
          ? "Paso de la guía"
          : lesson.is_preview
            ? "Lección gratuita"
            : "Lección premium · bloqueada"}
      </span>
    </Link>
  );
}

function NavigationBoundary({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] p-4 text-sm text-white/20">
      {label}
    </div>
  );
}

function compareOrder(
  first: { sort_order: number; id: string },
  second: { sort_order: number; id: string }
) {
  return first.sort_order - second.sort_order || first.id.localeCompare(second.id);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${remainingMinutes} min`;
}
