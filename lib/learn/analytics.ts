export const LEARNING_ANALYTICS_RULES = {
  cohortActivityWindowDays: 30,
  minimumComparableUsers: 10,
  detailedPercentilesMinimumUsers: 100,
  percentileBands: [25, 10, 5],
} as const;

export type LearningComparisonMode =
  | "personal-only"
  | "simple-comparison"
  | "detailed-percentiles";

export function getLearningComparisonMode(
  comparableUsers: number
): LearningComparisonMode {
  if (comparableUsers < LEARNING_ANALYTICS_RULES.minimumComparableUsers) {
    return "personal-only";
  }

  if (
    comparableUsers <
    LEARNING_ANALYTICS_RULES.detailedPercentilesMinimumUsers
  ) {
    return "simple-comparison";
  }

  return "detailed-percentiles";
}
