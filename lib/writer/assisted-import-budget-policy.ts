export const WRITER_ASSISTED_IMPORT_DEFAULT_OPERATION_BUDGET_MICRO_USD = 200_000;
export const WRITER_ASSISTED_IMPORT_QA_GRANT_BUDGET_MICRO_USD = 600_000;
export const WRITER_ASSISTED_IMPORT_STAGING_OPERATION_BUDGET_MICRO_USD = 3_000_000;
export const WRITER_ASSISTED_IMPORT_DEFAULT_GLOBAL_BUDGET_MICRO_USD = 2_000_000;
export const WRITER_ASSISTED_IMPORT_STAGING_GLOBAL_BUDGET_MICRO_USD = 10_000_000;

const STAGING_REVIEW_POLICY = "staging-human-review-v1";

type BudgetPolicyEnvironment = Readonly<Record<string, string | undefined>>;

export type AssistedImportBudgetPolicy = Readonly<{
  operationBudgetMicroUsd: number;
  globalBudgetMicroUsd: number;
  name: "default" | "staging-human-review-v1";
}>;

/**
 * This switch is deliberately private and closed. The larger policy is only
 * valid on Vercel Preview deployments built from the staging branch. Unknown,
 * incomplete, local, and production configurations retain the product policy.
 */
export function assistedImportBudgetPolicy(
  environment: BudgetPolicyEnvironment = process.env,
): AssistedImportBudgetPolicy {
  const stagingReview = environment.WRITER_ASSISTED_IMPORT_BUDGET_POLICY === STAGING_REVIEW_POLICY
    && environment.VERCEL_ENV === "preview"
    && environment.VERCEL_GIT_COMMIT_REF === "staging";

  if (stagingReview) {
    return {
      operationBudgetMicroUsd: WRITER_ASSISTED_IMPORT_STAGING_OPERATION_BUDGET_MICRO_USD,
      globalBudgetMicroUsd: WRITER_ASSISTED_IMPORT_STAGING_GLOBAL_BUDGET_MICRO_USD,
      name: "staging-human-review-v1",
    };
  }

  return {
    operationBudgetMicroUsd: WRITER_ASSISTED_IMPORT_DEFAULT_OPERATION_BUDGET_MICRO_USD,
    globalBudgetMicroUsd: WRITER_ASSISTED_IMPORT_DEFAULT_GLOBAL_BUDGET_MICRO_USD,
    name: "default",
  };
}

export function isKnownAssistedImportOperationBudget(value: number): boolean {
  return value === WRITER_ASSISTED_IMPORT_DEFAULT_OPERATION_BUDGET_MICRO_USD
    || value === WRITER_ASSISTED_IMPORT_QA_GRANT_BUDGET_MICRO_USD
    || value === WRITER_ASSISTED_IMPORT_STAGING_OPERATION_BUDGET_MICRO_USD;
}
