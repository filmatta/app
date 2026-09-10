"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSafePostAuthPath } from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = getSafePostAuthPath(formData.get("next"));

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(
      getAuthFeedbackUrl("/login", nextPath, {
        error: "Credenciales incorrectas",
      })
    );
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const nextPath = getSafePostAuthPath(formData.get("next"));
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");

  if (!email || password.length < 8) {
    redirect(
      getAuthFeedbackUrl("/registro", nextPath, {
        error: "Usa un correo válido y una contraseña de al menos 8 caracteres.",
      })
    );
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
      emailRedirectTo: origin
        ? `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
        : undefined,
    },
  });

  if (error) {
    console.error("Error registrando usuario:", error);
    redirect(
      getAuthFeedbackUrl("/registro", nextPath, {
        error: "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.",
      })
    );
  }

  revalidatePath("/", "layout");

  if (data.session) {
    redirect(nextPath);
  }

  redirect(
    getAuthFeedbackUrl("/login", nextPath, {
      message: "Revisa tu correo para confirmar la cuenta y después inicia sesión.",
    })
  );
}

function getAuthFeedbackUrl(
  pathname: "/login" | "/registro",
  nextPath: string,
  feedback: { error?: string; message?: string }
) {
  const searchParams = new URLSearchParams({ next: nextPath });

  if (feedback.error) {
    searchParams.set("error", feedback.error);
  }

  if (feedback.message) {
    searchParams.set("message", feedback.message);
  }

  return `${pathname}?${searchParams.toString()}`;
}
