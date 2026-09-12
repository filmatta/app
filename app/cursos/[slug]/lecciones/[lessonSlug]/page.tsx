import Link from "next/link";
import { getBillingAccess } from "@/lib/billing/access";
import { canReadLesson } from "@/lib/billing/policy";
import { notFound, redirect } from "next/navigation";
import EnrollButton from "@/app/cursos/[slug]/EnrollButton";
import { enrollInCourse } from "@/app/cursos/[slug]/actions";
import LessonProgressControls from "@/app/cursos/[slug]/lecciones/[lessonSlug]/LessonProgressControls";
import AuthenticatedHeader from "@/components/student/AuthenticatedHeader";
import { getViewer } from "@/lib/auth/get-viewer";
import { getLearnContentType } from "@/lib/learn/content-type";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { presentVideo, presentVideoPoster } from "@/lib/mux/playback";
import LessonVideoPlayer, { type VideoPresentation } from "@/components/LessonVideoPlayer";
import ContextSidebar, {
  type ContextNextAction,
} from "@/components/student/ContextSidebar";
import StudentNavigationSidebar, {
  type StudentLessonState,
  type StudentNavigationModule,
} from "@/components/student/StudentNavigationSidebar";
import AuthenticatedWorkspaceLayout from "@/components/student/AuthenticatedWorkspaceLayout";
import { getContextualMessage } from "@/lib/contextual-assistance/get-contextual-message";
import { getLearnContextState } from "@/lib/contextual-assistance/rules";
import { getResumeActions, type ResumeAction } from "@/lib/learn/resume";

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

type LessonProgress = {
  lesson_id: string;
  started_at: string;
  completed_at: string | null;
  last_activity_at: string;
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

  if (!viewer) {
    redirect(`/acceso?next=${encodeURIComponent(lessonPath)}`);
  }

  const billing = await getBillingAccess();
  const regularAccess = billing.regularAccess && course.billing_access === "regular";
  const [navigation, enrollment] = await Promise.all([
    getPublishedNavigation(supabase, course.id, lesson.id, regularAccess),
    viewer && !isQuickGuide
      ? getEnrollment(supabase, viewer.id, course.id)
      : Promise.resolve(null),
  ]);
  const isEnrolled = !isQuickGuide && enrollment !== null;
  const canOpenLesson = canReadLesson({ authenticated: Boolean(viewer), admin: isAdmin,
    published: isPublished, quickGuide: isQuickGuide, enrolled: isEnrolled,
    preview: lesson.is_preview, regularAccess });
  const requiresEnrollment =
    Boolean(viewer) &&
    !isAdmin &&
    !isQuickGuide &&
    isPublished &&
    (lesson.is_preview || regularAccess) &&
    !isEnrolled;
  const canTrackProgress =
    Boolean(viewer) &&
    !isQuickGuide &&
    isEnrolled &&
    isPublished &&
    (lesson.is_preview || regularAccess);
  const lessonProgress =
    viewer && !isQuickGuide && isEnrolled
      ? await getCourseProgress(supabase, viewer.id, course.id)
      : [];
  const progressByLesson = new Map(
    lessonProgress.map((item) => [item.lesson_id, item])
  );
  const progress = progressByLesson.get(lesson.id) ?? null;

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

  const publishedLessons = navigation.syllabus;
  const completedLessons = publishedLessons.filter(
    (item) => Boolean(progressByLesson.get(item.id)?.completed_at)
  ).length;
  const totalLessons = publishedLessons.length;
  const progressPercentage = getProgressPercentage(completedLessons, totalLessons);
  const previewLessons = publishedLessons.filter((item) => item.is_preview);
  const completedPreviewLessons = previewLessons.filter(
    (item) => Boolean(progressByLesson.get(item.id)?.completed_at)
  ).length;
  const premiumLessons = publishedLessons.length - previewLessons.length;
  const latestActivityAt = lessonProgress
    .map((item) => item.last_activity_at)
    .sort((first, second) => Date.parse(second) - Date.parse(first))[0] ?? null;
  const contextualState = getLearnContextState({
    progressPercentage,
    completedPreviewLessons,
    previewLessons: previewLessons.length,
    premiumLessons,
    currentLessonLocked: !canOpenLesson && !requiresEnrollment,
    latestActivityAt,
    currentLessonStarted: Boolean(progress),
  });
  const dailySeed = new Date().toISOString().slice(0, 10);
  const contextualTip = getContextualMessage({
    vertical: "learn",
    state: contextualState,
    seed: `${viewer?.id ?? "visitor"}:${course.id}:${lesson.id}:${dailySeed}`,
  });
  const resumeActions =
    viewer && isEnrolled && !isQuickGuide
      ? await getResumeActions(viewer.id, [{ id: course.id, slug: course.slug }])
      : new Map<string, ResumeAction>();
  const resumeAction = resumeActions.get(course.id) ?? null;
  const syllabusHref = `${coursePath}#contenido`;
  const studentModules = buildStudentNavigationModules({
    modules: navigation.modules,
    lessons: navigation.syllabus,
    progressByLesson,
    coursePath,
    isAdmin,
    isQuickGuide,
    isEnrolled,
    regularAccess,
  });
  const nextAction = getContextNextAction({
    coursePath,
    syllabusHref,
    isAdmin,
    isQuickGuide,
    canOpenLesson,
    requiresEnrollment,
    nextLesson: navigation.next,
    nextAccessibleLesson: navigation.nextAccessible,
    resumeAction,
    currentLessonPath: lessonPath,
    currentLessonCompleted: Boolean(progress?.completed_at),
  });
  const studentNavigation = (
    <StudentNavigationSidebar
      courseTitle={course.title}
      courseHref={coursePath}
      syllabusHref={syllabusHref}
      continueHref={
        isAdmin && navigation.next
          ? `${coursePath}/lecciones/${navigation.next.slug}`
          : navigation.nextAccessible
          ? `${coursePath}/lecciones/${navigation.nextAccessible.slug}`
          : resumeAction?.kind === "lesson" && resumeAction.href !== lessonPath
            ? resumeAction.href
            : null
      }
      modules={studentModules}
      currentLessonId={lesson.id}
      isQuickGuide={isQuickGuide}
    />
  );

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <AuthenticatedHeader
        viewer={viewer}
        breadcrumbs={[
          { label: "Aprender", href: "/cursos" },
          { label: course.title, href: coursePath },
          {
            label: isQuickGuide ? "Pasos" : courseModule.title,
          },
        ]}
      />

      <AuthenticatedWorkspaceLayout
        navigation={studentNavigation}
        drawerLabel={isQuickGuide ? "Navegación de la guía" : "Navegación del curso"}
        intro={
          <div className="pb-1">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
                {isQuickGuide ? "Paso" : "Lección"}
              </p>
              {isAdmin && !isPublished && (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-1.5 text-xs text-amber-200">
                  Vista de administrador · no publicada
                </span>
              )}
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              {lesson.title}
            </h1>
            {!isQuickGuide && feedback.enrolled === "1" && (
              <p className="mt-4 w-fit rounded-lg border border-green-500/20 bg-green-500/[0.06] px-4 py-2.5 text-sm text-green-200">
                Curso añadido a tu cuenta. Ya puedes comenzar la lección.
              </p>
            )}
          </div>
        }
        context={
          <ContextSidebar
            percentage={progressPercentage}
            completedLessons={completedLessons}
            totalLessons={totalLessons}
            nextAction={nextAction}
            tip={contextualTip.text}
            pose={contextualTip.mattiPose ?? "neutral"}
            syllabusHref={syllabusHref}
            unitLabel={isQuickGuide ? "pasos" : "lecciones"}
            showMobileProgress={!canTrackProgress}
          />
        }
      >
        <article>
          <div>
            {canOpenLesson ? (
              <>
                <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
                  <LessonVideoPlayer video={videoPresentation} />
                  <LessonAbout
                    description={lesson.description}
                    durationMinutes={lesson.duration_minutes}
                    isQuickGuide={isQuickGuide}
                    isPreview={lesson.is_preview}
                    moduleTitle={courseModule.title}
                  />
                </section>

                {canTrackProgress && (
                  <div id="progreso-leccion" className="order-3 mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8 lg:order-none">
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

                {canTrackProgress && !regularAccess && (
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
              <section
                id="acceso-leccion"
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]"
              >
                <LockedVideoPoster
                  posterUrl={requiresEnrollment ? null : lockedPosterUrl}
                  title={lesson.title}
                  label={
                    requiresEnrollment
                      ? "Acceso con inscripción"
                      : "Contenido premium"
                  }
                />
                <LessonAbout
                  description={lesson.description}
                  durationMinutes={lesson.duration_minutes}
                  isQuickGuide={isQuickGuide}
                  isPreview={lesson.is_preview}
                  moduleTitle={courseModule.title}
                />

                <div className="border-t border-white/10 p-6 sm:p-8">
                  <span className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/35">
                    <LockIcon className="size-5" />
                  </span>
                  <h2 className="mt-5 text-2xl font-semibold">
                    {isQuickGuide
                      ? "Guía bloqueada"
                      : requiresEnrollment
                        ? "Inscríbete al curso"
                        : "Lección bloqueada"}
                  </h2>
                  <p className="mt-3 max-w-2xl leading-7 text-white/45">
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
        </article>
      </AuthenticatedWorkspaceLayout>
    </div>
  );
}

function LockedVideoPoster({
  posterUrl,
  title,
  label,
}: {
  posterUrl: string | null;
  title: string;
  label: string;
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
        {label}
      </span>
    </div>
  );
}

function LessonAbout({
  description,
  durationMinutes,
  isQuickGuide,
  isPreview,
  moduleTitle,
}: {
  description: string | null;
  durationMinutes: number | null;
  isQuickGuide: boolean;
  isPreview: boolean;
  moduleTitle: string;
}) {
  return (
    <div className="grid gap-8 border-t border-white/10 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_13rem]">
      <div>
        <h2 className="text-xl font-semibold">
          {isQuickGuide ? "Sobre este paso" : "Sobre esta lección"}
        </h2>
        <p className="mt-4 whitespace-pre-line leading-7 text-white/50">
          {description ||
            (isQuickGuide
              ? "El contenido de este paso estará disponible aquí."
              : "El contenido de esta lección estará disponible aquí.")}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-5 border-t border-white/10 pt-6 text-sm sm:grid-cols-3 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
        <LessonMetadata label="Duración">
          {durationMinutes === null ? "Por definir" : formatDuration(durationMinutes)}
        </LessonMetadata>
        <LessonMetadata label="Tipo">
          {isQuickGuide ? "Guía rápida" : isPreview ? "Gratuita" : "Premium"}
        </LessonMetadata>
        {!isQuickGuide && (
          <LessonMetadata label="Módulo">{moduleTitle}</LessonMetadata>
        )}
      </dl>
    </div>
  );
}

function LessonMetadata({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/25">
        {label}
      </dt>
      <dd className="mt-1.5 leading-5 text-white/60">{children}</dd>
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
  currentLessonId: string,
  regularAccess: boolean
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
    return {
      modules: [] as SyllabusModule[],
      syllabus: [] as SyllabusLesson[],
      previous: null,
      next: null,
      nextAccessible: null,
    };
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
    return {
      modules,
      syllabus,
      previous: null,
      next: null,
      nextAccessible: null,
    };
  }

  return {
    modules,
    syllabus,
    previous: syllabus[currentIndex - 1] ?? null,
    next: syllabus[currentIndex + 1] ?? null,
    nextAccessible:
      syllabus.slice(currentIndex + 1).find((item) => item.is_preview || regularAccess) ?? null,
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

async function getCourseProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  courseId: string
) {
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_id, started_at, completed_at, last_activity_at")
    .eq("user_id", userId)
    .eq("course_id", courseId);

  if (error) {
    console.error("Error cargando el progreso del curso:", error);
    return [] as LessonProgress[];
  }

  return (data ?? []) as LessonProgress[];
}

function buildStudentNavigationModules({
  modules,
  lessons,
  progressByLesson,
  coursePath,
  isAdmin,
  isQuickGuide,
  isEnrolled,
  regularAccess,
}: {
  modules: SyllabusModule[];
  lessons: SyllabusLesson[];
  progressByLesson: Map<string, LessonProgress>;
  coursePath: string;
  isAdmin: boolean;
  isQuickGuide: boolean;
  isEnrolled: boolean;
  regularAccess: boolean;
}): StudentNavigationModule[] {
  return modules.map((courseModule) => {
    const moduleLessons = lessons.filter(
      (lesson) => lesson.module_id === courseModule.id
    );
    const completedLessons = moduleLessons.filter((lesson) =>
      Boolean(progressByLesson.get(lesson.id)?.completed_at)
    ).length;

    return {
      id: courseModule.id,
      title: courseModule.title,
      href: `${coursePath}#modulo-${courseModule.id}`,
      completedLessons,
      totalLessons: moduleLessons.length,
      progressPercentage: getProgressPercentage(
        completedLessons,
        moduleLessons.length
      ),
      lessons: moduleLessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        href: `${coursePath}/lecciones/${lesson.slug}`,
        state: getStudentLessonState({
          lesson,
          progress: progressByLesson.get(lesson.id),
          isAdmin,
          isQuickGuide,
          isEnrolled,
          regularAccess,
        }),
      })),
    };
  });
}

function getStudentLessonState({
  lesson,
  progress,
  isAdmin,
  isQuickGuide,
  isEnrolled,
  regularAccess,
}: {
  lesson: SyllabusLesson;
  progress?: LessonProgress;
  isAdmin: boolean;
  isQuickGuide: boolean;
  isEnrolled: boolean;
  regularAccess: boolean;
}): StudentLessonState {
  if (!canReadLesson({ authenticated: true, admin: isAdmin, published: true,
    quickGuide: isQuickGuide, enrolled: isEnrolled, preview: lesson.is_preview, regularAccess })) {
    return "locked";
  }
  if (progress?.completed_at) return "completed";
  if (progress) return "in-progress";
  return "not-started";
}

function getContextNextAction({
  coursePath,
  syllabusHref,
  isAdmin,
  isQuickGuide,
  canOpenLesson,
  requiresEnrollment,
  nextLesson,
  nextAccessibleLesson,
  resumeAction,
  currentLessonPath,
  currentLessonCompleted,
}: {
  coursePath: string;
  syllabusHref: string;
  isAdmin: boolean;
  isQuickGuide: boolean;
  canOpenLesson: boolean;
  requiresEnrollment: boolean;
  nextLesson: SyllabusLesson | null;
  nextAccessibleLesson: SyllabusLesson | null;
  resumeAction: ResumeAction | null;
  currentLessonPath: string;
  currentLessonCompleted: boolean;
}): ContextNextAction {
  if (requiresEnrollment) {
    return {
      title: "Inscríbete para comenzar",
      description: "La inscripción gratuita habilita esta lección y su progreso.",
      href: "#acceso-leccion",
      label: "Ver acceso",
    };
  }

  if (!canOpenLesson && !isAdmin) {
    return {
      title: isQuickGuide ? "Continúa con Plus" : "Contenido premium",
      description: isQuickGuide
        ? "Las guías rápidas regulares forman parte de FILMATTA Plus."
        : "La reproducción de esta lección forma parte de FILMATTA Plus.",
      href: "/planes#plus",
      label: "Ver FILMATTA Plus",
      commercial: true,
    };
  }

  if (isAdmin && nextLesson) {
    return {
      title: nextLesson.title,
      description: isQuickGuide ? "Siguiente paso de la guía." : "Siguiente lección del curso.",
      href: `${coursePath}/lecciones/${nextLesson.slug}`,
      label: "Continuar",
    };
  }

  if (canOpenLesson && nextAccessibleLesson) {
    return {
      title: nextAccessibleLesson.title,
      description: "Siguiente lección accesible del curso.",
      href: `${coursePath}/lecciones/${nextAccessibleLesson.slug}`,
      label: "Continuar",
    };
  }

  if (canOpenLesson && isQuickGuide) {
    return { title: "Revisa la guía", description: "Vuelve al contenido de la guía.", href: syllabusHref, label: "Ver guía" };
  }

  if (canOpenLesson && !currentLessonCompleted) {
    return {
      title: "Termina esta lección",
      description: "Marca la lección como completada cuando termines el contenido.",
      href: "#progreso-leccion",
      label: "Ir al progreso",
    };
  }

  if (
    resumeAction?.kind === "lesson" &&
    resumeAction.href !== currentLessonPath
  ) {
    return {
      title: "Continúa donde lo dejaste",
      description: "La siguiente lección accesible está lista.",
      href: resumeAction.href,
      label: "Continuar",
    };
  }

  if (resumeAction?.kind === "plus") {
    return {
      title: "Ya terminaste las lecciones gratuitas",
      description: "Continúa el curso completo con FILMATTA Plus.",
      href: resumeAction.href,
      label: resumeAction.label,
      commercial: true,
    };
  }

  if (resumeAction?.kind === "completed") {
    return {
      title: "Curso completado",
      description: "Puedes volver al temario y repasar cualquier lección.",
      href: resumeAction.href,
      label: resumeAction.label,
    };
  }

  return {
    title: "Revisa el curso",
    description: "Consulta el temario y el contexto de cada lección.",
    href: syllabusHref,
    label: "Ver temario",
  };
}

function getProgressPercentage(completedLessons: number, totalLessons: number) {
  return totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;
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
