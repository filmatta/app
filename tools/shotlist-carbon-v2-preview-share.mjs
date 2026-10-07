// Deployment-scoped Vercel review access; never prints the share secret.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEAM_ID = "team_f1R9cvcBhfWj6XPgMiUeEczG";
const deploymentId = process.env.FILMATTA_SHOTLIST_V2_DEPLOYMENT_ID;
const preview = process.env.FILMATTA_SHOTLIST_V2_PREVIEW;
assert.match(deploymentId ?? "", /^dpl_[A-Za-z0-9]+$/u);
assert.match(preview ?? "", /^https:\/\/app-[a-z0-9]+-filmatta\.vercel\.app$/u);
const auth = JSON.parse(fs.readFileSync(`${process.env.APPDATA}/com.vercel.cli/Data/auth.json`, "utf8"));
const endpoint = `https://api.vercel.com/aliases/${deploymentId}/protection-bypass?teamId=${TEAM_ID}`;
const response = await fetch(endpoint, {
  method: "PATCH", headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ ttl: 604800 }), signal: AbortSignal.timeout(20_000),
});
let result = await response.json().catch(() => ({}));
if (response.status === 409 && result.error?.code === "protection_bypass_conflict") {
  const existing = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${TEAM_ID}`, {
    headers: { Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(20_000),
  });
  assert.equal(existing.ok, true, `Share lookup failed (${existing.status}).`);
  result = await existing.json();
} else assert.equal(response.ok, true, `Share creation failed (${response.status}).`);
const direct = result.protectionBypassUrl ? new URL(result.protectionBypassUrl) : null;
const secret = direct?.searchParams.get("_vercel_share") ?? findSecret(result);
assert.ok(secret, "Deployment-scoped share secret unavailable.");
const share = direct ?? new URL(`${preview}/?_vercel_share=${encodeURIComponent(secret)}`);
assert.equal(share.origin, preview);
const manifestPath = path.join(os.tmpdir(), "filmatta-shotlist-carbon-v2-preview-share.json");
fs.writeFileSync(manifestPath, JSON.stringify({ preview, deploymentId, shareUrl: share.href, expiresInSeconds: 604800 }));
console.log(JSON.stringify({ deploymentId, preview, shareReady: true, expiresInSeconds: 604800 }));

function findSecret(value) {
  if (!value || typeof value !== "object") return null;
  if (value.protectionBypass && typeof value.protectionBypass === "object") {
    const match = Object.entries(value.protectionBypass).find(([, details]) => details?.scope === "shareable-link");
    if (match) return match[0];
  }
  for (const child of Object.values(value)) {
    const found = findSecret(child);
    if (found) return found;
  }
  return null;
}
