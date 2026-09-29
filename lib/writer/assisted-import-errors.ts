export type AssistedImportDatabaseErrorDescriptor = {
  code: string;
  message: string;
  status: number;
};

export function assistedImportDatabaseErrorDescriptor(cause: unknown): AssistedImportDatabaseErrorDescriptor | null {
  const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
    ? cause.message
    : "";
  if (message.includes("WRITER_IMPORT_FREE_USED")) return { code: "free_used", message: "Esta cuenta ya utilizó su importación asistida gratuita.", status: 409 };
  if (message.includes("WRITER_IMPORT_ATTEMPTS")) return { code: "attempts", message: "Alcanzaste el límite de 3 intentos en 24 horas.", status: 429 };
  if (message.includes("WRITER_IMPORT_ACTIVE")) return { code: "active", message: "Ya hay una importación asistida en curso.", status: 409 };
  if (message.includes("WRITER_IMPORT_GLOBAL_BUDGET")) return { code: "global_budget", message: "El presupuesto de QA para importaciones asistidas está agotado.", status: 503 };
  if (message.includes("WRITER_IMPORT_CALL_LIMIT")) return { code: "call_limit", message: "Esta importación alcanzaría su límite de llamadas.", status: 409 };
  // Authorization must be matched before its WRITER_IMPORT_BUDGET prefix.
  if (message.includes("WRITER_IMPORT_BUDGET_AUTHORIZATION")) return { code: "budget_authorization", message: "Esta operación no tiene autorización para el presupuesto solicitado.", status: 409 };
  if (message.includes("WRITER_IMPORT_BUDGET")) return { code: "budget", message: "Esta importación alcanzaría su límite de costo.", status: 409 };
  if (message.includes("WRITER_QUOTA_REACHED")) return { code: "writer_quota", message: "Alcanzaste el límite de 3 guiones.", status: 409 };
  if (message.includes("OPERATION_REUSED") || message.includes("BATCH_REUSED")) return { code: "operation_reused", message: "El identificador de la operación ya fue usado con otro origen.", status: 409 };
  return null;
}
