import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import load from "../load.mjs";

const limits = load("lib/locations/tour-limits.ts");
const diagnostics = load("lib/locations/camera-diagnostics.ts");
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
  assert.match(recorder, /!window\.isSecureContext\s*\|\|/);
  assert.match(recorder, /collectCameraDiagnostic\(reason\)/);
  const directRequest = recorder.indexOf("const stream = await navigator.mediaDevices.getUserMedia");
  const directCatchDiagnostic = recorder.indexOf("const diagnostic = await collectCameraDiagnostic(reason)", directRequest);
  assert.ok(directRequest > -1 && directRequest < directCatchDiagnostic, "the original getUserMedia error is captured only after the real request fails");
  assert.match(recorder, /Location tour camera failed/);
  assert.match(recorder, /stage,/);
  assert.match(recorder, /CAMERA_POLICY_BLOCKED/);
  assert.match(recorder, /Revisa el permiso de cámara para este sitio/);
  assert.match(recorder, /getUserMedia\(\{ video: true, audio: false \}\)/);
  assert.equal((recorder.match(/navigator\.mediaDevices\.getUserMedia\(/g) ?? []).length, 2, "normal request plus at most one simple fallback");
  assert.match(recorder, /usedSimpleFallback/);
  assert.match(recorder, /ok: true, stream, audioEnabled: false, usedSimpleFallback: true/);
  assert.ok(recorder.indexOf("if (!camera.ok)") < recorder.indexOf('setPhase("preview")'), "simple fallback success continues the normal preview flow");
  assert.match(recorder, /Diagnóstico de cámara/);
  assert.match(recorder, /Browser error:/);
  assert.match(recorder, /Policy camera:/);
  assert.doesNotMatch(recorder, /useEffect\(\(\) => \{\s*void requestCamera/);
});

test("camera diagnostics classify explicit evidence and allow one reasonable simple retry", () => {
  const base = {
    errorName: "NotAllowedError", errorMessage: "Access failed", errorConstructor: "DOMException",
    secureContext: true, topLevel: true, origin: "https://app.filmatta.com",
    mediaDevicesAvailable: true, permission: "granted", policyCamera: true, policyMicrophone: true,
  };
  assert.equal(diagnostics.locationCameraErrorCode(base), "CAMERA_ACCESS_FAILED");
  assert.equal(diagnostics.locationCameraErrorCode({ ...base, policyCamera: false }), "CAMERA_POLICY_BLOCKED");
  assert.equal(diagnostics.shouldRetrySimpleCamera({ ...base, errorName: "OverconstrainedError" }, false), true);
  assert.equal(diagnostics.shouldRetrySimpleCamera({ ...base, errorName: "NotFoundError" }, true), true);
  assert.equal(diagnostics.shouldRetrySimpleCamera(base, true), true);
  assert.equal(diagnostics.shouldRetrySimpleCamera({ ...base, permission: "denied" }, true), false);
  assert.equal(diagnostics.shouldRetrySimpleCamera({ ...base, policyCamera: false }, true), false);
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
