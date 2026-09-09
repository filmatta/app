"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { slugify } from "@/lib/slugify";

const CONTENT_STATUSES = ["draft", "published", "archived"] as const;
const LESSON_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_INTEGER = 2_147_483_647;

type ContentSuccess =
  | "module-created"
  | "module-updated"
  | "module-deleted"
  | "lesson-created"
  | "lesson-updated"
  | "lesson-deleted";

type AdminSupabaseClient = Awaited<
  ReturnType<typeof requireAdmin>
>["supabase"];

class ContentActionError extends Error {}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getTitle(formData: FormData) {
  const title = getText(formData, "title");

  if (!title) {
    throw new ContentActionError("El título es obligatorio.");
  }

  if (title.length > 200) {
    throw new ContentActionError("El título no puede superar 200 caracteres.");
  }

  return title;
}

function getStatus(formData: FormData) {
  const status = getText(formData, "status");

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
  const rawValue = getText(formData, key);

  if (!rawValue && options.optional) {
    return null;
  }

  const normalizedValue = rawValue || "0";

  if (!/^\d+$/.test(normalizedValue)) {
    throw new ContentActionError(
      `${label} debe ser un número entero mayor o igual a cero.`
    );
  }

  const value = Number(normalizedValue);

  if (!Number.isSafeInteger(value) || value > MAX_INTEGER) {
    throw new ContentActionError(`${label} es demasiado grande.`);
  }

  return value;
}

function getLessonSlug(formData: FormData, title: string) {
  const typedSlug = getText(formData, "slug");
  const slug = typedSlug || slugify(title);

  if (!slug || slug.length > 160 || !LESSON_SLUG_PATTERN.test(slug)) {
    throw new ContentActionError(
      "El slug debe usar minúsculas, números y guiones, sin espacios."
    );
  }

  return slug;
}

async function getCourse(
  supabase: AdminSupabaseClient,
  courseId: string
) {
  const { data: course, error } = await supabase
    .from("courses")
    .select("id, slug")
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
  success: ContentSuccess
): never {
  revalidatePath("/admin/cursos");
  revalidatePath(`/admin/cursos/${courseId}`);
  revalidatePath("/cursos");
  revalidatePath(`/cursos/${courseSlug}`);

  redirect(
    `/admin/cursos/${courseId}?success=${success}&notice=${crypto.randomUUID()}#contenido`
  );
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

    const { error } = await supabase.from("course_modules").insert({
      course_id: courseId,
      title,
      description: getText(formData, "description") || null,
      sort_order: sortOrder,
      status,
    });

    if (error) {
      mutationError(
        courseId,
        "Error creando el módulo:",
        error,
        "No se pudo crear el módulo. Revisa los datos e inténtalo de nuevo."
      );
    }

    finishContentMutation(courseId, course.slug, "module-created");
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ContentActionError) {
      contentError(courseId, error.message);
    }

    console.error("Error inesperado creando el módulo:", error);
    contentError(courseId, "No se pudo crear el módulo.");
  }
}

export async function updateCourseModule(
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
      "El número de módulo"
    );

    const { error } = await supabase
      .from("course_modules")
      .update({
        title,
        description: getText(formData, "description") || null,
        sort_order: sortOrder,
        status,
      })
      .eq("id", moduleId)
      .eq("course_id", courseId);

    if (error) {
      mutationError(
        courseId,
        "Error actualizando el módulo:",
        error,
        "No se pudo guardar el módulo. Revisa los datos e inténtalo de nuevo."
      );
    }

    finishContentMutation(courseId, course.slug, "module-updated");
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ContentActionError) {
      contentError(courseId, error.message);
    }

    console.error("Error inesperado actualizando el módulo:", error);
    contentError(courseId, "No se pudo guardar el módulo.");
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
    const slug = getLessonSlug(formData, title);
    const status = getStatus(formData);
    const durationMinutes = getNonNegativeInteger(
      formData,
      "duration_minutes",
      "La duración",
      { optional: true }
    );
    const sortOrder = getNonNegativeInteger(
      formData,
      "sort_order",
      "El número de lección"
    );

    const { error } = await supabase.from("course_lessons").insert({
      module_id: moduleId,
      course_id: courseId,
      title,
      slug,
      description: getText(formData, "description") || null,
      duration_minutes: durationMinutes,
      sort_order: sortOrder,
      is_preview: formData.get("is_preview") === "on",
      status,
    });

    if (error) {
      const message =
        error.code === "23505"
          ? "Ya existe una lección con ese slug en este curso."
          : "No se pudo crear la lección. Revisa los datos e inténtalo de nuevo.";

      mutationError(courseId, "Error creando la lección:", error, message);
    }

    finishContentMutation(courseId, course.slug, "lesson-created");
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ContentActionError) {
      contentError(courseId, error.message);
    }

    console.error("Error inesperado creando la lección:", error);
    contentError(courseId, "No se pudo crear la lección.");
  }
}

export async function updateCourseLesson(
  courseId: string,
  moduleId: string,
  lessonId: string,
  formData: FormData
) {
  const { supabase } = await requireAdmin();

  try {
    const course = await getCourse(supabase, courseId);
    await requireModule(supabase, courseId, moduleId);
    await requireLesson(supabase, courseId, moduleId, lessonId);

    const title = getTitle(formData);
    const slug = getLessonSlug(formData, title);
    const status = getStatus(formData);
    const durationMinutes = getNonNegativeInteger(
      formData,
      "duration_minutes",
      "La duración",
      { optional: true }
    );
    const sortOrder = getNonNegativeInteger(
      formData,
      "sort_order",
      "El número de lección"
    );

    const { error } = await supabase
      .from("course_lessons")
      .update({
        title,
        slug,
        description: getText(formData, "description") || null,
        duration_minutes: durationMinutes,
        sort_order: sortOrder,
        is_preview: formData.get("is_preview") === "on",
        status,
      })
      .eq("id", lessonId)
      .eq("module_id", moduleId)
      .eq("course_id", courseId);

    if (error) {
      const message =
        error.code === "23505"
          ? "Ya existe una lección con ese slug en este curso."
          : "No se pudo guardar la lección. Revisa los datos e inténtalo de nuevo.";

      mutationError(courseId, "Error actualizando la lección:", error, message);
    }

    finishContentMutation(courseId, course.slug, "lesson-updated");
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ContentActionError) {
      contentError(courseId, error.message);
    }

    console.error("Error inesperado actualizando la lección:", error);
    contentError(courseId, "No se pudo guardar la lección.");
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
