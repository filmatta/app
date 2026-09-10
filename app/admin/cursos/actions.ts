"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isCourseCategory, isCourseLevel } from "@/lib/course-options";
import {
  getLearnContentType,
  isLearnContentType,
} from "@/lib/learn/content-type";
import { slugify } from "@/lib/slugify";
import { getContentTypeSupport } from "./content-type-support";

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getCourseEditFeedbackUrl(
  courseId: string,
  key: "error" | "success",
  message: string
) {
  const searchParams = new URLSearchParams({
    [key]: message,
    notice: crypto.randomUUID(),
  });

  return `/admin/cursos/${courseId}?${searchParams.toString()}`;
}

function getCoverUploadError(error: unknown) {
  const knownMessages = [
    "La portada debe ser JPG, PNG o WEBP.",
    "La portada no puede pesar más de 5 MB.",
  ];

  if (error instanceof Error && knownMessages.includes(error.message)) {
    return error.message;
  }

  console.error("Error subiendo la portada del curso:", error);
  return "No se pudo subir la portada. Inténtalo de nuevo.";
}

async function uploadCourseCover(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  formData: FormData
) {
  const file = formData.get("cover_image");

  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("La portada debe ser JPG, PNG o WEBP.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("La portada no puede pesar más de 5 MB.");
  }

  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  const extension = extensionByType[file.type];

  const path = `courses/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("course-covers")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage
    .from("course-covers")
    .getPublicUrl(path);

  return {
    path,
    url: data.publicUrl,
  };
}

export async function createCourse(formData: FormData) {
  const { supabase } = await requireAdmin();

  const title = getText(formData, "title");
  let slug = getText(formData, "slug");
  const requestedContentType = getText(formData, "content_type");

  if (!title) {
    redirect("/admin/cursos/nuevo?error=Falta el título");
  }

  if (!slug) {
    slug = slugify(title);
  }

  if (requestedContentType && !isLearnContentType(requestedContentType)) {
    redirect(
      `/admin/cursos/nuevo?error=${encodeURIComponent(
        "Selecciona un tipo de contenido válido."
      )}`
    );
  }

  if (requestedContentType) {
    const contentTypeSupport = await getContentTypeSupport(supabase);

    if (contentTypeSupport !== "available") {
      redirect(
        `/admin/cursos/nuevo?error=${encodeURIComponent(
          contentTypeSupport === "missing"
            ? "Aplica la migración de content_type antes de crear guías rápidas."
            : "No se pudo verificar el tipo de contenido. Inténtalo de nuevo."
        )}`
      );
    }
  }

  const durationValue = getText(
    formData,
    "duration_minutes"
  );
  const courseStatus = getText(formData, "status") || "draft";

  const category = getText(formData, "category");
  const level = getText(formData, "level");

  if (category && !isCourseCategory(category)) {
    redirect(
      `/admin/cursos/nuevo?error=${encodeURIComponent(
        "Selecciona una categoría válida."
      )}`
    );
  }

  if (level && !isCourseLevel(level)) {
    redirect(
      `/admin/cursos/nuevo?error=${encodeURIComponent(
        "Selecciona un nivel válido."
      )}`
    );
  }

  const sortValue = getText(
    formData,
    "sort_order"
  );

  let cover: Awaited<
    ReturnType<typeof uploadCourseCover>
  > = null;

  try {
    cover = await uploadCourseCover(
      supabase,
      formData
    );
  } catch (error) {
    const message = getCoverUploadError(error);

    redirect(
      `/admin/cursos/nuevo?error=${encodeURIComponent(
        message
      )}`
    );
  }

  const courseValues: Record<string, unknown> = {
      title,
      slug,

      short_description:
        getText(
          formData,
          "short_description"
        ) || null,

      description:
        getText(formData, "description") ||
        null,

      cover_image_url: cover?.url ?? null,
      cover_image_path: cover?.path ?? null,

      category: category || null,

      level: level || null,

      duration_minutes: durationValue
        ? Number(durationValue)
        : null,

      instructor:
        getText(formData, "instructor") ||
        null,

      status: courseStatus,

      featured:
        formData.get("featured") === "on",

      sort_order: sortValue
        ? Number(sortValue)
        : 0,
    };

  if (requestedContentType) {
    courseValues.content_type = requestedContentType;
  }

  const { data: createdCourse, error } = await supabase
    .from("courses")
    .insert(courseValues)
    .select("id")
    .single();

  if (error) {
    // Si la imagen se subió pero falló la creación
    // del curso, eliminamos el archivo huérfano.
    if (cover?.path) {
      await supabase.storage
        .from("course-covers")
        .remove([cover.path]);
    }

    redirect(
      `/admin/cursos/nuevo?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  if (requestedContentType === "quick_guide") {
    // Las guías reutilizan course_lessons mediante un único módulo técnico.
    // El editor oculta esta capa para mantener una experiencia simple.
    const { error: moduleError } = await supabase.from("course_modules").insert({
      course_id: createdCourse.id,
      title: "Contenido de la guía",
      description: null,
      sort_order: 0,
      status: courseStatus,
    });

    if (moduleError) {
      console.error("Error preparando el contenido de la guía:", moduleError);
      await supabase.from("courses").delete().eq("id", createdCourse.id);

      if (cover?.path) {
        await supabase.storage.from("course-covers").remove([cover.path]);
      }

      redirect(
        `/admin/cursos/nuevo?error=${encodeURIComponent(
          "No se pudo preparar el contenido de la guía. Inténtalo de nuevo."
        )}`
      );
    }
  }

  revalidatePath("/cursos");
  revalidatePath(`/cursos/${slug}`);
  revalidatePath("/admin/cursos");

  redirect("/admin/cursos");
}

export async function updateCourse(
  courseId: string,
  formData: FormData
) {
  const { supabase } = await requireAdmin();

  const title = getText(formData, "title");
  let slug = getText(formData, "slug");

  if (!title) {
    redirect(getCourseEditFeedbackUrl(courseId, "error", "Falta el título"));
  }

  if (!slug) {
    slug = slugify(title);
  }

  const durationValue = getText(
    formData,
    "duration_minutes"
  );
  const courseStatus = getText(formData, "status") || "draft";

  const category = getText(formData, "category");
  const level = getText(formData, "level");

  const sortValue = getText(
    formData,
    "sort_order"
  );

  // Recuperamos la portada actual antes
  // de modificar el curso.
  const {
    data: existingCourse,
    error: existingCourseError,
  } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();

  if (existingCourseError) {
    console.error(
      "Error cargando el curso antes de actualizarlo:",
      existingCourseError
    );
    redirect(
      getCourseEditFeedbackUrl(
        courseId,
        "error",
        "No se pudo preparar el curso para guardar los cambios."
      )
    );
  }

  if (
    category &&
    !isCourseCategory(category) &&
    category !== existingCourse.category
  ) {
    redirect(
      getCourseEditFeedbackUrl(
        courseId,
        "error",
        "Selecciona una categoría válida."
      )
    );
  }

  if (level && !isCourseLevel(level) && level !== existingCourse.level) {
    redirect(
      getCourseEditFeedbackUrl(
        courseId,
        "error",
        "Selecciona un nivel válido."
      )
    );
  }

  let cover: Awaited<
    ReturnType<typeof uploadCourseCover>
  > = null;

  try {
    cover = await uploadCourseCover(
      supabase,
      formData
    );
  } catch (error) {
    const message = getCoverUploadError(error);

    redirect(getCourseEditFeedbackUrl(courseId, "error", message));
  }

  const { error } = await supabase
    .from("courses")
    .update({
      title,
      slug,

      short_description:
        getText(
          formData,
          "short_description"
        ) || null,

      description:
        getText(formData, "description") ||
        null,

      cover_image_url:
        cover?.url ??
        existingCourse?.cover_image_url ??
        null,

      cover_image_path:
        cover?.path ??
        existingCourse?.cover_image_path ??
        null,

      category: category || null,

      level: level || null,

      duration_minutes: durationValue
        ? Number(durationValue)
        : null,

      instructor:
        getText(formData, "instructor") ||
        null,

      status: courseStatus,

      featured:
        formData.get("featured") === "on",

      sort_order: sortValue
        ? Number(sortValue)
        : 0,

      updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);

  if (error) {
    console.error("Error guardando el curso:", error);

    // Si subimos una nueva portada pero falló
    // el UPDATE, eliminamos la nueva imagen
    // para no dejar archivos huérfanos.
    if (cover?.path) {
      await supabase.storage
        .from("course-covers")
        .remove([cover.path]);
    }

    redirect(
      getCourseEditFeedbackUrl(
        courseId,
        "error",
        "No se pudo guardar el curso. Inténtalo de nuevo."
      )
    );
  }

  if (getLearnContentType(existingCourse) === "quick_guide") {
    const { error: moduleStatusError } = await supabase
      .from("course_modules")
      .update({ status: courseStatus })
      .eq("course_id", courseId);

    if (moduleStatusError) {
      console.error(
        "Error sincronizando el contenedor de la guía:",
        moduleStatusError
      );
      redirect(
        getCourseEditFeedbackUrl(
          courseId,
          "error",
          "El contenido se guardó, pero no se pudo sincronizar la publicación de la guía."
        )
      );
    }
  }

  // Si el UPDATE fue correcto y había una
  // portada anterior, eliminamos la vieja.
  if (
    cover &&
    existingCourse?.cover_image_path &&
    existingCourse.cover_image_path !==
      cover.path
  ) {
    await supabase.storage
      .from("course-covers")
      .remove([
        existingCourse.cover_image_path,
      ]);
  }

  revalidatePath("/cursos");
  revalidatePath(`/cursos/${slug}`);

  if (existingCourse.slug !== slug) {
    revalidatePath(`/cursos/${existingCourse.slug}`);
  }

  revalidatePath("/admin/cursos");
  revalidatePath(
    `/admin/cursos/${courseId}`
  );

  redirect(getCourseEditFeedbackUrl(courseId, "success", "course-saved"));
}

export async function deleteCourse(
  formData: FormData
) {
  const { supabase } = await requireAdmin();

  const id = getText(formData, "id");

  if (!id) {
    redirect("/admin/cursos");
  }

  // Primero obtenemos la portada para
  // eliminarla también del Storage.
  const { data: course } = await supabase
    .from("courses")
    .select("slug, cover_image_path")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", id);

  if (error) {
    redirect(
      `/admin/cursos?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  if (course?.cover_image_path) {
    await supabase.storage
      .from("course-covers")
      .remove([course.cover_image_path]);
  }

  revalidatePath("/cursos");

  if (course?.slug) {
    revalidatePath(`/cursos/${course.slug}`);
  }

  revalidatePath("/admin/cursos");

  redirect("/admin/cursos");
}
