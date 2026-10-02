export type PublicHomeVariant = "legacy" | "create";

/**
 * Rollback: change this value to "legacy". No routes, records or permissions
 * are migrated by the CREATE presentation.
 */
export const PUBLIC_HOME_VARIANT: PublicHomeVariant = "create";
