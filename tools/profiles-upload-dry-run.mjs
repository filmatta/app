// Read-only, Test only. No original media, contact fields, signed URLs or tokens in output.
import { testContext, TEST_REF } from "./portfolio-test-context.mjs";
try {
  const c = await testContext();
  const { data, error } = await c.admin.from("profile_media")
    .select("id,status,visibility,mux_upload_id,mux_asset_id,mux_environment_id,expires_at")
    .eq("source", "mux").eq("mux_environment_id", c.muxEnv).limit(100);
  if (error) throw Error("Inventory unavailable");
  const report = [];
  for (const row of data ?? []) {
    if (!row.mux_upload_id) { report.push({ id: row.id, local: row.status, action: "review-binding" }); continue; }
    const response = await fetch(`https://api.mux.com/video/v1/uploads/${encodeURIComponent(row.mux_upload_id)}`, {
      headers: { Authorization: c.muxAuthorization }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) { report.push({ id: row.id, local: row.status, providerHttp: response.status, action: "review" }); continue; }
    const { data: upload } = await response.json();
    const matched = upload.new_asset_settings?.passthrough === `filmatta:portfolio:${row.id}`;
    report.push({ id: row.id, local: row.status, remote: upload.status,
      references: { upload: row.mux_upload_id, asset: row.mux_asset_id, receivedAsset: upload.asset_id ?? null },
      action: !matched ? "review-association" : upload.asset_id ? "preserve-and-reconcile" :
        ["cancelled", "timed_out", "errored"].includes(upload.status) ? "close-incomplete-attempt" : "preserve",
      reason: upload.asset_id ? "Received assets are never automatically deleted" : "Provider state, not browser background time",
    });
  }
  console.log(JSON.stringify({ project: TEST_REF, readOnly: true, report }, null, 2));
} catch { console.error("Test dry-run unavailable; no remote writes performed, details suppressed."); process.exitCode = 1; }
