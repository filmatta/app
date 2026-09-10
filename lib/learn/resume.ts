import { createClient } from "@/lib/supabase/server";

type ResumeCourse = {
  id: string;
  slug: string;
};

type ResumeModule = {
  id: string;
  course_id: string;
  sort_order: number;
};

type ResumeLesson = {
  id: string;
  course_id: string;
  module_id: string;
  slug: string;
  sort_order: number;
  is_preview: boolean;
};

type LessonProgress = {
  lesson_id: string;
  completed_at: string | null;
  last_activity_at: string;
};

export type ResumeAction = {
  kind: "lesson" | "plus" | "completed" | "empty" | "fallback";
  href: string;
  label:
    | "Continuar curso"
    | "Ver FILMATTA Plus"
    | "Revisar curso"
    | "Ver curso";
};

export async function getResumeActions(
  userId: string,
  courses: ResumeCourse[]
) {
  const actions = new Map<string, ResumeAction>();

  if (courses.length === 0) {
    return actions;
  }

  const supabase = await createClient();
  const courseIds = courses.map((course) => course.id);
  const [modulesResult, lessonsResult, progressResult] = await Promise.all([
    supabase
      .from("course_modules")
      .select("id, course_id, sort_order")
      .in("course_id", courseIds)
      .eq("status", "published"),
    supabase
      .from("course_lessons")
      .select("id, course_id, module_id, slug, sort_order, is_preview")
      .in("course_id", courseIds)
      .eq("status", "published"),
    supabase
      .from("lesson_progress")
      .select("course_id, lesson_id, completed_at, last_activity_at")
      .eq("user_id", userId)
      .in("course_id", courseIds),
  ]);

  if (modulesResult.error || lessonsResult.error) {
    console.error("Error cargando el temario para continuar cursos:", {
      modulesError: modulesResult.error,
      lessonsError: lessonsResult.error,
    });

    for (const course of courses) {
      actions.set(course.id, getCourseFallbackAction(course.slug));
    }

    return actions;
  }

  if (progressResult.error) {
    console.error("Error cargando el progreso para continuar cursos:", progressResult.error);

    for (const course of courses) {
      actions.set(course.id, getCourseFallbackAction(course.slug));
    }

    return actions;
  }

  const modules = (modulesResult.data ?? []) as ResumeModule[];
  const lessons = (lessonsResult.data ?? []) as ResumeLesson[];
  const progress = (progressResult.data ?? []) as (LessonProgress & {
    course_id: string;
  })[];

  for (const course of courses) {
    const courseModules = modules
      .filter((courseModule) => courseModule.course_id === course.id)
      .sort(compareOrder);
    const modulePosition = new Map(
      courseModules.map((courseModule, index) => [courseModule.id, index])
    );
    const courseLessons = lessons
      .filter(
        (lesson) =>
          lesson.course_id === course.id && modulePosition.has(lesson.module_id)
      )
      .sort((first, second) => {
        const moduleDifference =
          (modulePosition.get(first.module_id) ?? 0) -
          (modulePosition.get(second.module_id) ?? 0);

        return moduleDifference || compareOrder(first, second);
      });
    const accessibleLessons = courseLessons.filter((lesson) => lesson.is_preview);
    const courseProgress = progress.filter((item) => item.course_id === course.id);
    const progressByLesson = new Map(
      courseProgress.map((item) => [item.lesson_id, item])
    );

    if (courseLessons.length === 0) {
      actions.set(course.id, {
        kind: "empty",
        href: `/cursos/${course.slug}`,
        label: "Ver curso",
      });
      continue;
    }

    const resumeLesson = chooseResumeLesson(accessibleLessons, progressByLesson);
    const completedCourse =
      courseLessons.every(
        (lesson) => Boolean(progressByLesson.get(lesson.id)?.completed_at)
      );

    if (completedCourse) {
      actions.set(course.id, {
        kind: "completed",
        href: `/cursos/${course.slug}#contenido`,
        label: "Revisar curso",
      });
    } else if (resumeLesson) {
      actions.set(course.id, {
        kind: "lesson",
        href: `/cursos/${course.slug}/lecciones/${resumeLesson.slug}`,
        label: "Continuar curso",
      });
    } else if (courseLessons.some((lesson) => !lesson.is_preview)) {
      actions.set(course.id, {
        kind: "plus",
        href: "/planes#plus",
        label: "Ver FILMATTA Plus",
      });
    } else {
      actions.set(course.id, getCourseFallbackAction(course.slug));
    }
  }

  return actions;
}

function getCourseFallbackAction(courseSlug: string): ResumeAction {
  return {
    kind: "fallback",
    href: `/cursos/${courseSlug}`,
    label: "Ver curso",
  };
}

function chooseResumeLesson(
  lessons: ResumeLesson[],
  progressByLesson: Map<string, LessonProgress>
) {
  if (lessons.length === 0) {
    return null;
  }

  const lessonsWithProgress = lessons
    .map((lesson, index) => ({
      lesson,
      index,
      progress: progressByLesson.get(lesson.id),
    }))
    .filter(
      (item): item is typeof item & { progress: LessonProgress } =>
        Boolean(item.progress)
    )
    .sort(
      (first, second) =>
        Date.parse(second.progress.last_activity_at) -
        Date.parse(first.progress.last_activity_at)
    );

  if (lessonsWithProgress.length === 0) {
    return lessons[0];
  }

  const latest = lessonsWithProgress[0];
  const nextIncomplete = lessons
    .slice(latest.index + 1)
    .find((lesson) => !progressByLesson.get(lesson.id)?.completed_at);

  if (nextIncomplete) {
    return nextIncomplete;
  }

  if (!latest.progress.completed_at) {
    return latest.lesson;
  }

  return lessons.find(
    (lesson) => !progressByLesson.get(lesson.id)?.completed_at
  ) ?? null;
}

function compareOrder(
  first: { sort_order: number; id: string },
  second: { sort_order: number; id: string }
) {
  return first.sort_order - second.sort_order || first.id.localeCompare(second.id);
}
