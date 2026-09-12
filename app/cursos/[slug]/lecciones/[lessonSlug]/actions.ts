"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBillingAccess } from "@/lib/billing/access";

type ProgressActionResult = {
  ok: boolean;
  error?: string;
};

export async function startLesson(
  courseId: string,
  lessonId: string,
  courseSlug: string,
  lessonSlug: string
): Promise<ProgressActionResult> {
  return writeProgress(
    "start_entitled_lesson",
    courseId,
    lessonId,
    courseSlug,
    lessonSlug
  );
}

export async function completeLesson(
  courseId: string,
  lessonId: string,
  courseSlug: string,
  lessonSlug: string
): Promise<ProgressActionResult> {
  return writeProgress(
    "complete_entitled_lesson",
    courseId,
    lessonId,
    courseSlug,
    lessonSlug
  );
}

async function writeProgress(
  functionName: "start_entitled_lesson" | "complete_entitled_lesson",
  courseId: string,
  lessonId: string,
  courseSlug: string,
  lessonSlug: string
): Promise<ProgressActionResult> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return {
      ok: false,
      error: "Inicia sesión para guardar tu progreso.",
    };
  }

  const [courseResult, lessonResult] = await Promise.all([
    supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .eq("slug", courseSlug)
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("course_lessons")
      .select("id, course_id, module_id, is_preview")
      .eq("id", lessonId)
      .eq("course_id", courseId)
      .eq("slug", lessonSlug)
      .eq("status", "published")
      .maybeSingle(),
  ]);

  if (
    courseResult.error ||
    lessonResult.error ||
    !courseResult.data ||
    !lessonResult.data
  ) {
    console.error("Error validando la lección para progreso:", {
      courseError: courseResult.error,
      lessonError: lessonResult.error,
    });

    return {
      ok: false,
      error: "Esta lección no está disponible para guardar progreso.",
    };
  }

  const { data: courseModule, error: moduleError } = await supabase
    .from("course_modules")
    .select("id")
    .eq("id", lessonResult.data.module_id)
    .eq("course_id", courseId)
    .eq("status", "published")
    .maybeSingle();

  if (moduleError || !courseModule) {
    console.error("Error validando el módulo para progreso:", moduleError);
    return {
      ok: false,
      error: "Esta lección no está disponible para guardar progreso.",
    };
  }

  const billing = await getBillingAccess();
  const entitled = billing.regularAccess && courseResult.data.billing_access === "regular";
  if (courseResult.data.content_type === "quick_guide" || (!lessonResult.data.is_preview && !entitled)) {
    return { ok: false, error: "Esta lección requiere acceso vigente." };
  }

  const { error } = await supabase.rpc(functionName, {
    p_course_id: courseId,
    p_lesson_id: lessonId,
  });

  if (error) {
    console.error("Error guardando el progreso de la lección:", error);
    return {
      ok: false,
      error: "No pudimos guardar tu progreso. Inténtalo de nuevo.",
    };
  }

  const lessonPath = `/cursos/${courseSlug}/lecciones/${lessonSlug}`;
  revalidatePath(lessonPath);
  revalidatePath(`/cursos/${courseSlug}`);
  revalidatePath("/cuenta");
  revalidatePath("/admin");

  return { ok: true };
}
