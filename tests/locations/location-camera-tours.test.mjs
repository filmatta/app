import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const limits = load("lib/locations/tour-limits.ts");
const migration = fs.readFileSync("supabase/migrations/20260928080000_location_camera_tours.sql", "utf8");
const recorder = fs.readFileSync("components/locations/LocationTourRecorder.tsx", "utf8");
const webhook = fs.readFileSync("app/api/mux/webhooks/route.ts", "utf8");
const form = fs.readFileSync("lib/locations/form.ts", "utf8");
const headers = fs.readFileSync("next.config.ts", "utf8");
const pilot = fs.readFileSync("lib/locations/camera-pilot.ts", "utf8");
const reserveRoute = fs.readFileSync("app/api/locations/tours/reserve/route.ts", "utf8");
const editor = fs.readFileSync("app/mis-locaciones/[id]/editar/page.tsx", "utf8");
const locationForm = fs.readFileSync("app/mis-locaciones/LocationForm.tsx", "utf8");

test("camera tour limits distinguish valid, empty, oversized and over-duration blobs", () => {
  assert.equal(limits.LOCATION_TOUR_MAX_DURATION_SECONDS, 180);
  assert.equal(limits.LOCATION_TOUR_AUTO_STOP_SECONDS, 178);
  assert.equal(limits.LOCATION_TOUR_MAX_BLOB_BYTES, 150_000_000);
  assert.equal(limits.locationTourBlobProblem({ size: 1, type: "video/webm" }, 180), null);
  assert.match(limits.locationTourBlobProblem({ size: 1, type: "video/webm" }, 180.001), /supera/);
  assert.match(limits.locationTourBlobProblem({ size: 0, type: "video/webm" }, 2), /no produjo/);
  assert.match(limits.locationTourBlobProblem({ size: 150_000_001, type: "video/mp4" }, 2), /150 MB/);
  assert.match(limits.locationTourBlobProblem({ size: 10, type: "video/quicktime" }, 2), /formato/);
});

test("recorder is camera-only and waits for the final stop event", () => {
  assert.match(recorder, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(recorder, /new MediaRecorder/);
  assert.match(recorder, /recorder\.ondataavailable/);
  assert.match(recorder, /recorder\.onstop = \(\) => finishRecording/);
  assert.match(recorder, /performance\.now\(\)/);
  assert.match(recorder, /muted playsInline autoPlay/);
  assert.doesNotMatch(recorder, /type="file"|capture=|youtube|vimeo/i);
});

test("camera startup keeps optional constraints flexible and reports safe failure stages", () => {
  assert.match(recorder, /deviceId: \{ ideal: requestedDevice \}/);
  assert.doesNotMatch(recorder, /deviceId: \{ exact:/);
  assert.match(recorder, /document\.visibilityState !== "visible"/);
  assert.match(recorder, /permissionsPolicy\.allowsFeature\("camera"\)/);
  assert.match(recorder, /OverconstrainedError/);
  assert.match(recorder, /NotFoundError/);
  assert.match(recorder, /NotReadableError/);
  assert.match(recorder, /Location tour camera failed/);
  assert.match(recorder, /stage,/);
  assert.doesNotMatch(recorder, /permissions\.query/);
});

test("database lifecycle serializes pending attempts and only promotes validated generations", () => {
  assert.match(migration, /unique index location_tour_one_pending/);
  assert.match(migration, /where status in \('authorizing','uploading','processing'\)/);
  assert.match(migration, /target\.tour_generation<>candidate\.generation/);
  assert.match(migration, /p_duration_seconds<=0 or p_duration_seconds>180/);
  assert.match(migration, /status='delete_pending'/);
  assert.match(migration, /active_tour_attempt_id=candidate\.id/);
  assert.match(migration, /Location tour state is server-managed/);
  assert.match(migration, /External location tours cannot be created/);
});

test("shared Mux webhook routes location tours before existing lesson/profile handlers", () => {
  assert.match(webhook, /parseLocationTourPassthrough/);
  assert.match(webhook, /syncLocationTourUpload/);
  assert.match(webhook, /syncLocationTourAsset/);
  assert.match(webhook, /markPortfolioAssetDeleted[\s\S]*markLocationTourAssetDeleted/);
  assert.match(webhook, /portfolioId/);
  assert.match(webhook, /syncMuxUpload/);
});

test("historical external URL stays server-preserved and camera policy is route-scoped", () => {
  assert.match(form, /tour_video_url: existing\?\.tour_video_url \?\? null/);
  assert.doesNotMatch(form, /formData, "tour_video_url"/);
  assert.match(headers, /source: "\/mis-locaciones\/:id\/editar"/);
  assert.match(headers, /camera=\(self\), microphone=\(self\)/);
});

test("camera recording is enabled by default with a server-side kill switch", () => {
  assert.match(pilot, /import "server-only"/);
  assert.match(pilot, /LOCATION_CAMERA_RECORDING_ENABLED/);
  assert.match(pilot, /return !DISABLED_VALUES\.has\(value \?\? ""\)/);
  assert.match(reserveRoute, /locationCameraRecordingEnabled\(\)/);
  assert.match(reserveRoute, /status: 403/);
  assert.ok(reserveRoute.indexOf("auth.getUser()") < reserveRoute.indexOf("locationCameraRecordingEnabled()"));
  assert.ok(reserveRoute.indexOf("locationCameraRecordingEnabled()") < reserveRoute.indexOf('db.rpc("reserve_my_location_tour"'));
  assert.match(editor, /cameraRecordingEnabled=\{locationCameraRecordingEnabled\(\)\}/);
  assert.match(locationForm, /grabación de recorridos está temporalmente deshabilitada/);
});
