// Creates a time-limited, deployment-scoped Vercel Shareable Link.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEAM_ID = "team_f1R9cvcBhfWj6XPgMiUeEczG";
const PROJECT_ID = "prj_JWPAu87qoRstiV6YOmcEStMU6kow";
const deploymentId = process.env.FILMATTA_PRODUCTION_DEPLOYMENT_ID;
const preview = process.env.FILMATTA_PRODUCTION_PREVIEW;
const shareTarget = process.env.FILMATTA_PRODUCTION_SHARE_TARGET ?? deploymentId;
assert.match(deploymentId ?? "", /^dpl_[A-Za-z0-9]+$/u, "Deployment id required.");
assert.match(preview ?? "", /^https:\/\/(?:app-[a-z0-9]+|production-assistant-v1)-filmatta\.vercel\.app$/u, "Preview URL required.");
assert.match(shareTarget ?? "", /^(?:dpl_[A-Za-z0-9]+|[a-z0-9-]+\.vercel\.app)$/u, "Share target required.");

const auth = JSON.parse(fs.readFileSync(`${process.env.APPDATA}/com.vercel.cli/Data/auth.json`, "utf8"));
const endpoint = `https://api.vercel.com/aliases/${encodeURIComponent(shareTarget)}/protection-bypass?teamId=${TEAM_ID}`;
const response = await fetch(endpoint, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ ttl: 604800 }),
  signal: AbortSignal.timeout(20_000),
});
let result = await response.json().catch(() => ({}));
if (response.status === 409 && result.error?.code === "protection_bypass_conflict") {
  const existing = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${TEAM_ID}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(existing.ok, true, `Existing Shareable Link lookup failed (${existing.status}).`);
  result = await existing.json();
} else {
  assert.equal(response.ok, true, `Vercel Shareable Link failed (${response.status}, ${result.error?.code ?? "unknown"}).`);
}
const directUrl = result.protectionBypassUrl ? new URL(result.protectionBypassUrl) : null;
const scopedSecret = directUrl?.searchParams.get("_vercel_share") ?? findShareableSecret(result);
assert.ok(scopedSecret, "Vercel did not return a deployment-scoped Shareable Link.");
const shareUrl = directUrl ?? new URL(`${preview}/?_vercel_share=${encodeURIComponent(scopedSecret)}`);
assert.equal(shareUrl.origin, preview);
assert.ok(shareUrl.searchParams.get("_vercel_share"), "Shareable Link secret missing.");

const manifestPath = path.join(os.tmpdir(), "filmatta-production-preview-share.json");
fs.writeFileSync(manifestPath, JSON.stringify({ projectId: PROJECT_ID, deploymentId, preview, shareUrl: shareUrl.href, expiresInSeconds: 604800 }));
console.log(JSON.stringify({ shareUrl: shareUrl.href, deploymentId, expiresInSeconds: 604800 }));

function findShareableSecret(value) {
  if (!value || typeof value !== "object") return null;
  if (value.protectionBypass && typeof value.protectionBypass === "object") {
    const match = Object.entries(value.protectionBypass).find(([, details]) => details?.scope === "shareable-link");
    if (match) return match[0];
  }
  for (const child of Object.values(value)) {
    const match = findShareableSecret(child);
    if (match) return match;
  }
  return null;
}
