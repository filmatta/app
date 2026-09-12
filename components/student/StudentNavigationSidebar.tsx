import Link from "next/link";
import AppNavigationSidebar, {
  WorkspaceNavigationGroup,
  WorkspaceNavigationLink,
} from "./AppNavigationSidebar";

export type StudentLessonState =
  | "not-started"
  | "in-progress"
  | "completed"
  | "locked";

export type StudentNavigationModule = {
  id: string;
  title: string;
  href: string;
  progressPercentage: number;
  completedLessons: number;
  totalLessons: number;
  lessons: Array<{
    id: string;
    title: string;
    href: string;
    state: StudentLessonState;
  }>;
};

export default function StudentNavigationSidebar({
  courseTitle,
  courseHref,
  syllabusHref,
  continueHref,
  modules,
  currentLessonId,
  isQuickGuide = false,
}: {
  courseTitle: string;
  courseHref: string;
  syllabusHref: string;
  continueHref?: string | null;
  modules: StudentNavigationModule[];
  currentLessonId?: string | null;
  isQuickGuide?: boolean;
}) {
  return (
    <AppNavigationSidebar currentArea="learn">
      <WorkspaceNavigationGroup label="Aprender">
        <WorkspaceNavigationLink href="/cursos">
          Inicio de Aprender
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#mis-cursos">
          Mis cursos
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cursos#guias-rapidas">
          Guías rápidas
        </WorkspaceNavigationLink>
        {continueHref && (
          <WorkspaceNavigationLink href={continueHref}>
            Continuar aprendiendo
          </WorkspaceNavigationLink>
        )}
      </WorkspaceNavigationGroup>

      <WorkspaceNavigationGroup label={isQuickGuide ? "Guía actual" : "Curso actual"}>
        <p className="truncate px-3 text-sm font-medium text-white" title={courseTitle}>
          {courseTitle}
        </p>
        <WorkspaceNavigationLink href={courseHref}>
          {isQuickGuide ? "Vista general de la guía" : "Vista general del curso"}
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href={syllabusHref}>
          {isQuickGuide ? "Pasos" : "Temario"}
        </WorkspaceNavigationLink>
      </WorkspaceNavigationGroup>

      <div>
        <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
          {isQuickGuide ? "Pasos" : "Módulos"}
        </p>
        <div className="mt-3 space-y-2">
          {isQuickGuide ? (
            <ol className="space-y-0.5">
              {modules.flatMap((courseModule) => courseModule.lessons).map((lesson) => (
                <li key={lesson.id}>
                  <LessonNavigationLink
                    lesson={lesson}
                    active={lesson.id === currentLessonId}
                  />
                </li>
              ))}
            </ol>
          ) : modules.map((courseModule) => {
            const containsCurrentLesson = courseModule.lessons.some(
              (lesson) => lesson.id === currentLessonId
            );

            return (
                <section
                  key={courseModule.id}
                  className={`rounded-xl border bg-white/[0.015] ${
                  containsCurrentLesson
                    ? "border-white/[0.16]"
                    : "border-white/[0.08]"
                }`}
              >
                <Link
                  href={courseModule.href}
                  aria-current={containsCurrentLesson ? "location" : undefined}
                  className="block rounded-t-xl px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                >
                  <span className="block truncate font-medium text-white/75">
                    {courseModule.title}
                  </span>
                  <span className="mt-1 block text-[11px] text-white/35">
                    {courseModule.completedLessons}/{courseModule.totalLessons} · {courseModule.progressPercentage}%
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <span
                      className="block h-full rounded-full bg-red-400/75"
                      style={{ width: `${courseModule.progressPercentage}%` }}
                    />
                  </span>
                </Link>

                <ol className="border-t border-white/[0.07] p-1.5">
                  {courseModule.lessons.map((lesson) => {
                    const active = lesson.id === currentLessonId;
                    return (
                      <li key={lesson.id}>
                        <LessonNavigationLink lesson={lesson} active={active} />
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      </div>

    </AppNavigationSidebar>
  );
}

function LessonNavigationLink({ lesson, active }: { lesson: StudentNavigationModule["lessons"][number]; active: boolean }) {
  return (
    <Link
      href={lesson.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70 ${active ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white/85"}`}
    >
      <LessonStateIcon state={lesson.state} />
      <span className="min-w-0 flex-1 leading-5">{lesson.title}</span>
    </Link>
  );
}

function LessonStateIcon({ state }: { state: StudentLessonState }) {
  const styles = {
    "not-started": "border-white/20 bg-transparent",
    "in-progress": "border-amber-300/60 bg-amber-300/20",
    completed: "border-emerald-300/60 bg-emerald-300/15 text-emerald-200",
    locked: "border-white/10 bg-white/[0.03] text-white/30",
  }[state];

  return (
    <span
      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] ${styles}`}
      title={formatLessonState(state)}
    >
      {state === "completed" ? "✓" : state === "locked" ? "·" : ""}
      <span className="sr-only">{formatLessonState(state)}</span>
    </span>
  );
}

function formatLessonState(state: StudentLessonState) {
  return {
    "not-started": "No iniciada",
    "in-progress": "En progreso",
    completed: "Completada",
    locked: "Bloqueada",
  }[state];
}
