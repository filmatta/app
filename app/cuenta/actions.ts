"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSafeNextPath } from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";

export async function updatePersonalProfile(formData: FormData) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (
    fullName.length < 2 ||
    fullName.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(fullName)
  ) {
    redirect(accountFeedback("profile_error", "Usa un nombre de 2 a 80 caracteres", "perfil"));
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      full_name: fullName,
    },
  });

  if (error) {
    console.error("Error actualizando el nombre del usuario:", error);
    redirect(accountFeedback("profile_error", "No pudimos guardar tu nombre", "perfil"));
  }

  revalidatePath("/", "layout");
  revalidatePath("/cuenta");
  redirect(accountFeedback("profile", "saved", "perfil"));
}

export async function requestEmailChange(formData: FormData) {
  const supabase = await createClient();
  await requireUser(supabase);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const origin = (await headers()).get("origin");

  if (!isValidEmail(email)) {
    redirect(accountFeedback("email_error", "Escribe un correo válido", "configuracion"));
  }

  const confirmedPath = "/cuenta?email=confirmed#configuracion";
  const { error } = await supabase.auth.updateUser(
    { email },
    origin
      ? {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(confirmedPath)}`,
        }
      : undefined
  );

  if (error) {
    console.error("Error iniciando el cambio de correo:", error);
    redirect(
      accountFeedback(
        "email_error",
        "No pudimos iniciar el cambio de correo",
        "configuracion"
      )
    );
  }

  redirect(accountFeedback("email", "confirmation", "configuracion"));
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Error cerrando la sesión:", error);
    redirect(accountFeedback("session_error", "No pudimos cerrar la sesión", "cerrar-sesion"));
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nextPath = getSafeNextPath(formData.get("next"), "/cuenta");
  const origin = (await headers()).get("origin");

  if (isValidEmail(email) && origin) {
    const resetPage = `/restablecer-contrasena?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(resetPage)}`,
    });

    if (error) {
      console.error("Error solicitando recuperación de contraseña:", error);
    }
  }

  const searchParams = new URLSearchParams({
    next: nextPath,
    sent: "1",
  });
  redirect(`/recuperar-contrasena?${searchParams.toString()}`);
}

export async function updateAccountPassword(formData: FormData) {
  const supabase = await createClient();
  await requireUser(supabase);
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  const validationError = validateNewPassword(password, confirmation);

  if (validationError) {
    redirect(accountFeedback("password_error", validationError, "configuracion"));
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("Error actualizando la contraseña de la cuenta:", error);
    redirect(
      accountFeedback(
        "password_error",
        "No pudimos actualizar la contraseña",
        "configuracion"
      )
    );
  }

  revalidatePath("/", "layout");
  redirect(accountFeedback("password", "updated", "configuracion"));
}

export async function updateRecoveredPassword(formData: FormData) {
  const supabase = await createClient();
  await requireUser(supabase, "/restablecer-contrasena");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  const nextPath = getSafeNextPath(formData.get("next"), "/cuenta");
  const validationError = validateNewPassword(password, confirmation);

  if (validationError) {
    redirect(passwordFeedback(nextPath, validationError));
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("Error actualizando la contraseña:", error);
    redirect(passwordFeedback(nextPath, "No pudimos actualizar la contraseña"));
  }

  revalidatePath("/", "layout");

  if (nextPath === "/cuenta") {
    redirect(accountFeedback("password", "updated", "configuracion"));
  }

  redirect(nextPath);
}

async function requireUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nextPath = "/cuenta"
) {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return data.user;
}

function isValidEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8) {
    return "Usa al menos 8 caracteres";
  }

  if (password !== confirmation) {
    return "Las contraseñas no coinciden";
  }

  return null;
}

function accountFeedback(key: string, value: string, anchor: string) {
  const searchParams = new URLSearchParams({ [key]: value });
  return `/cuenta?${searchParams.toString()}#${anchor}`;
}

function passwordFeedback(nextPath: string, error: string) {
  const searchParams = new URLSearchParams({ next: nextPath, error });
  return `/restablecer-contrasena?${searchParams.toString()}`;
}
