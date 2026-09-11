"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { insertWithUniqueSlug } from "@/lib/learn/unique-slug";
import { getLearnContentType } from "@/lib/learn/content-type";
import { changeLessonPlaybackPolicy } from "@/lib/mux/change-playback-policy";

const CONTENT_STATUSES = ["draft", "published", "archived"] as const;
const MAX_INTEGER = 2_147_483_647;

type ContentSuccess =
  | "module-created"
  | "module-deleted"
  | "lesson-created"
  | "lesson-deleted";

type BulkContentPayload = {
  modules: Array<Record<string, unknown>>;
  lessons: Array<Record<string, unknown>>;
};

type AdminSupabaseClient = Awaited<
  ReturnType<typeof requireAdmin>
>["supabase"];

class ContentActionError extends Error {}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getTitle(formData: FormData) {
  return validateTitle(getText(formData, "title"));
}

function validateTitle(title: string) {
  if (!title) {
    throw new ContentActionError("El título es obligatorio.");
  }

  if (title.length > 200) {
    throw new ContentActionError("El título no puede superar 200 caracteres.");
  }

  return title;
}

function getStatus(formData: FormData) {
  return validateStatus(getText(formData, "status") || "draft");
}

function validateStatus(status: string) {
  if (!CONTENT_STATUSES.includes(status as (typeof CONTENT_STATUSES)[number])) {
    throw new ContentActionError("Selecciona un estado válido.");
  }

  return status as (typeof CONTENT_STATUSES)[number];
}

function getNonNegativeInteger(
  formData: FormData,
  key: string,
  label: string,
  options: { optional?: boolean } = {}
) {
  return validateNonNegativeInteger(getText(formData, key), label, options);
}

function validateNonNegativeInteger(
  value: unknown,
  label: string,
  options: { optional?: boolean } = {}
) {
  const rawValue = String(value ?? "").trim();

  if (!rawValue && options.optional) {
    return null;
  }

  const normalizedValue = rawValue || "0";

  if (!/^\d+$/.test(normalizedValue)) {
    throw new ContentActionError(
      `${label} debe ser un número entero mayor o igual a cero.`
    );
  }

  const parsedValue = Number(normalizedValue);

  if (!Number.isSafeInteger(parsedValue) || parsedValue > MAX_INTEGER) {
    throw new ContentActionError(`${label} es demasiado grande.`);
  }

  return parsedValue;
}

function parseBulkContentPayload(formData: FormData): BulkContentPayload {
  const rawPayload = getText(formData, "payload");

  if (!rawPayload || rawPayload.length > 1_000_000) {
    throw new ContentActionError("No se pudieron leer los cambios pendientes.");
  }

  try {
    const payload = JSON.parse(rawPayload) as unknown;

    if (
      !isRecord(payload) ||
      !Array.isArray(payload.modules) ||
      !Array.isArray(payload.lessons) ||
      !payload.modules.every(isRecord) ||
      !payload.lessons.every(isRecord)
    ) {
      throw new ContentActionError(
        "No se pudieron leer los cambios pendientes."
      );
    }

    return {
      modules: payload.modules,
      lessons: payload.lessons,
    };
  } catch {
    throw new ContentActionError("No se pudieron leer los cambios pendientes.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecordText(record: Record<string, unknown>, key: string) {
  return String(record[key] ?? "").trim();
}

async function getCourse(
  supabase: AdminSupabaseClient,
  courseId: string
) {
  const { data: course, error } = await supabase
    .from("courses")
    .select("id, slug, content_type")
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    console.error("Error verificando el curso para editar contenido:", error);
    throw new ContentActionError("No se pudo verificar el curso.");
  }

  if (!course) {
    throw new ContentActionError(
      "El curso ya no existe o no está disponible."
    );
  }

  return course;
}

async function requireModule(
  supabase: AdminSupabaseClient,
  courseId: string,
  moduleId: string
) {
  const { data: courseModule, error } = await supabase
    .from("course_modules")
    .select("id, course_id")
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) {
    console.error("Error verificando el módulo:", error);
    throw new ContentActionError("No se pudo verificar el módulo.");
  }

  if (!courseModule) {
    throw new ContentActionError(
      "El módulo ya no existe o no pertenece a este curso."
    );
  }

  return courseModule;
}

async function requireLesson(
  supabase: AdminSupabaseClient,
  courseId: string,
  moduleId: string,
  lessonId: string
) {
  const { data: lesson, error } = await supabase
    .from("course_lessons")
    .select("id, course_id, module_id")
    .eq("id", lessonId)
    .eq("course_id", courseId)
    .eq("module_id", moduleId)
    .maybeSingle();

  if (error) {
    console.error("Error verificando la lección:", error);
    throw new ContentActionError("No se pudo verificar la lección.");
  }

  if (!lesson) {
    throw new ContentActionError(
      "La lección ya no existe o no pertenece a este módulo."
    );
  }

  return lesson;
}

function contentError(courseId: string, message: string): never {
  redirect(
    `/admin/cursos/${courseId}?content_error=${encodeURIComponent(message)}&notice=${crypto.randomUUID()}#contenido`
  );
}

function finishContentMutation(
  courseId: string,
  courseSlug: string,
  success: ContentSuccess,
  focusId?: string
): never {
  revalidateCourseContent(courseId, courseSlug);

  redirect(
    `/admin/cursos/${courseId}?success=${success}&notice=${crypto.randomUUID()}${focusId ? `&focus=${focusId}` : ""}#${focusId ? `content-${focusId}` : "contenido"}`
  );
}

function revalidateCourseContent(courseId: string, courseSlug: string) {
  revalidatePath("/admin/cursos");
  revalidatePath(`/admin/cursos/${courseId}`);
  revalidatePath("/cursos");
  revalidatePath(`/cursos/${courseSlug}`);
}

function mutationError(
  courseId: string,
  context: string,
  error: unknown,
  publicMessage: string
): never {
  console.error(context, error);
  contentError(courseId, publicMessage);
}

export async function saveAllCourseContent(
  courseId: string,
  formData: FormData
) {
  const { supabase } = await requireAdmin();
  let failedPolicyLessonId: string | null = null;

  try {
    const course = await getCourse(supabase, courseId);
    const payload = parseBulkContentPayload(formData);

    const [modulesResult, lessonsResult, videosResult] = await Promise.all([
      supabase
        .from("course_modules")
        .select("id, course_id, status")
        .eq("course_id", courseId),
      supabase
        .from("course_lessons")
        .select("id, course_id, module_id, slug, duration_minutes, is_preview, status")
        .eq("course_id", courseId),
      supabase.from("lesson_videos").select("lesson_id, playback_policy"),
    ]);

    if (modulesResult.error || lessonsResult.error || videosResult.error) {
      console.error("Error verificando el contenido para guardado masivo:", {
        modulesError: modulesResult.error,
        lessonsError: lessonsResult.error,
      });

      throw new ContentActionError(
        "No se pudo verificar el contenido del curso."
      );
    }

    const existingModules = new Map(
      (modulesResult.data ?? []).map((courseModule) => [
        courseModule.id,
        courseModule,
      ])
    );
    const existingLessons = new Map(
      (lessonsResult.data ?? []).map((lesson) => [lesson.id, lesson])
    );
    const videosByLesson = new Map(
      (videosResult.data ?? []).map((video) => [video.lesson_id, video])
    );
    const policyTransitions: Array<{
      lessonId: string;
      title: string;
      preview: boolean;
    }> = [];
    const isQuickGuide = getLearnContentType(course) === "quick_guide";
    const seenModuleIds = new Set<string>();
    const seenLessonIds = new Set<string>();

    const moduleRows = payload.modules.map((record) => {
      const id = getRecordText(record, "id");
      const existingModule = existingModules.get(id);

      if (!existingModule || seenModuleIds.has(id)) {
        throw new ContentActionError(
          "Uno de los módulos cambió. Recarga la página e inténtalo de nuevo."
        );
      }

      seenModuleIds.add(id);

      return {
        id,
        course_id: existingModule.course_id,
        title: validateTitle(getRecordText(record, "title")),
        description: getRecordText(record, "description") || null,
        sort_order: validateNonNegativeInteger(
          record.sort_order,
          "El número de módulo"
        ),
        status: existingModule.status === "archived" ? "archived" : validateStatus(getRecordText(record, "status") || "draft"),
      };
    });

    const lessonRows = payload.lessons.map((record) => {
      const id = getRecordText(record, "id");
      const existingLesson = existingLessons.get(id);

      if (!existingLesson || seenLessonIds.has(id)) {
        throw new ContentActionError(
          "Una de las lecciones cambió. Recarga la página e inténtalo de nuevo."
        );
      }

      seenLessonIds.add(id);

      const title = validateTitle(getRecordText(record, "title"));
      const video = videosByLesson.get(id);
      const preview = isQuickGuide ? false : record.is_preview === true;
      if (video && preview !== existingLesson.is_preview) {
        policyTransitions.push({ lessonId: id, title, preview });
      }

      return {
        id,
        course_id: existingLesson.course_id,
        module_id: existingLesson.module_id,
        title,
        slug: existingLesson.slug,
        description: getRecordText(record, "description") || null,
        sort_order: validateNonNegativeInteger(
          record.sort_order,
          "El número de lección"
        ),
        is_preview: preview,
        status: existingLesson.status === "archived" ? "archived" : validateStatus(getRecordText(record, "status") || "draft"),
      };
    });

    for (const transition of policyTransitions) {
      const result = await changeLessonPlaybackPolicy(
        supabase,
        transition.lessonId,
        transition.preview,
      );

      if (!result.ok) {
        failedPolicyLessonId = transition.lessonId;
        throw new ContentActionError(`«${transition.title}»: ${result.message}`);
      }
    }

    for (const { id, ...values } of lessonRows) {
      const { error } = await supabase.from("course_lessons")
        .update(values).eq("id", id).eq("course_id", courseId);

      if (error) {
        console.error("Error guardando las lecciones en bloque:", error);

        throw new ContentActionError(
          error.code === "23505"
            ? "Hay lecciones con un slug repetido en el curso."
            : "No se pudieron guardar todas las lecciones."
        );
      }
    }

    for (const { id, ...values } of moduleRows) {
      const { error } = await supabase.from("course_modules")
        .update(values).eq("id", id).eq("course_id", courseId);

      if (error) {
        console.error("Error guardando los módulos en bloque:", error);
        throw new ContentActionError("No se pudieron guardar todos los módulos.");
      }
    }

    revalidateCourseContent(courseId, course.slug);

    return {
      ok: true as const,
      message: "Todos los cambios fueron guardados.",
      notice: crypto.randomUUID(),
      policyChangedLessonIds: policyTransitions.map(
        (transition) => transition.lessonId,
      ),
    };
  } catch (error) {
    if (error instanceof ContentActionError) {
      return {
        ok: false as const,
        message: error.message,
        notice: crypto.randomUUID(),
        policyFailedLessonIds: failedPolicyLessonId
          ? [failedPolicyLessonId]
          : [],
      };
    }

    console.error("Error inesperado guardando todo el contenido:", error);

    return {
      ok: false as const,
      message: "No se pudieron guardar todos los cambios.",
      notice: crypto.randomUUID(),
      policyFailedLessonIds: failedPolicyLessonId
        ? [failedPolicyLessonId]
        : [],
    };
  }
}

export async function createCourseModule(
  courseId: string,
  formData: FormData
) {
  const { supabase } = await requireAdmin();

  try {
    const course = await getCourse(supabase, courseId);
    const title = getTitle(formData);
    const status = getStatus(formData);
    const sortOrder = getNonNegativeInteger(
      formData,
      "sort_order",
      "El número de módulo"
    );

    const { data: created, error } = await supabase.from("course_modules").insert({
      course_id: courseId,
      title,
      description: getText(formData, "description") || null,
      sort_order: sortOrder,
      status,
    }).select("id").single();

    if (error) {
      mutationError(
        courseId,
        "Error creando el módulo:",
        error,
        "No se pudo crear el módulo. Revisa los datos e inténtalo de nuevo."
      );
    }

    finishContentMutation(courseId, course.slug, "module-created", created?.id);
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ContentActionError) {
      contentError(courseId, error.message);
    }

    console.error("Error inesperado creando el módulo:", error);
    contentError(courseId, "No se pudo crear el módulo.");
  }
}

export async function deleteCourseModule(
  courseId: string,
  moduleId: string
) {
  const { supabase } = await requireAdmin();

  try {
    const course = await getCourse(supabase, courseId);
    await requireModule(supabase, courseId, moduleId);

    const { error } = await supabase
      .from("course_modules")
      .delete()
      .eq("id", moduleId)
      .eq("course_id", courseId);

    if (error) {
      mutationError(
        courseId,
        "Error eliminando el módulo:",
        error,
        "No se pudo eliminar el módulo."
      );
    }

    finishContentMutation(courseId, course.slug, "module-deleted");
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ContentActionError) {
      contentError(courseId, error.message);
    }

    console.error("Error inesperado eliminando el módulo:", error);
    contentError(courseId, "No se pudo eliminar el módulo.");
  }
}

export async function createCourseLesson(
  courseId: string,
  moduleId: string,
  formData: FormData
) {
  const { supabase } = await requireAdmin();

  try {
    const course = await getCourse(supabase, courseId);
    await requireModule(supabase, courseId, moduleId);

    const title = getTitle(formData);
    const status = getStatus(formData);
    const sortOrder = getNonNegativeInteger(
      formData,
      "sort_order",
      "El número de lección"
    );

    const { data: created, error } = await insertWithUniqueSlug<{ id: string }>(title, "leccion", (slug) => supabase.from("course_lessons").insert({
      module_id: moduleId,
      course_id: courseId,
      title,
      slug,
      description: getText(formData, "description") || null,
      duration_minutes: null,
      sort_order: sortOrder,
      is_preview: formData.get("is_preview") === "on",
      status,
    }).select("id").single());

    if (error) {
      const message =
        error.code === "23505"
          ? "Ya existe una lección con ese slug en este curso."
          : "No se pudo crear la lección. Revisa los datos e inténtalo de nuevo.";

      mutationError(courseId, "Error creando la lección:", error, message);
    }

    finishContentMutation(courseId, course.slug, "lesson-created", created?.id);
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ContentActionError) {
      contentError(courseId, error.message);
    }

    console.error("Error inesperado creando la lección:", error);
    contentError(courseId, "No se pudo crear la lección.");
  }
}

export async function deleteCourseLesson(
  courseId: string,
  moduleId: string,
  lessonId: string
) {
  const { supabase } = await requireAdmin();

  try {
    const course = await getCourse(supabase, courseId);
    await requireModule(supabase, courseId, moduleId);
    await requireLesson(supabase, courseId, moduleId, lessonId);

    const { error } = await supabase
      .from("course_lessons")
      .delete()
      .eq("id", lessonId)
      .eq("module_id", moduleId)
      .eq("course_id", courseId);

    if (error) {
      mutationError(
        courseId,
        "Error eliminando la lección:",
        error,
        "No se pudo eliminar la lección."
      );
    }

    finishContentMutation(courseId, course.slug, "lesson-deleted");
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ContentActionError) {
      contentError(courseId, error.message);
    }

    console.error("Error inesperado eliminando la lección:", error);
    contentError(courseId, "No se pudo eliminar la lección.");
  }
}
