import "server-only";

const REQUIRED_MUX_PERMISSIONS = ["video:read", "video:write"] as const;

export type MuxEnvironmentType = "development" | "production";

export type MuxEnvironmentExpectation = {
  id: string;
  type: MuxEnvironmentType;
};

type MuxWhoami = {
  environment_id: string;
  environment_type: string;
  permissions: string[];
};

type MuxWhoamiClient = {
  system: {
    utilities: {
      whoami(): Promise<MuxWhoami>;
    };
  };
};

type ValidationSnapshot = MuxEnvironmentExpectation & {
  tokenId: string;
  tokenSecret: string;
  vercelEnvironment: string;
  permissions: string;
};

type ValidationCache = {
  snapshot: ValidationSnapshot;
  promise: Promise<MuxWhoami>;
};

let validationCache: ValidationCache | null = null;

export function getMuxEnvironmentExpectation(
  env: Record<string, string | undefined> = process.env,
): MuxEnvironmentExpectation {
  const id = env.MUX_EXPECTED_ENVIRONMENT_ID?.trim();
  const type = env.MUX_EXPECTED_ENVIRONMENT_TYPE?.trim();

  if (!id) {
    throw new Error("Mux expected environment ID is not configured.");
  }

  if (type !== "development" && type !== "production") {
    throw new Error("Mux expected environment type is not configured.");
  }

  const vercelEnvironment = env.VERCEL_ENV?.trim();
  if (vercelEnvironment === "production" && type !== "production") {
    throw new Error("Mux Production requires a production environment.");
  }

  if (vercelEnvironment !== "production" && type === "production") {
    throw new Error("Mux production credentials are not allowed outside Production.");
  }

  return { id, type };
}

export async function assertMuxEnvironment(
  mux: MuxWhoamiClient,
  requiredPermissions: readonly string[] = REQUIRED_MUX_PERMISSIONS,
  env: Record<string, string | undefined> = process.env,
) {
  const expectation = getMuxEnvironmentExpectation(env);
  const tokenId = env.MUX_TOKEN_ID?.trim();
  const tokenSecret = env.MUX_TOKEN_SECRET?.trim();

  if (!tokenId || !tokenSecret) {
    throw new Error("Mux API credentials are not configured.");
  }

  const permissions = [...new Set(requiredPermissions)].sort();
  const snapshot: ValidationSnapshot = {
    ...expectation,
    tokenId,
    tokenSecret,
    vercelEnvironment: env.VERCEL_ENV?.trim() ?? "",
    permissions: permissions.join(","),
  };

  if (validationCache && sameSnapshot(validationCache.snapshot, snapshot)) {
    return validationCache.promise;
  }

  const promise = validateMuxEnvironment(mux, expectation, permissions);
  validationCache = { snapshot, promise };

  try {
    return await promise;
  } catch (error) {
    if (validationCache?.promise === promise) {
      validationCache = null;
    }
    throw error;
  }
}

async function validateMuxEnvironment(
  mux: MuxWhoamiClient,
  expectation: MuxEnvironmentExpectation,
  requiredPermissions: readonly string[],
) {
  let identity: MuxWhoami;

  try {
    identity = await mux.system.utilities.whoami();
  } catch {
    throw new Error("Mux environment identity could not be verified.");
  }

  if (identity.environment_id !== expectation.id) {
    throw new Error("Mux credentials belong to an unexpected environment.");
  }

  if (identity.environment_type !== expectation.type) {
    throw new Error("Mux credentials have an unexpected environment type.");
  }

  const grantedPermissions = new Set(identity.permissions);
  if (!requiredPermissions.every((permission) => grantedPermissions.has(permission))) {
    throw new Error("Mux credentials do not have the required permissions.");
  }

  return identity;
}

function sameSnapshot(first: ValidationSnapshot, second: ValidationSnapshot) {
  return (
    first.id === second.id &&
    first.type === second.type &&
    first.tokenId === second.tokenId &&
    first.tokenSecret === second.tokenSecret &&
    first.vercelEnvironment === second.vercelEnvironment &&
    first.permissions === second.permissions
  );
}
