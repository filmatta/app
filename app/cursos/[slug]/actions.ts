"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { getLearnContentType } from "@/lib/learn/content-type";
import { createClient } from "@/lib/supabase/server";

export async function enrollInCourse(
  courseId: string,
  courseSlug: string,
  returnPath: string
) {
  const coursePath = `/cursos/${courseSlug}`;
  const safeReturnPath = getCourseReturnPath(returnPath, coursePath);
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect(`/acceso?next=${encodeURIComponent(safeReturnPath)}`);
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .eq("slug", courseSlug)
    .eq("status", "published")
    .maybeSingle();

  if (courseError || !course) {
    console.error("Error validando el curso para inscripción:", courseError);
    redirect(withFeedback(safeReturnPath, "enrollment_error", "course"));
  }

  if (getLearnContentType(course) === "quick_guide") {
    redirect(safeReturnPath);
  }

  const { error } = await supabase.rpc("enroll_in_published_course", {
    p_course_id: course.id,
  });

  if (error) {
    console.error("Error creando la inscripción:", error);
    redirect(withFeedback(safeReturnPath, "enrollment_error", "save"));
  }

  revalidatePath(coursePath);
  revalidatePath(safeReturnPath.split(/[?#]/, 1)[0]);
  revalidatePath("/cuenta");
  revalidatePath("/admin");
  redirect(withFeedback(safeReturnPath, "enrolled", "1"));
}

function getCourseReturnPath(value: string, coursePath: string) {
  const fallback = `${coursePath}#course-decision`;
  const safePath = getSafeNextPath(value, fallback);
  const pathname = safePath.split(/[?#]/, 1)[0];

  if (
    pathname === coursePath ||
    pathname.startsWith(`${coursePath}/lecciones/`)
  ) {
    return safePath;
  }

  return fallback;
}

function withFeedback(path: string, key: string, value: string) {
  const [pathWithQuery, hash] = path.split("#", 2);
  const [pathname, query] = pathWithQuery.split("?", 2);
  const searchParams = new URLSearchParams(query ?? "");
  searchParams.set(key, value);

  return `${pathname}?${searchParams.toString()}${hash ? `#${hash}` : ""}`;
}
