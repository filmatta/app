"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSafePostAuthPath } from "@/lib/auth/safe-next-path";
import { getAuthCallbackOrigin } from "@/lib/auth/callback-origin";
import { authErrorDiagnostics, isAuthRequestRateLimit, isEmailRateLimit } from "@/lib/auth/feedback";
import { createClient } from "@/lib/supabase/server";
import { allowAuthAttempt } from "@/lib/security/auth-rate-limit";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = getSafePostAuthPath(formData.get("next"));

  if (!(await allowAuthAttempt("login", email))) {
    redirect(getAuthFeedbackUrl("/login", nextPath, { error: "login_limited" }));
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(
      getAuthFeedbackUrl("/login", nextPath, {
        error: "login_failed",
      })
    );
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}

export async function signInWithGoogle(formData: FormData) {
  const nextPath = getSafePostAuthPath(formData.get("next"));
  const requestHeaders = await headers();
  const callbackUrl = getOAuthCallbackUrl(getAuthCallbackOrigin(requestHeaders), nextPath);

  if (!callbackUrl) {
    redirect(
      getAuthFeedbackUrl("/login", nextPath, {
        error: "No pudimos iniciar sesión con Google. Inténtalo de nuevo.",
      }),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
    },
  });

  if (error || !data.url) {
    console.error("Error iniciando OAuth con Google:", error);
    redirect(
      getAuthFeedbackUrl("/login", nextPath, {
        error: "No pudimos iniciar sesión con Google. Inténtalo de nuevo.",
      }),
    );
  }

  redirect(data.url);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const nextPath = getSafePostAuthPath(formData.get("next"));
  const requestHeaders = await headers();
  const origin = getAuthCallbackOrigin(requestHeaders);

  if (!(await allowAuthAttempt("signup", email))) {
    console.warn("Auth signup blocked", { source: "filmatta.auth-budget" });
    redirect(getAuthFeedbackUrl("/registro", nextPath, { error: "signup_attempt_limited" }));
  }

  if (!isValidEmail(email) || password.length < 8) {
    redirect(
      getAuthFeedbackUrl("/registro", nextPath, {
        error: "signup_invalid",
      })
    );
  }

  if (!origin) {
    redirect(getAuthFeedbackUrl("/registro", nextPath, { error: "signup_failed" }));
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    console.error("Auth signup failed", { source: "supabase.auth.signUp", ...authErrorDiagnostics(error) });
    redirect(
      getAuthFeedbackUrl("/registro", nextPath, {
        error: isEmailRateLimit(error) ? "signup_limited"
          : isAuthRequestRateLimit(error) ? "signup_attempt_limited" : "signup_failed",
      })
    );
  }

  revalidatePath("/", "layout");

  if (data.session) {
    redirect(nextPath);
  }

  redirect(
    getAuthFeedbackUrl("/login", nextPath, {
      message: "check_email",
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

function getOAuthCallbackUrl(origin: string | null, nextPath: string) {
  if (!origin) return null;

  try {
    const url = new URL("/auth/callback", origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    url.searchParams.set("next", nextPath);
    return url.toString();
  } catch {
    return null;
  }
}

function isValidEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
