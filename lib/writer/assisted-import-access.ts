export function checkAssistedImportAccess(
  environment: { [key: string]: string | undefined },
  userId: string,
) {
  if (environment.WRITER_AI_IMPORT_ENABLED !== "true") {
    return { enabled: false, reason: "La importación asistida está desactivada en este entorno." } as const;
  }
  if (!environment.OPENAI_API_KEY) {
    return { enabled: false, reason: "La integración de OpenAI todavía no está configurada en este Preview." } as const;
  }
  const allowed = new Set((environment.WRITER_AI_IMPORT_QA_USER_IDS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean));
  if (!allowed.has(userId)) {
    return { enabled: false, reason: "Esta beta está limitada a usuarios de QA autorizados." } as const;
  }
  return { enabled: true, reason: null } as const;
}
