export type AssistedImportAnalysisStatus = "complete" | "partial" | "unusable";
export type AssistedImportRecoverySkippedReason =
  | "recovery_budget_unavailable"
  | "recovery_call_limit_unavailable";

export function determineAssistedImportAnalysisStatus(input: {
  incomplete: boolean;
  validationIssueCount: number;
  usableResultCount: number;
}): AssistedImportAnalysisStatus {
  if (!input.incomplete && input.validationIssueCount === 0) return "complete";
  return input.usableResultCount > 0 ? "partial" : "unusable";
}

export function parseAssistedImportAnalysisStatus(
  value: unknown,
  fallback: AssistedImportAnalysisStatus = "complete",
): AssistedImportAnalysisStatus {
  return value === "complete" || value === "partial" || value === "unusable" ? value : fallback;
}

export function assistedImportAnalysisVersion(input: {
  version: string;
  status: AssistedImportAnalysisStatus;
  recoverySkippedReason?: AssistedImportRecoverySkippedReason | null;
}) {
  return `${input.version}/${input.status}${input.recoverySkippedReason ? `;${input.recoverySkippedReason}` : ""}`;
}

export function parseAssistedImportAnalysisVersion(value: unknown): {
  status: AssistedImportAnalysisStatus;
  recoverySkippedReason: AssistedImportRecoverySkippedReason | null;
} {
  if (typeof value !== "string") return { status: "partial", recoverySkippedReason: null };
  const detail = value.split("/").at(-1) ?? "";
  const [rawStatus, ...markers] = detail.split(";");
  return {
    status: parseAssistedImportAnalysisStatus(rawStatus, "partial"),
    recoverySkippedReason: markers.includes("recovery_budget_unavailable")
      ? "recovery_budget_unavailable"
      : markers.includes("recovery_call_limit_unavailable")
        ? "recovery_call_limit_unavailable"
        : null,
  };
}

export function recoverySkippedReasonForErrorCode(code: string): AssistedImportRecoverySkippedReason | null {
  if (code === "budget" || code === "global_budget") return "recovery_budget_unavailable";
  if (code === "call_limit") return "recovery_call_limit_unavailable";
  return null;
}

export function writerImportCompletionMessage(input: {
  mode: string;
  analysisStatus: AssistedImportAnalysisStatus;
  identityCount: number;
  sceneCount: number;
  characterHeadingCount: number;
  blockCount: number;
  observationCount: number;
  recoverySkippedReason?: AssistedImportRecoverySkippedReason | null;
}) {
  if (input.mode !== "ai") {
    return `Importación completada · ${input.sceneCount} escenas · ${input.characterHeadingCount} encabezados de personaje · ${input.blockCount} bloques.`;
  }
  if (input.analysisStatus === "unusable") {
    return "Tu guion se importó completo. No pudimos vincular el análisis de personajes a sus fragmentos.";
  }
  if (input.analysisStatus === "partial") {
    if (input.recoverySkippedReason) {
      return "Guion importado. Algunas referencias del análisis quedaron pendientes por el límite de uso.";
    }
    return "Tu guion se importó completo. Vinculamos algunas referencias de personajes; otras quedaron pendientes.";
  }
  if (input.identityCount === 0) {
    return "Guion importado completo. El análisis terminó sin referencias de personajes.";
  }
  return `Guion importado · ${input.sceneCount} escenas · ${input.characterHeadingCount} encabezados de personaje · ${input.blockCount} bloques${input.observationCount ? ` · ${input.observationCount} observaciones opcionales de formato` : ""}.`;
}
