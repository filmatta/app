import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyWriterProviderFailure,
  writerProviderFailureSettlement,
  writerProviderLedgerErrorCode,
} from "../../lib/writer/provider-diagnostics.ts";

test("provider failures preserve safe upstream status, code, parameter and request id", () => {
  const diagnostic = classifyWriterProviderFailure({
    name: "BadRequestError",
    status: 400,
    code: "invalid_parameter",
    type: "invalid_request_error",
    param: "text.format.schema",
    requestID: "req_safe-123",
    message: "must never be logged",
  }, { outboundAttempted: true });
  assert.deepEqual(diagnostic, {
    providerStatus: 400,
    providerErrorCode: "invalid_parameter",
    providerErrorType: "invalid_request_error",
    providerErrorParam: "text.format.schema",
    providerRequestId: "req_safe-123",
    failureOrigin: "provider",
  });
  assert.equal(writerProviderLedgerErrorCode(diagnostic), "provider_400_invalid_parameter");
});

test("authentication, permission, model, rate, quota and server failures remain distinguishable", () => {
  for (const [status, code] of [[401, "invalid_api_key"], [403, "permission_denied"], [404, "model_not_found"], [429, "rate_limit_exceeded"], [500, "server_error"]] as const) {
    const diagnostic = classifyWriterProviderFailure({ name: "APIError", status, code }, { outboundAttempted: true });
    assert.equal(diagnostic.providerStatus, status);
    assert.equal(diagnostic.providerErrorCode, code);
    assert.equal(diagnostic.failureOrigin, "provider");
  }
});

test("network, timeout, caller abort and pre-provider failures have separate origins", () => {
  assert.equal(classifyWriterProviderFailure({ name: "APIConnectionError" }, { outboundAttempted: true }).failureOrigin, "network");
  assert.equal(classifyWriterProviderFailure({ name: "APIConnectionTimeoutError" }, { outboundAttempted: true }).failureOrigin, "timeout");
  assert.equal(classifyWriterProviderFailure({ name: "AbortError" }, { outboundAttempted: true, aborted: true }).failureOrigin, "caller_abort");
  assert.equal(classifyWriterProviderFailure({ code: "storage_failed" }, { outboundAttempted: false }).failureOrigin, "pre_provider");
});

test("missing usage after an outbound attempt holds the conservative reservation", () => {
  const metadata = classifyWriterProviderFailure({ status: 400, code: "invalid_parameter" }, { outboundAttempted: true });
  assert.deepEqual(writerProviderFailureSettlement({
    metadata,
    outboundAttempted: true,
    usageReceived: false,
    maximumCostMicrousd: 7_500,
    measuredCostMicrousd: 0,
  }), {
    status: "uncertain",
    costMicrousd: 7_500,
    errorCode: "provider_400_invalid_parameter",
  });
  assert.deepEqual(writerProviderFailureSettlement({
    metadata,
    outboundAttempted: true,
    usageReceived: true,
    maximumCostMicrousd: 7_500,
    measuredCostMicrousd: 311,
  }), {
    status: "failed",
    costMicrousd: 311,
    errorCode: "provider_400_invalid_parameter",
  });
});

test("diagnostic route is Preview-only, user-allowlisted, fixed-input and retry-free", async () => {
  const [server, route] = await Promise.all([
    readFile(new URL("../../lib/writer/provider-connectivity-diagnostic-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/writer/scripts/[id]/provider-diagnostic/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(server, /process\.env\.VERCEL_ENV !== "preview"/u);
  assert.match(server, /WRITER_PROVIDER_DIAGNOSTIC_ENABLED/u);
  assert.match(server, /WRITER_PROVIDER_DIAGNOSTIC_QA_USER_IDS/u);
  assert.match(server, /Responde exactamente OK\./u);
  assert.match(server, /store: false/u);
  assert.match(server, /maxRetries: 0/u);
  assert.match(server, /reasoning: \{ effort: "none" \}/u);
  assert.match(server, /DIAGNOSTIC_KINDS = \["minimal", "structured"\]/u);
  assert.match(server, /writer_smart_tool_operations/u);
  assert.doesNotMatch(route, /model|prompt|input/u);
  assert.match(route, /writerApiSession/u);
});

test("diagnostic logs whitelist metadata and never include messages or bodies", async () => {
  const source = await readFile(new URL("../../lib/writer/provider-diagnostics.ts", import.meta.url), "utf8");
  for (const field of ["diagnostic_run_id", "operation_id", "deployment_id", "feature", "stage", "outbound_attempted", "requested_model", "provider_status", "provider_error_code", "provider_error_type", "provider_error_param", "provider_request_id", "elapsed_ms", "usage_received", "failure_origin"]) {
    assert.match(source, new RegExp(field, "u"));
  }
  assert.doesNotMatch(source, /error\.message|response_body_text|prompt|script_text/u);
});
