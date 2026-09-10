"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function enrollInCourse(courseId: string, courseSlug: string) {
  const coursePath = `/cursos/${courseSlug}`;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect(`/login?next=${encodeURIComponent(coursePath)}`);
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("id, slug")
    .eq("id", courseId)
    .eq("slug", courseSlug)
    .eq("status", "published")
    .maybeSingle();

  if (courseError || !course) {
    console.error("Error validando el curso para inscripción:", courseError);
    redirect(`${coursePath}?enrollment_error=course#course-decision`);
  }

  const { error } = await supabase.rpc("enroll_in_published_course", {
    p_course_id: course.id,
  });

  if (error) {
    console.error("Error creando la inscripción:", error);
    redirect(`${coursePath}?enrollment_error=save#course-decision`);
  }

  revalidatePath(coursePath);
  revalidatePath("/cuenta");
  revalidatePath("/admin");
  redirect(`${coursePath}?enrolled=1#course-decision`);
}
