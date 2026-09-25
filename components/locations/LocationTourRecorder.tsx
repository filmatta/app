"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LocationCameraTourPlayer from "./LocationCameraTourPlayer";
import {
  LOCATION_TOUR_AUTO_STOP_SECONDS,
  LOCATION_TOUR_MIME_CANDIDATES,
  LOCATION_TOUR_POLL_INTERVAL_MS,
  LOCATION_TOUR_VIDEO_BITS_PER_SECOND,
  locationTourBlobProblem,
} from "@/lib/locations/tour-limits";
import type { OwnerLocationTour } from "@/lib/locations/tour-types";
import {
  locationCameraErrorCode,
  shouldRetrySimpleCamera,
  type CameraPermissionState,
  type CameraPolicyState,
  type LocationCameraDiagnostic,
} from "@/lib/locations/camera-diagnostics";

type Phase = "intro" | "permission" | "preview" | "recording" | "review" | "uploading" | "processing";
type CameraFailureStage = "preflight" | "getUserMedia" | "getUserMediaFallback" | "enumerateDevices" | "preview";
type CameraStreamResult =
  | { ok: true; stream: MediaStream; audioEnabled: boolean; usedSimpleFallback: boolean }
  | { ok: false; reason: unknown; diagnostic: LocationCameraDiagnostic };

export default function LocationTourRecorder({
  locationId,
  locationTitle,
  published,
  initialTour,
}: {
  locationId: string;
  locationTitle: string;
  published: boolean;
  initialTour: OwnerLocationTour | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(initialTour && ["authorizing", "uploading", "processing"].includes(initialTour.status) ? "processing" : "intro");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [withAudio, setWithAudio] = useState(true);
  const [audioFallback, setAudioFallback] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [reviewUrl, setReviewUrl] = useState("");
  const [error, setError] = useState("");
  const [diagnostic, setDiagnostic] = useState<LocationCameraDiagnostic | null>(null);
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [tour, setTour] = useState(initialTour);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestVersionRef = useRef(0);
  const stopNoteRef = useRef("");
  const uploadRef = useRef<XMLHttpRequest | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewUrlRef = useRef("");

  useEffect(() => {
    const supportCheck = window.setTimeout(() => {
      setSupported(Boolean(
        !window.isSecureContext
        || (typeof navigator.mediaDevices?.getUserMedia === "function"
          && "MediaRecorder" in window),
      ));
    }, 0);
    return () => { window.clearTimeout(supportCheck); cleanupAll(); };
    // The teardown intentionally reads only refs; it must run once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (blobRef.current || uploadRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const visibility = () => {
      if (document.hidden && recorderRef.current?.state === "recording") stopRecording("La grabación se detuvo porque la pestaña dejó de estar activa. Puedes revisarla antes de decidir.");
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    if (tour && ["authorizing", "uploading", "processing"].includes(tour.status)) schedulePoll(tour.id);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
    // Polling reschedules itself; depending on the callback would restart it on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id, tour?.status]);

  useEffect(() => {
    if ((phase === "preview" || phase === "recording") && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [phase]);

  function cleanupAll() {
    requestVersionRef.current += 1;
    releaseCamera();
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearTimeout(pollRef.current);
    uploadRef.current?.abort();
    uploadRef.current = null;
    if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current);
    reviewUrlRef.current = "";
  }

  function releaseCamera() {
    streamRef.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function openDialog() {
    setOpen(true); setPhase("intro"); setError(""); setNotice(""); setDiagnostic(null);
  }

  function closeDialog() {
    if ((blobRef.current || uploadRef.current) && !window.confirm("Esta toma sólo existe en esta página. ¿Cerrar y descartarla?")) return;
    if (tour && ["authorizing", "uploading", "processing"].includes(tour.status)) {
      void fetch(`/api/locations/tours/${tour.id}/cancel`, { method: "POST", keepalive: true });
    }
    cleanupAll();
    blobRef.current = null;
    setReviewUrl(""); setOpen(false); setPhase("intro"); setProgress(null);
  }

  async function requestCamera(audio = withAudio, requestedDevice = deviceId) {
    const version = ++requestVersionRef.current;
    releaseCamera(); setPhase("permission"); setError(""); setNotice(""); setDiagnostic(null); setAudioFallback(false);
    const preflightError = cameraPreflightError();
    if (preflightError) {
      const reason = new DOMException(preflightError, "SecurityError");
      const evidence = await collectCameraDiagnostic(reason);
      setPhase("intro");
      setError(preflightError);
      setDiagnostic(evidence);
      logCameraFailure("preflight", reason, evidence);
      return;
    }
    try {
      const camera = await getCameraStream(audio, requestedDevice);
      if (!camera.ok) {
        if (version !== requestVersionRef.current) return;
        setPhase("intro");
        setAudioFallback(audio);
        setDiagnostic(camera.diagnostic);
        setError(cameraErrorMessage(camera.diagnostic, audio));
        return;
      }
      const { stream } = camera;
      if (version !== requestVersionRef.current || !open) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => { track.onended = () => { if (recorderRef.current?.state === "recording") stopRecording("La cámara se interrumpió. Revisa la toma disponible."); }; });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch((reason) => logCameraFailure("preview", reason));
      }
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        if (version !== requestVersionRef.current) return;
        setDevices(available.filter((item) => item.kind === "videoinput"));
      } catch (reason) {
        // Enumeration is only an enhancement after permission; it must not block capture.
        logCameraFailure("enumerateDevices", reason);
        setDevices([]);
      }
      const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (current) setDeviceId(current);
      setWithAudio(camera.audioEnabled);
      if (camera.usedSimpleFallback) setNotice("La cámara inició con la configuración básica y sin audio.");
      setPhase("preview");
    } catch (reason) {
      if (version !== requestVersionRef.current) return;
      const evidence = await collectCameraDiagnostic(reason);
      logCameraFailure("getUserMedia", reason, evidence);
      setPhase("intro");
      setAudioFallback(audio);
      setDiagnostic(evidence);
      setError(cameraErrorMessage(evidence, audio));
    }
  }

  async function changeCamera(next: string) {
    setDeviceId(next);
    await requestCamera(withAudio, next);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    setError(""); setNotice(""); setElapsed(0); chunksRef.current = [];
    const mimeType = LOCATION_TOUR_MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: LOCATION_TOUR_VIDEO_BITS_PER_SECOND });
    } catch {
      try { recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); }
      catch { setError("El grabador del navegador no pudo iniciar con esta cámara."); return; }
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onerror = () => stopRecording("La grabación se interrumpió por un error del navegador. Revisa la toma disponible.");
    recorder.onstop = () => finishRecording(recorder);
    try { recorder.start(1_000); }
    catch { setError("El navegador rechazó el inicio de la grabación."); recorderRef.current = null; return; }
    startedAtRef.current = performance.now();
    timerRef.current = setInterval(() => {
      const seconds = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= LOCATION_TOUR_AUTO_STOP_SECONDS) stopRecording("La toma se detuvo automáticamente antes del límite de 180 segundos.");
    }, 250);
    setPhase("recording");
  }

  function stopRecording(note = "") {
    if (note) stopNoteRef.current = note;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  function finishRecording(recorder: MediaRecorder) {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const duration = (performance.now() - startedAtRef.current) / 1000;
    const type = recorder.mimeType || chunksRef.current[0]?.type || "";
    const blob = new Blob(chunksRef.current, { type });
    recorderRef.current = null; releaseCamera(); setElapsed(duration);
    const problem = locationTourBlobProblem(blob, duration);
    if (problem) { setError(problem); setNotice(stopNoteRef.current); stopNoteRef.current = ""; setPhase("intro"); return; }
    if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current);
    const url = URL.createObjectURL(blob);
    reviewUrlRef.current = url;
    blobRef.current = blob; setReviewUrl(url); setNotice(stopNoteRef.current); stopNoteRef.current = ""; setPhase("review");
  }

  async function retake() {
    if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current);
    reviewUrlRef.current = "";
    blobRef.current = null; setReviewUrl(""); setNotice("");
    await requestCamera(withAudio);
  }

  async function useRecording() {
    const blob = blobRef.current;
    if (!blob || uploadRef.current) return;
    if (published && !window.confirm("La locación está publicada. Este recorrido quedará visible automáticamente cuando Mux termine de validarlo. ¿Continuar?")) return;
    setPhase("uploading"); setProgress(0); setError("");
    try {
      const response = await fetch("/api/locations/tours/reserve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, size: blob.size, type: blob.type }),
      });
      const result = await response.json();
      if (!response.ok || !result.uploadUrl) throw new Error(result.error ?? "No pudimos preparar la subida.");
      setTour({ id: result.id, status: "uploading", recordedAt: null, durationSeconds: null, isActive: false });
      await uploadBlob(result.uploadUrl, blob);
      setTour({ id: result.id, status: "processing", recordedAt: null, durationSeconds: null, isActive: false });
      blobRef.current = null;
      if (reviewUrlRef.current) URL.revokeObjectURL(reviewUrlRef.current);
      reviewUrlRef.current = "";
      setReviewUrl(""); setProgress(null); setPhase("processing"); schedulePoll(result.id);
    } catch (reason) {
      uploadRef.current = null; setProgress(null); setPhase("review");
      setError(reason instanceof Error ? reason.message : "La subida falló. Puedes reintentar sin volver a grabar.");
    }
  }

  function uploadBlob(url: string, blob: Blob) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest(); uploadRef.current = request;
      request.open("PUT", url); request.setRequestHeader("Content-Type", blob.type);
      request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
      request.onload = () => {
        uploadRef.current = null;
        if (request.status >= 200 && request.status < 300) resolve();
        else reject(new Error("Mux no recibió la grabación completa."));
      };
      request.onerror = () => { uploadRef.current = null; reject(new Error("La conexión se interrumpió. Puedes reintentar con la misma toma.")); };
      request.onabort = () => { uploadRef.current = null; reject(new Error("La subida se canceló.")); };
      request.send(blob);
    });
  }

  function schedulePoll(id: string) {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations/tours/${id}/status`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        const next: OwnerLocationTour = { id, status: result.status, recordedAt: result.recordedAt, durationSeconds: result.durationSeconds, isActive: result.status === "ready" };
        setTour(next);
        if (result.status === "ready") { setPhase("intro"); setOpen(false); router.refresh(); return; }
        if (["errored", "rejected", "cancelled", "deleted"].includes(result.status)) { setPhase("intro"); setError("La grabación no pudo quedar lista. Puedes hacer una nueva toma."); return; }
        schedulePoll(id);
      } catch { schedulePoll(id); }
    }, LOCATION_TOUR_POLL_INTERVAL_MS);
  }

  async function cancelPending() {
    if (!tour) return;
    const response = await fetch(`/api/locations/tours/${tour.id}/cancel`, { method: "POST" });
    if (response.ok) { if (pollRef.current) clearTimeout(pollRef.current); setTour(null); setPhase("intro"); setOpen(false); router.refresh(); }
    else setError("No pudimos confirmar la cancelación; el servidor seguirá reconciliando el intento.");
  }

  return <div className="space-y-5">
    {tour?.status === "ready" && tour.isActive && <div className="overflow-hidden rounded-2xl border border-white/10"><LocationCameraTourPlayer tourId={tour.id} title={locationTitle} /><div className="border-t border-white/10 p-4"><p className="text-sm font-semibold">Grabado desde FILMATTA</p><p className="mt-1 text-xs leading-5 text-white/45">Recorrido enviado mediante la herramienta de grabación. No implica verificación de propiedad o de las condiciones del inmueble.</p>{tour.recordedAt && <p className="mt-2 text-xs text-white/35">Registrado por el sistema: {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(tour.recordedAt))}</p>}</div></div>}
    {tour && ["authorizing", "uploading", "processing"].includes(tour.status) && <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-5"><p className="text-sm text-amber-100">El nuevo recorrido se está procesando. El anterior permanece activo hasta que éste sea válido.</p><button type="button" onClick={cancelPending} className="mt-3 text-xs text-white/55 underline underline-offset-4">Cancelar intento</button></div>}
    <button type="button" onClick={openDialog} disabled={supported === false || Boolean(tour && ["authorizing", "uploading", "processing"].includes(tour.status))} className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45">{tour?.status === "ready" ? "Volver a grabar" : "Grabar recorrido"}</button>
    {supported === false && <p role="status" className="text-sm leading-6 text-amber-100/80">Este navegador o contexto no permite grabar con cámara. Abre la Preview por HTTPS en Safari iPhone, Chrome Android o Chrome/Edge de escritorio. No existe carga de archivo alternativa.</p>}
    {error && !open && <p role="alert" className="text-sm text-red-200">{error}</p>}

    {open && <div role="dialog" aria-modal="true" aria-labelledby="tour-recorder-title" className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 p-3 sm:items-center sm:p-6">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/15 bg-[#0d0d0d] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><h3 id="tour-recorder-title" className="text-2xl font-semibold">Grabar recorrido</h3><p className="mt-2 text-sm leading-6 text-white/50">Una toma continua de hasta 180 segundos. Recomendamos sostener el teléfono en horizontal; también se admite vertical.</p></div><button type="button" onClick={closeDialog} className="rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Cerrar grabador">✕</button></div>
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/60">Muestra una vista general y recorre las áreas disponibles. Evita documentos, personas sin autorización y códigos de acceso.</div>
        {phase === "intro" && <div className="mt-6 space-y-4"><label className="flex items-center gap-3 text-sm text-white/70"><input type="checkbox" checked={withAudio} onChange={(event) => setWithAudio(event.target.checked)} /> Incluir audio</label><button type="button" onClick={() => requestCamera(withAudio)} className={primaryButton}>Continuar y solicitar permiso</button>{audioFallback && <button type="button" onClick={() => requestCamera(false)} className={secondaryButton}>Intentar sin audio</button>}</div>}
        {phase === "permission" && <p role="status" className="mt-7 text-sm text-white/60">Esperando permiso del navegador…</p>}
        {(phase === "preview" || phase === "recording") && <div className="mt-6 space-y-4"><div className="relative overflow-hidden rounded-2xl bg-black"><video ref={videoRef} muted playsInline autoPlay className="max-h-[62vh] w-full object-contain" />{phase === "recording" && <span className="absolute left-4 top-4 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold">● REC {formatSeconds(elapsed)}</span>}</div>{phase === "preview" && devices.length > 1 && <label className="block text-sm text-white/55">Cámara<select value={deviceId} onChange={(event) => changeCamera(event.target.value)} className={`${inputClass} mt-2`}>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Cámara ${index + 1}`}</option>)}</select></label>}<button type="button" onClick={phase === "preview" ? startRecording : () => stopRecording()} className={phase === "recording" ? dangerButton : primaryButton}>{phase === "recording" ? "Detener" : "Grabar"}</button></div>}
        {phase === "review" && reviewUrl && <div className="mt-6 space-y-4"><video src={reviewUrl} controls playsInline className="max-h-[62vh] w-full rounded-2xl bg-black object-contain" /><p className="text-xs text-white/45">Duración medida: {formatSeconds(elapsed)} · La cámara ya está apagada.</p>{published && <p className="text-sm text-amber-100/80">Al confirmar, el recorrido quedará visible cuando Mux termine de procesarlo y validarlo.</p>}<div className="flex flex-wrap gap-3"><button type="button" onClick={useRecording} className={primaryButton}>Usar recorrido</button><button type="button" onClick={retake} className={secondaryButton}>Volver a grabar</button></div></div>}
        {phase === "uploading" && <div className="mt-7"><p role="status" className="text-sm text-white/65">Subiendo directamente a Mux… {progress ?? 0}%</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-white transition-all" style={{ width: `${progress ?? 0}%` }} /></div></div>}
        {phase === "processing" && <div className="mt-7"><p role="status" className="text-sm text-white/65">Grabación recibida. Mux está comprobando duración, video y playback protegido…</p>{tour && <button type="button" onClick={cancelPending} className={`${secondaryButton} mt-5`}>Cancelar intento</button>}</div>}
        {notice && <p role="status" className="mt-5 text-sm text-amber-100/80">{notice}</p>}
        {error && <p role="alert" className="mt-5 text-sm text-red-200">{error}</p>}
        {diagnostic && <CameraDiagnosticPanel diagnostic={diagnostic} />}
      </div>
    </div>}
  </div>;
}

function formatSeconds(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function cameraPreflightError() {
  if (!window.isSecureContext) {
    return "La cámara sólo está disponible al abrir FILMATTA directamente por HTTPS.";
  }
  if (document.visibilityState !== "visible") {
    return "La página debe estar visible y activa para abrir la cámara.";
  }
  if (window.top !== window.self) {
    return "Abre esta página directamente en el navegador; la cámara no está disponible dentro de una vista incrustada.";
  }
  if (typeof navigator.mediaDevices?.getUserMedia !== "function" || !("MediaRecorder" in window)) {
    return "Este navegador o contexto no ofrece las funciones necesarias para cámara y grabación.";
  }
  return null;
}

async function getCameraStream(audio: boolean, requestedDevice: string): Promise<CameraStreamResult> {
  const preferredVideo: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
    ...(requestedDevice
      ? { deviceId: { ideal: requestedDevice } }
      : { facingMode: { ideal: "environment" } }),
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: preferredVideo, audio });
    return { ok: true, stream, audioEnabled: audio, usedSimpleFallback: false };
  } catch (reason) {
    const diagnostic = await collectCameraDiagnostic(reason);
    logCameraFailure("getUserMedia", reason, diagnostic);
    if (shouldRetrySimpleCamera(diagnostic, audio)) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        return { ok: true, stream, audioEnabled: false, usedSimpleFallback: true };
      } catch (fallbackReason) {
        const fallbackDiagnostic = await collectCameraDiagnostic(fallbackReason);
        logCameraFailure("getUserMediaFallback", fallbackReason, fallbackDiagnostic);
      }
    }
    return { ok: false, reason, diagnostic };
  }
}

function cameraErrorMessage(diagnostic: LocationCameraDiagnostic, audio: boolean) {
  const code = locationCameraErrorCode(diagnostic);
  if (code === "CAMERA_POLICY_BLOCKED") {
    return "La política de seguridad de esta página bloqueó la cámara. Abre FILMATTA directamente y vuelve a intentarlo.";
  }
  if (code === "CAMERA_PERMISSION_DENIED") {
    return audio
      ? "El navegador o el sistema bloqueó el acceso a cámara o micrófono. Revisa los permisos del sitio; también puedes intentar sin audio."
      : "El navegador o el sistema bloqueó el acceso a la cámara. Revisa el permiso de cámara para este sitio.";
  }
  if (code === "CAMERA_NOT_FOUND") {
    return "No encontramos una cámara disponible en este dispositivo.";
  }
  if (code === "CAMERA_UNAVAILABLE") {
    return "La cámara está ocupada o el sistema no pudo iniciarla. Cierra otras apps que la estén usando e inténtalo de nuevo.";
  }
  if (code === "CAMERA_CONSTRAINTS_FAILED") {
    return "La cámara disponible no admite una configuración compatible para grabar.";
  }
  return "No pudimos acceder a la cámara. Copia el diagnóstico mostrado para revisar el error real.";
}

async function collectCameraDiagnostic(reason: unknown): Promise<LocationCameraDiagnostic> {
  return {
    errorName: cameraErrorName(reason),
    errorMessage: cameraErrorMessageValue(reason),
    errorConstructor: cameraErrorConstructor(reason),
    secureContext: window.isSecureContext,
    topLevel: window.top === window.self,
    origin: window.location.origin,
    mediaDevicesAvailable: typeof navigator.mediaDevices?.getUserMedia === "function",
    permission: await cameraPermissionState(),
    policyCamera: cameraPolicyState("camera"),
    policyMicrophone: cameraPolicyState("microphone"),
  };
}

async function cameraPermissionState(): Promise<CameraPermissionState> {
  if (!navigator.permissions?.query) return "unsupported";
  try {
    const result = await navigator.permissions.query({ name: "camera" as PermissionName });
    return result.state;
  } catch {
    return "unsupported";
  }
}

function cameraPolicyState(feature: "camera" | "microphone"): CameraPolicyState {
  const policyDocument = document as Document & {
    permissionsPolicy?: { allowsFeature(feature: string): boolean };
    featurePolicy?: { allowsFeature(feature: string): boolean };
  };
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
  if (!policy) return "unsupported";
  try {
    return policy.allowsFeature(feature);
  } catch {
    return "unsupported";
  }
}

function cameraErrorName(reason: unknown) {
  if (reason instanceof DOMException || reason instanceof Error) return reason.name;
  if (reason && typeof reason === "object" && "name" in reason && typeof reason.name === "string") return reason.name;
  return "UnknownError";
}

function cameraErrorMessageValue(reason: unknown) {
  if (reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string") return reason.message;
  return "Sin mensaje del navegador";
}

function cameraErrorConstructor(reason: unknown) {
  if (reason && typeof reason === "object" && "constructor" in reason) {
    const constructor = reason.constructor as { name?: unknown };
    if (typeof constructor?.name === "string") return constructor.name;
  }
  return "Unknown";
}

function logCameraFailure(stage: CameraFailureStage, reason: unknown, diagnostic?: LocationCameraDiagnostic) {
  console.error("Location tour camera failed", {
    stage,
    errorName: diagnostic?.errorName ?? cameraErrorName(reason),
    errorMessage: diagnostic?.errorMessage ?? cameraErrorMessageValue(reason),
    errorConstructor: diagnostic?.errorConstructor ?? cameraErrorConstructor(reason),
    secureContext: diagnostic?.secureContext ?? window.isSecureContext,
    topLevel: diagnostic?.topLevel ?? window.top === window.self,
    origin: diagnostic?.origin ?? window.location.origin,
    mediaDevicesAvailable: diagnostic?.mediaDevicesAvailable ?? typeof navigator.mediaDevices?.getUserMedia === "function",
    permission: diagnostic?.permission ?? "unsupported",
    policyCamera: diagnostic?.policyCamera ?? cameraPolicyState("camera"),
    policyMicrophone: diagnostic?.policyMicrophone ?? cameraPolicyState("microphone"),
    visibilityState: document.visibilityState,
  });
}

function CameraDiagnosticPanel({ diagnostic }: { diagnostic: LocationCameraDiagnostic }) {
  const browserError = `${diagnostic.errorName}: ${diagnostic.errorMessage} (${diagnostic.errorConstructor})`;
  return <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4 text-xs leading-5 text-amber-50" data-camera-diagnostic>
    <strong className="block text-sm">Diagnóstico de cámara</strong>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt>Código:</dt><dd className="break-all font-mono">{locationCameraErrorCode(diagnostic)}</dd>
      <dt>Browser error:</dt><dd className="break-all font-mono">{browserError}</dd>
      <dt>Permiso:</dt><dd className="font-mono">{diagnostic.permission}</dd>
      <dt>Secure context:</dt><dd className="font-mono">{String(diagnostic.secureContext)}</dd>
      <dt>Top level:</dt><dd className="font-mono">{String(diagnostic.topLevel)}</dd>
      <dt>Policy camera:</dt><dd className="font-mono">{String(diagnostic.policyCamera)}</dd>
    </dl>
  </div>;
}

const primaryButton = "rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/85 disabled:opacity-50";
const secondaryButton = "rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]";
const dangerButton = "rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500";
const inputClass = "w-full rounded-xl border border-white/10 bg-[#151515] px-4 py-3 text-white outline-none focus:border-white/30";
