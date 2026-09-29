export type AssistedImportAnalysisStatus = "complete" | "partial" | "unusable";

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

export function writerImportCompletionMessage(input: {
  mode: string;
  analysisStatus: AssistedImportAnalysisStatus;
  identityCount: number;
  sceneCount: number;
  characterHeadingCount: number;
  blockCount: number;
  observationCount: number;
}) {
  if (input.mode !== "ai") {
    return `Importación completada · ${input.sceneCount} escenas · ${input.characterHeadingCount} encabezados de personaje · ${input.blockCount} bloques.`;
  }
  if (input.analysisStatus === "unusable") {
    return "Tu guion se importó completo. No pudimos vincular el análisis de personajes a sus fragmentos.";
  }
  if (input.analysisStatus === "partial") {
    return "Tu guion se importó completo. Vinculamos algunas referencias de personajes; otras quedaron pendientes.";
  }
  if (input.identityCount === 0) {
    return "Guion importado completo. El análisis terminó sin referencias de personajes.";
  }
  return `Guion importado · ${input.sceneCount} escenas · ${input.characterHeadingCount} encabezados de personaje · ${input.blockCount} bloques${input.observationCount ? ` · ${input.observationCount} observaciones opcionales de formato` : ""}.`;
}
