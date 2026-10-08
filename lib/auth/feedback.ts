export type AuthFeedbackError =
  | "login_failed" | "login_limited" | "signup_invalid" | "signup_failed"
  | "signup_limited" | "confirmation_invalid" | "recovery_limited";

const errors: Record<AuthFeedbackError, string> = {
  login_failed: "No pudimos iniciar sesión. Revisa tus datos o confirma tu correo.",
  login_limited: "Hay demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
  signup_invalid: "Usa un correo válido y una contraseña de al menos 8 caracteres.",
  signup_failed: "No pudimos procesar el registro. Revisa los datos e inténtalo de nuevo.",
  signup_limited: "El envío de correos está temporalmente limitado. Espera y vuelve a intentarlo.",
  confirmation_invalid: "No pudimos confirmar la cuenta. Solicita un enlace nuevo.",
  recovery_limited: "El envío de correos está temporalmente limitado. Espera y vuelve a intentarlo.",
};

export function authFeedbackError(value: string | null | undefined): string | null {
  return value && Object.hasOwn(errors, value) ? errors[value as AuthFeedbackError] : null;
}

export function authFeedbackMessage(value: string | null | undefined): string | null {
  return value === "check_email"
    ? "Si la cuenta puede registrarse, recibirás un correo para confirmarla. Después podrás iniciar sesión."
    : null;
}

export function isEmailRateLimit(error: { code?: string; status?: number } | null): boolean {
  return error?.code === "over_email_send_rate_limit" || error?.status === 429;
}
