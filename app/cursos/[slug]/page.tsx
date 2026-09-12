import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import EnrollButton from "@/app/cursos/[slug]/EnrollButton";
import { enrollInCourse } from "@/app/cursos/[slug]/actions";
import SiteHeader from "@/components/SiteHeader";
import AuthenticatedHeader from "@/components/student/AuthenticatedHeader";
import AuthenticatedWorkspaceLayout from "@/components/student/AuthenticatedWorkspaceLayout";
import StudentNavigationSidebar, {
  type StudentLessonState,
  type StudentNavigationModule,
} from "@/components/student/StudentNavigationSidebar";
import { getViewer } from "@/lib/auth/get-viewer";
import { getLearnContentType } from "@/lib/learn/content-type";
import { getResumeActions, type ResumeAction } from "@/lib/learn/resume";
import { FILMATTA_PLAN_PRICES } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

type CoursePageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    enrolled?: string;
    enrollment_error?: string;
  }>;
};

type CourseFeedback = {
  enrolled?: string;
  enrollment_error?: string;
};

type CurriculumLesson = {
  id: string;
  module_id: string;
  title: string;
  slug: string;
  duration_minutes: number | null;
  sort_order: number;
  is_preview: boolean;
};

type CurriculumModule = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  lessons: CurriculumLesson[];
};

type LessonProgressSummary = {
  lesson_id: string;
  started_at: string | null;
  completed_at: string | null;
};

const getPublishedCourse = cache(async (slug: string) => {
  const supabase = await createClient();

  const { data: course, error } = await supabase
    .from("courses")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("Error cargando el curso público:", error);
    return null;
  }

  return course;
});

const getPublishedCurriculum = cache(async (courseId: string) => {
  const supabase = await createClient();

  const [modulesResult, lessonsResult] = await Promise.all([
    supabase
      .from("course_modules")
      .select("id, title, description, sort_order")
      .eq("course_id", courseId)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("course_lessons")
      .select("id, module_id, title, slug, duration_minutes, sort_order, is_preview")
      .eq("course_id", courseId)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (modulesResult.error || lessonsResult.error) {
    console.error("Error cargando el temario público:", {
      modulesError: modulesResult.error,
      lessonsError: lessonsResult.error,
    });

    return {
      modules: [] as CurriculumModule[],
      error: true,
    };
  }

  const lessonsByModule = new Map<string, CurriculumLesson[]>();

  for (const lesson of lessonsResult.data ?? []) {
    const moduleLessons = lessonsByModule.get(lesson.module_id) ?? [];
    moduleLessons.push(lesson);
    lessonsByModule.set(lesson.module_id, moduleLessons);
  }

  const modules = (modulesResult.data ?? [])
    .map((courseModule) => ({
      ...courseModule,
      lessons: lessonsByModule.get(courseModule.id) ?? [],
    }))
    .filter((courseModule) => courseModule.lessons.length > 0);

  return {
    modules,
    error: false,
  };
});

const getEnrollment = cache(async (userId: string, courseId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_enrollments")
    .select("status, access_expires_at")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) {
    console.error("Error cargando la inscripción del curso:", error);
    return null;
  }

  return data;
});

async function getCourseProgress(userId: string, courseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("lesson_id, started_at, completed_at")
    .eq("user_id", userId)
    .eq("course_id", courseId);

  if (error) {
    console.error("Error cargando el progreso del curso:", error);
    return [] as LessonProgressSummary[];
  }

  return (data ?? []) as LessonProgressSummary[];
}

export async function generateMetadata({
  params,
}: CoursePageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublishedCourse(slug);

  if (!course) {
    return {
      title: "Curso no encontrado",
      robots: { index: false, follow: false },
    };
  }

  const description =
    course.short_description ||
    course.description ||
    `Descubre ${course.title} en FILMATTA.`;

  return {
    title: course.title,
    description,
    openGraph: {
      title: course.title,
      description,
      type: "website",
      images: course.cover_image_url
        ? [{ url: course.cover_image_url, alt: course.title }]
        : undefined,
    },
  };
}

export default async function CursoPage({
  params,
  searchParams,
}: CoursePageProps) {
  const { slug } = await params;
  const course = await getPublishedCourse(slug);

  if (!course) {
    notFound();
  }

  const viewer = await getViewer();
  const isQuickGuide = getLearnContentType(course) === "quick_guide";
  const [curriculum, enrollment, feedback] = await Promise.all([
    getPublishedCurriculum(course.id),
    viewer && !isQuickGuide
      ? getEnrollment(viewer.id, course.id)
      : Promise.resolve(null),
    searchParams ?? Promise.resolve<CourseFeedback>({}),
  ]);
  const isEnrolled =
    enrollment?.status === "active" || enrollment?.status === "completed";
  const enrollmentNeedsReview =
    enrollment?.status === "cancelled" || enrollment?.status === "expired";
  const [resumeActions, lessonProgress] =
    viewer && isEnrolled
      ? await Promise.all([
          getResumeActions(viewer.id, [{ id: course.id, slug: course.slug }]),
          getCourseProgress(viewer.id, course.id),
        ])
      : [new Map<string, ResumeAction>(), [] as LessonProgressSummary[]];
  const resumeAction = resumeActions.get(course.id) ?? {
    kind: "fallback",
    href: `/cursos/${course.slug}`,
    label: "Ver curso",
  } satisfies ResumeAction;
  const totalModules = curriculum.modules.length;
  const publishedLessons = curriculum.modules.flatMap(
    (courseModule) => courseModule.lessons
  );
  const totalLessons = publishedLessons.length;
  const firstLessonPath = publishedLessons[0]
    ? `/cursos/${course.slug}/lecciones/${publishedLessons[0].slug}`
    : `/cursos/${course.slug}`;
  const quickGuideAction = {
    href: viewer
      ? viewer.role === "admin"
        ? firstLessonPath
        : "/planes#plus"
      : `/acceso?next=${encodeURIComponent(firstLessonPath)}`,
    label: viewer && viewer.role !== "admin" ? "Ver FILMATTA Plus" : "Abrir guía",
  };
  const progressByLesson = new Map(
    lessonProgress.map((progress) => [progress.lesson_id, progress])
  );
  const completedLessons = publishedLessons.filter(
    (lesson) => progressByLesson.get(lesson.id)?.completed_at
  ).length;
  const courseProgressPercentage = getProgressPercentage(
    completedLessons,
    totalLessons
  );
  const curriculumDuration = getCompleteDuration(publishedLessons);
  const displayedDuration =
    curriculumDuration ?? course.duration_minutes ?? null;

  const details = [
    course.category && { label: "Categoría", value: course.category },
    course.level && { label: "Nivel", value: course.level },
    totalModules > 0 && {
      label: "Contenido",
      value: isQuickGuide
        ? formatCount(totalLessons, "paso", "pasos")
        : `${formatCount(totalModules, "módulo", "módulos")} · ${formatCount(
            totalLessons,
            "lección",
            "lecciones"
          )}`,
    },
    displayedDuration !== null && {
      label: "Duración",
      value: formatDuration(displayedDuration),
    },
    course.instructor && { label: "Instructor", value: course.instructor },
  ].filter((detail): detail is { label: string; value: string } =>
    Boolean(detail)
  );
  const coursePath = `/cursos/${course.slug}`;
  const courseNavigationModules = buildCourseNavigationModules({
    modules: curriculum.modules,
    progressByLesson,
    coursePath,
    isAdmin: viewer?.role === "admin",
    isQuickGuide,
    isEnrolled,
  });
  const courseNavigation = viewer ? (
    <StudentNavigationSidebar
      courseTitle={course.title}
      courseHref={coursePath}
      syllabusHref={`${coursePath}#contenido`}
      continueHref={
        resumeAction.kind === "lesson"
          ? resumeAction.href
          : viewer.role === "admin" && publishedLessons[0]
            ? `${coursePath}/lecciones/${publishedLessons[0].slug}`
            : null
      }
      modules={courseNavigationModules}
      currentLessonId={null}
      isQuickGuide={isQuickGuide}
    />
  ) : null;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {viewer ? (
        <AuthenticatedHeader
          viewer={viewer}
          breadcrumbs={[
            { label: "Aprender", href: "/cursos" },
            { label: course.title },
          ]}
        />
      ) : (
        <SiteHeader contextLink={{ href: "/cursos", label: "← Aprender" }} />
      )}

      <AuthenticatedWorkspaceLayout
        navigation={courseNavigation}
        drawerLabel={isQuickGuide ? "Navegación de la guía" : "Navegación del curso"}
      >
      <article>
        <div className="mx-auto max-w-7xl px-6 pb-20 pt-12 lg:px-8 lg:pb-28 lg:pt-16">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-white/[0.04]">
            {course.cover_image_url ? (
              <img
                src={course.cover_image_url}
                alt={`Portada de ${course.title}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-semibold uppercase tracking-[0.35em] text-white/15">
                FILMATTA
              </div>
            )}

            {course.featured && (
              <span className="absolute right-5 top-5 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs font-medium backdrop-blur-sm">
                Destacado
              </span>
            )}
          </div>

          <div className="grid gap-14 pt-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-24 lg:pt-20">
            <div>
              {course.category && (
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/40">
                  {course.category}
                </p>
              )}

              <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
                {course.title}
              </h1>

              {course.short_description && (
                <p className="mt-8 max-w-3xl text-xl leading-8 text-white/60 sm:text-2xl sm:leading-9">
                  {course.short_description}
                </p>
              )}

              {course.description && (
                <div className="mt-14 border-t border-white/10 pt-10">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/35">
                    {isQuickGuide ? "Sobre la guía" : "Sobre el curso"}
                  </h2>
                  <p className="mt-6 max-w-3xl whitespace-pre-line text-lg leading-8 text-white/60">
                    {course.description}
                  </p>
                </div>
              )}
            </div>

            <aside
              id="course-decision"
              className="h-fit rounded-2xl border border-white/10 bg-white/[0.025] p-6 lg:sticky lg:top-8 lg:p-7"
            >
              <div className="border-b border-white/10 pb-7">
                {isQuickGuide && totalLessons === 0 ? (
                  <div>
                    <p className="text-lg font-semibold">Contenido próximamente</p>
                    <p className="mt-3 text-sm leading-6 text-white/45">
                      Esta guía todavía no tiene pasos disponibles.
                    </p>
                    <Link
                      href="/cursos"
                      className="mt-5 inline-flex items-center text-sm font-semibold text-white/65 transition hover:text-white"
                    >
                      Explorar Aprender →
                    </Link>
                  </div>
                ) : isQuickGuide ? (
                  <Link
                    href={quickGuideAction.href}
                    className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  >
                    {quickGuideAction.label}
                  </Link>
                ) : isEnrolled && resumeAction.kind === "empty" ? (
                  <div>
                    <p className="text-lg font-semibold">Contenido próximamente</p>
                    <p className="mt-3 text-sm leading-6 text-white/45">
                      Este curso todavía no tiene lecciones disponibles.
                    </p>
                    <Link
                      href="/cursos"
                      className="mt-5 inline-flex items-center text-sm font-semibold text-white/65 transition hover:text-white"
                    >
                      Explorar Aprender →
                    </Link>
                  </div>
                ) : isEnrolled && resumeAction.kind === "fallback" ? (
                  <div>
                    <p className="text-lg font-semibold">Curso disponible</p>
                    <p className="mt-3 text-sm leading-6 text-white/45">
                      No pudimos determinar dónde continuar en este momento.
                    </p>
                    <Link
                      href="/cursos"
                      className="mt-5 inline-flex items-center text-sm font-semibold text-white/65 transition hover:text-white"
                    >
                      Explorar Aprender →
                    </Link>
                  </div>
                ) : isEnrolled ? (
                  <Link
                    href={resumeAction.href}
                    className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  >
                    {resumeAction.label}
                  </Link>
                ) : enrollmentNeedsReview ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-full bg-white/10 px-6 py-4 font-semibold text-white/40"
                  >
                    Inscripción no disponible
                  </button>
                ) : viewer ? (
                  <form
                    action={enrollInCourse.bind(
                      null,
                      course.id,
                      course.slug,
                      `/cursos/${course.slug}#course-decision`
                    )}
                  >
                    <EnrollButton />
                  </form>
                ) : (
                  <Link
                    href={`/acceso?next=${encodeURIComponent(`/cursos/${course.slug}#course-decision`)}`}
                    className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-4 font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                  >
                    Tomar curso
                  </Link>
                )}

                {isQuickGuide && totalLessons > 0 ? (
                  <p className="mt-4 text-center text-xs leading-5 text-white/35">
                    {viewer?.role === "admin"
                      ? "Vista administrativa de la guía."
                      : viewer
                        ? "Las guías rápidas regulares estarán disponibles con FILMATTA Plus."
                        : "Inicia sesión o crea una cuenta para continuar."}
                  </p>
                ) : (!isEnrolled ||
                    (resumeAction.kind !== "empty" &&
                      resumeAction.kind !== "fallback")) && (
                  <p className="mt-4 text-center text-xs leading-5 text-white/35">
                    {resumeAction.kind === "plus"
                      ? `Ya terminaste las lecciones gratuitas. Accede al curso completo desde $${FILMATTA_PLAN_PRICES.plus}/mes.`
                      : isEnrolled
                        ? "Este curso ya está en Mis cursos."
                        : enrollmentNeedsReview
                          ? "Esta inscripción requiere revisión del equipo de FILMATTA."
                          : "Guárdalo en Mis cursos. No se realizará ningún cobro."}
                  </p>
                )}

                {!isQuickGuide && feedback.enrolled === "1" && (
                  <p className="mt-4 rounded-xl border border-green-500/20 bg-green-500/[0.06] px-4 py-3 text-sm text-green-200">
                    Curso añadido a tu cuenta.
                  </p>
                )}

                {!isQuickGuide && feedback.enrollment_error && (
                  <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
                    No pudimos completar la inscripción. Inténtalo de nuevo.
                  </p>
                )}
              </div>

              {details.length > 0 && (
                <dl className="mt-7 space-y-7">
                  {details.map((detail) => (
                    <div key={detail.label}>
                      <dt className="text-xs uppercase tracking-[0.2em] text-white/30">
                        {detail.label}
                      </dt>
                      <dd className="mt-2 text-base text-white/75">
                        {detail.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </aside>
          </div>

          <section
            id="contenido"
            aria-labelledby="curriculum-heading"
            className="mt-24 border-t border-white/10 pt-14 lg:mt-32 lg:pt-20"
          >
            <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/35">
                  {isQuickGuide ? "Guía rápida" : "Temario"}
                </p>
                <h2
                  id="curriculum-heading"
                  className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl"
                >
                  {isQuickGuide ? "Contenido de la guía" : "Contenido del curso"}
                </h2>
              </div>

              {totalModules > 0 && (
                <div className="max-w-md md:text-right">
                  <p className="text-sm leading-6 text-white/40">
                    {isQuickGuide ? (
                      formatCount(totalLessons, "paso", "pasos")
                    ) : (
                      <>
                        {formatCount(totalModules, "módulo", "módulos")} ·{" "}
                        {formatCount(totalLessons, "lección", "lecciones")}
                      </>
                    )}
                    {curriculumDuration !== null && (
                      <> · {formatDuration(curriculumDuration)}</>
                    )}
                  </p>
                  {isEnrolled && (
                    <div className="mt-3 flex md:justify-end">
                      <ProgressBadge percentage={courseProgressPercentage} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {curriculum.error ? (
              <div className="mt-12 border-y border-white/10 py-10 text-white/45">
                No pudimos cargar el temario en este momento. Inténtalo de nuevo
                más tarde.
              </div>
            ) : curriculum.modules.length > 0 ? (
              <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
                {curriculum.modules.map((courseModule, moduleIndex) => {
                  const moduleDuration = getCompleteDuration(
                    courseModule.lessons
                  );
                  const moduleCompletedLessons = courseModule.lessons.filter(
                    (lesson) => progressByLesson.get(lesson.id)?.completed_at
                  ).length;
                  const moduleProgressPercentage = getProgressPercentage(
                    moduleCompletedLessons,
                    courseModule.lessons.length
                  );

                  return (
                    <article
                      key={courseModule.id}
                      id={`modulo-${courseModule.id}`}
                      className="grid gap-8 py-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14 lg:py-14"
                    >
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/30">
                          {isQuickGuide
                            ? "Pasos"
                            : `Módulo ${String(moduleIndex + 1).padStart(2, "0")}`}
                        </p>

                        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/35">
                          <span>
                            {formatCount(
                              courseModule.lessons.length,
                              isQuickGuide ? "paso" : "lección",
                              isQuickGuide ? "pasos" : "lecciones"
                            )}
                          </span>
                          {moduleDuration !== null && moduleDuration > 0 && (
                            <span>{formatDuration(moduleDuration)}</span>
                          )}
                        </div>
                        {isEnrolled && (
                          <div className="mt-4">
                            <ProgressBadge
                              percentage={moduleProgressPercentage}
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        {!isQuickGuide && (
                          <h3 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                            {courseModule.title}
                          </h3>
                        )}

                        {!isQuickGuide && courseModule.description && (
                          <p className="mt-4 max-w-3xl whitespace-pre-line leading-7 text-white/45">
                            {courseModule.description}
                          </p>
                        )}

                        <ol className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.015]">
                          {courseModule.lessons.map((lesson, lessonIndex) => {
                            const lessonHref = getLessonHref(
                              course.slug,
                              lesson.slug,
                              Boolean(viewer)
                            );
                            const lessonProgressStatus = getLessonProgressStatus(
                              progressByLesson.get(lesson.id)
                            );

                            return (
                              <li
                                key={lesson.id}
                                className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                              >
                                <div className="flex min-w-0 items-center gap-4">
                                  <Link
                                    href={lessonHref}
                                    aria-label={`${isQuickGuide ? "Abrir paso" : "Abrir lección"} ${lessonIndex + 1}: ${lesson.title}`}
                                    className="shrink-0 cursor-pointer rounded-full transition hover:scale-105 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                                  >
                                    <AccessIcon
                                      preview={
                                        isQuickGuide
                                          ? viewer?.role === "admin"
                                          : lesson.is_preview
                                      }
                                    />
                                  </Link>

                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/25">
                                      {isQuickGuide ? "Paso" : "Lección"}{" "}
                                      {String(lessonIndex + 1).padStart(2, "0")}
                                    </p>
                                    <Link
                                      href={lessonHref}
                                      className="mt-1 block font-medium text-white/80 transition hover:text-white"
                                    >
                                      {lesson.title}
                                    </Link>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center justify-between gap-4 pl-12 sm:justify-end sm:pl-0">
                                  {isEnrolled && (
                                    <LessonProgressBadge
                                      status={lessonProgressStatus}
                                    />
                                  )}
                                  <span className="text-sm text-white/35">
                                    {lesson.duration_minutes !== null
                                      ? formatDuration(lesson.duration_minutes)
                                      : "Por definir"}
                                  </span>

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
                                      ? "FILMATTA Plus"
                                      : lesson.is_preview
                                        ? "Lección gratuita"
                                        : "Lección premium"}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </article>
                  );
                })}
                <div className="flex flex-col gap-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:py-12">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/30">
                      {isQuickGuide ? "Guía rápida" : "Tu recorrido"}
                    </p>
                    {isQuickGuide ? (
                      <>
                        <p className="mt-2 text-lg font-semibold text-white/85">
                          Accede a esta guía con FILMATTA Plus
                        </p>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
                          Tutoriales breves para resolver tareas concretas de tu trabajo creativo.
                        </p>
                      </>
                    ) : resumeAction.kind === "plus" ? (
                      <>
                        <p className="mt-2 text-lg font-semibold text-white/85">
                          Ya terminaste las lecciones gratuitas.
                        </p>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
                          {`Continúa este curso y accede a todos los cursos regulares desde $${FILMATTA_PLAN_PRICES.plus}/mes.`}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
                        {resumeAction.kind === "completed"
                          ? "Completaste todas las lecciones publicadas de este curso."
                          : isEnrolled
                            ? "Retoma el curso desde tu siguiente lección disponible."
                            : "Inscríbete para comenzar y guardar tu progreso."}
                      </p>
                    )}
                  </div>

                  {isQuickGuide ? (
                    <Link
                      href={quickGuideAction.href}
                      className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                    >
                      {quickGuideAction.label}
                    </Link>
                  ) : isEnrolled ? (
                    <Link
                      href={resumeAction.href}
                      className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                    >
                      {resumeAction.label}
                    </Link>
                  ) : enrollmentNeedsReview ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-white/10 px-6 py-3.5 text-sm font-semibold text-white/40"
                    >
                      Inscripción no disponible
                    </button>
                  ) : viewer ? (
                    <form
                      action={enrollInCourse.bind(
                        null,
                        course.id,
                        course.slug,
                        `/cursos/${course.slug}#contenido`
                      )}
                      className="shrink-0"
                    >
                      <EnrollButton label="Inscribirme al curso" />
                    </form>
                  ) : (
                    <Link
                      href={`/acceso?next=${encodeURIComponent(`/cursos/${course.slug}#course-decision`)}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                    >
                      Tomar curso
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-12 border-y border-white/10 py-10">
                <p className="text-lg font-semibold text-white/75">
                  Contenido próximamente
                </p>
                <p className="mt-2 text-sm text-white/35">
                  {isQuickGuide
                    ? "Esta guía todavía no tiene pasos disponibles."
                    : "Este curso todavía no tiene lecciones disponibles."}
                </p>
                <Link
                  href="/cursos"
                  className="mt-6 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                >
                  Explorar Aprender
                </Link>
              </div>
            )}
          </section>
        </div>
      </article>
      </AuthenticatedWorkspaceLayout>
    </div>
  );
}

function buildCourseNavigationModules({
  modules,
  progressByLesson,
  coursePath,
  isAdmin,
  isQuickGuide,
  isEnrolled,
}: {
  modules: CurriculumModule[];
  progressByLesson: Map<string, LessonProgressSummary>;
  coursePath: string;
  isAdmin: boolean;
  isQuickGuide: boolean;
  isEnrolled: boolean;
}): StudentNavigationModule[] {
  return modules.map((courseModule) => {
    const completedLessons = courseModule.lessons.filter((lesson) =>
      Boolean(progressByLesson.get(lesson.id)?.completed_at)
    ).length;

    return {
      id: courseModule.id,
      title: courseModule.title,
      href: `${coursePath}#modulo-${courseModule.id}`,
      completedLessons,
      totalLessons: courseModule.lessons.length,
      progressPercentage: getProgressPercentage(
        completedLessons,
        courseModule.lessons.length
      ),
      lessons: courseModule.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        href: `${coursePath}/lecciones/${lesson.slug}`,
        state: getCourseNavigationLessonState({
          lesson,
          progress: progressByLesson.get(lesson.id),
          isAdmin,
          isQuickGuide,
          isEnrolled,
        }),
      })),
    };
  });
}

function getCourseNavigationLessonState({
  lesson,
  progress,
  isAdmin,
  isQuickGuide,
  isEnrolled,
}: {
  lesson: CurriculumLesson;
  progress?: LessonProgressSummary;
  isAdmin: boolean;
  isQuickGuide: boolean;
  isEnrolled: boolean;
}): StudentLessonState {
  if (!isAdmin && (isQuickGuide || !isEnrolled || !lesson.is_preview)) {
    return "locked";
  }
  if (progress?.completed_at) return "completed";
  if (progress?.started_at) return "in-progress";
  return "not-started";
}

function getLessonHref(
  courseSlug: string,
  lessonSlug: string,
  isAuthenticated: boolean
) {
  const lessonPath = `/cursos/${courseSlug}/lecciones/${lessonSlug}`;

  if (!isAuthenticated) {
    return `/acceso?next=${encodeURIComponent(lessonPath)}`;
  }

  return lessonPath;
}

function getCompleteDuration(lessons: CurriculumLesson[]) {
  if (
    lessons.length === 0 ||
    lessons.some((lesson) => lesson.duration_minutes === null)
  ) {
    return null;
  }

  return lessons.reduce(
    (total, lesson) => total + (lesson.duration_minutes ?? 0),
    0
  );
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getProgressPercentage(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

function getLessonProgressStatus(progress?: LessonProgressSummary) {
  if (!progress) {
    return "not-started" as const;
  }

  return progress.completed_at ? ("completed" as const) : ("in-progress" as const);
}

function ProgressBadge({ percentage }: { percentage: number }) {
  const completed = percentage === 100;

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${
        completed
          ? "bg-emerald-400/15 text-emerald-200"
          : "bg-amber-400/15 text-amber-200"
      }`}
    >
      {completed ? "Completado" : `Avance: ${percentage}%`}
    </span>
  );
}

function LessonProgressBadge({
  status,
}: {
  status: "not-started" | "in-progress" | "completed";
}) {
  const presentation = {
    "not-started": {
      label: "No iniciado",
      className: "bg-white/[0.06] text-white/40",
    },
    "in-progress": {
      label: "En progreso",
      className: "bg-amber-400/15 text-amber-200",
    },
    completed: {
      label: "Completado",
      className: "bg-emerald-400/15 text-emerald-200",
    },
  }[status];

  return (
    <span
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${presentation.className}`}
    >
      {presentation.label}
    </span>
  );
}

function AccessIcon({ preview }: { preview: boolean }) {
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${
        preview
          ? "border-red-400/25 bg-red-500/10 text-red-200"
          : "border-white/10 bg-white/[0.03] text-white/30"
      }`}
      aria-hidden="true"
    >
      {preview ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-3.5 fill-current"
        >
          <path d="M8 5.5v13l10-6.5L8 5.5Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-3.5 fill-none stroke-current"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      )}
    </span>
  );
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
