import assert from "node:assert/strict";
import { test } from "node:test";
import load from "./load.mjs";

const previewEnv = {
  VERCEL_ENV: "preview",
  MUX_EXPECTED_ENVIRONMENT_ID: "env-development-fixture",
  MUX_EXPECTED_ENVIRONMENT_TYPE: "development",
  MUX_TOKEN_ID: "token-development-fixture",
  MUX_TOKEN_SECRET: "secret-development-fixture",
};

const productionEnv = {
  VERCEL_ENV: "production",
  MUX_EXPECTED_ENVIRONMENT_ID: "env-production-fixture",
  MUX_EXPECTED_ENVIRONMENT_TYPE: "production",
  MUX_TOKEN_ID: "token-production-fixture",
  MUX_TOKEN_SECRET: "secret-production-fixture",
};

function identity(overrides = {}) {
  return {
    environment_id: "env-development-fixture",
    environment_type: "development",
    permissions: ["video:read", "video:write"],
    ...overrides,
  };
}

function client(result = identity()) {
  return {
    system: {
      utilities: {
        whoami: async () => result,
      },
    },
  };
}

test("Preview accepts only the expected development environment", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  const result = await assertMuxEnvironment(client(), undefined, previewEnv);
  assert.equal(result.environment_id, previewEnv.MUX_EXPECTED_ENVIRONMENT_ID);
  assert.equal(result.environment_type, "development");
});

test("Production accepts only the expected production environment", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  const result = await assertMuxEnvironment(
    client(identity({
      environment_id: "env-production-fixture",
      environment_type: "production",
    })),
    undefined,
    productionEnv,
  );
  assert.equal(result.environment_id, productionEnv.MUX_EXPECTED_ENVIRONMENT_ID);
  assert.equal(result.environment_type, "production");
});

test("Production rejects a Preview/development configuration before whoami", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  let calls = 0;
  const mux = client();
  mux.system.utilities.whoami = async () => {
    calls++;
    return identity();
  };

  await assert.rejects(
    assertMuxEnvironment(mux, undefined, { ...previewEnv, VERCEL_ENV: "production" }),
    /Production requires a production environment/,
  );
  assert.equal(calls, 0);
});

test("Preview rejects a Production configuration before whoami", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  let calls = 0;
  const mux = client();
  mux.system.utilities.whoami = async () => {
    calls++;
    return identity();
  };

  await assert.rejects(
    assertMuxEnvironment(mux, undefined, { ...productionEnv, VERCEL_ENV: "preview" }),
    /production credentials are not allowed outside Production/,
  );
  assert.equal(calls, 0);
});

test("a mismatched environment ID fails closed", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  await assert.rejects(
    assertMuxEnvironment(
      client(identity({ environment_id: "env-other-fixture" })),
      undefined,
      previewEnv,
    ),
    /unexpected environment/,
  );
});

test("a mismatched environment type fails closed", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  await assert.rejects(
    assertMuxEnvironment(
      client(identity({ environment_type: "production" })),
      undefined,
      previewEnv,
    ),
    /unexpected environment type/,
  );
});

test("missing expected environment configuration fails closed", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  const withoutId = { ...previewEnv };
  const withoutType = { ...previewEnv };
  delete withoutId.MUX_EXPECTED_ENVIRONMENT_ID;
  delete withoutType.MUX_EXPECTED_ENVIRONMENT_TYPE;

  await assert.rejects(
    assertMuxEnvironment(client(), undefined, withoutId),
    /expected environment ID is not configured/,
  );
  await assert.rejects(
    assertMuxEnvironment(client(), undefined, withoutType),
    /expected environment type is not configured/,
  );
});

test("whoami failure and insufficient permissions fail closed", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  const unavailable = client();
  unavailable.system.utilities.whoami = async () => {
    throw new Error("fixture failure");
  };

  await assert.rejects(
    assertMuxEnvironment(unavailable, undefined, previewEnv),
    /identity could not be verified/,
  );
  await assert.rejects(
    assertMuxEnvironment(
      client(identity({ permissions: ["video:read"] })),
      undefined,
      previewEnv,
    ),
    /required permissions/,
  );
});

test("validation is cached only for an identical environment snapshot", async () => {
  const { assertMuxEnvironment } = load("lib/mux/environment.ts");
  let previewCalls = 0;
  const previewClient = client();
  previewClient.system.utilities.whoami = async () => {
    previewCalls++;
    return identity();
  };

  await assertMuxEnvironment(previewClient, undefined, previewEnv);
  await assertMuxEnvironment(previewClient, undefined, previewEnv);
  assert.equal(previewCalls, 1);

  let productionCalls = 0;
  const productionClient = client();
  productionClient.system.utilities.whoami = async () => {
    productionCalls++;
    return identity({
      environment_id: "env-production-fixture",
      environment_type: "production",
    });
  };
  await assertMuxEnvironment(productionClient, undefined, productionEnv);
  assert.equal(productionCalls, 1);
});
