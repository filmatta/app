"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

  if (!title) {
    redirect("/admin/cursos/nuevo?error=Falta el título");
  }

  if (!slug) {
    slug = slugify(title);
  }

  const durationValue = getText(
    formData,
    "duration_minutes"
  );

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
    const message =
      error instanceof Error
        ? error.message
        : "Error subiendo portada";

    redirect(
      `/admin/cursos/nuevo?error=${encodeURIComponent(
        message
      )}`
    );
  }

  const { error } = await supabase
    .from("courses")
    .insert({
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

      category:
        getText(formData, "category") ||
        null,

      level:
        getText(formData, "level") || null,

      duration_minutes: durationValue
        ? Number(durationValue)
        : null,

      instructor:
        getText(formData, "instructor") ||
        null,

      hotmart_url:
        getText(formData, "hotmart_url") ||
        null,

      status:
        getText(formData, "status") ||
        "draft",

      featured:
        formData.get("featured") === "on",

      sort_order: sortValue
        ? Number(sortValue)
        : 0,
    });

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

  revalidatePath("/cursos");
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
    redirect(
      `/admin/cursos/${courseId}?error=${encodeURIComponent(
        "Falta el título"
      )}`
    );
  }

  if (!slug) {
    slug = slugify(title);
  }

  const durationValue = getText(
    formData,
    "duration_minutes"
  );

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
    .select(
      "cover_image_url, cover_image_path"
    )
    .eq("id", courseId)
    .single();

  if (existingCourseError) {
    redirect(
      `/admin/cursos/${courseId}?error=${encodeURIComponent(
        existingCourseError.message
      )}`
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
    const message =
      error instanceof Error
        ? error.message
        : "Error subiendo portada";

    redirect(
      `/admin/cursos/${courseId}?error=${encodeURIComponent(
        message
      )}`
    );
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

      category:
        getText(formData, "category") ||
        null,

      level:
        getText(formData, "level") || null,

      duration_minutes: durationValue
        ? Number(durationValue)
        : null,

      instructor:
        getText(formData, "instructor") ||
        null,

      hotmart_url:
        getText(formData, "hotmart_url") ||
        null,

      status:
        getText(formData, "status") ||
        "draft",

      featured:
        formData.get("featured") === "on",

      sort_order: sortValue
        ? Number(sortValue)
        : 0,

      updated_at: new Date().toISOString(),
    })
    .eq("id", courseId);

  if (error) {
    // Si subimos una nueva portada pero falló
    // el UPDATE, eliminamos la nueva imagen
    // para no dejar archivos huérfanos.
    if (cover?.path) {
      await supabase.storage
        .from("course-covers")
        .remove([cover.path]);
    }

    redirect(
      `/admin/cursos/${courseId}?error=${encodeURIComponent(
        error.message
      )}`
    );
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
  revalidatePath("/admin/cursos");
  revalidatePath(
    `/admin/cursos/${courseId}`
  );

  redirect("/admin/cursos");
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
    .select("cover_image_path")
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
  revalidatePath("/admin/cursos");

  redirect("/admin/cursos");
}