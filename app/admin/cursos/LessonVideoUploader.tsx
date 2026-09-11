"use client";

import { useEffect, useRef, useState } from "react";
import {
  createLessonVideoUpload,
  markLessonVideoUploadFailed,
  getLessonVideoState,
  reconcileLessonVideo,
} from "./video-actions";
import LessonVideoPlayer, { type VideoPresentation } from "@/components/LessonVideoPlayer";

type VideoStatus = "preparing" | "ready" | "errored" | null;
type LocalStatus = VideoStatus | "starting" | "uploading";
type ReplacementStage = "starting" | "uploading" | "processing" | null;

const STATUS_LABELS: Record<Exclude<LocalStatus, null>, string> = {
  starting: "Preparando subida…",
  uploading: "Subiendo…",
  preparing: "Procesando…",
  ready: "Listo",
  errored: "Error",
};

export default function LessonVideoUploader({
  lessonId,
  initialStatus,
  refreshVersion,
  policyFailureVersion,
  quickGuide,
  onChanged,
}: {
  lessonId: string;
  initialStatus: VideoStatus;
  refreshVersion: number;
  policyFailureVersion: number;
  quickGuide: boolean;
  onChanged: (status: VideoStatus) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<LocalStatus>(initialStatus);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<VideoPresentation | null>(null);
  const [checking, setChecking] = useState(false);
  const [showRecovery, setShowRecovery] = useState(initialStatus === "errored");
  const [replacementStage, setReplacementStage] =
    useState<ReplacementStage>(null);
  const [trackedReplacementUploadId, setTrackedReplacementUploadId] =
    useState<string | null>(null);
  const [policySyncing, setPolicySyncing] = useState(false);
  const [policyFailed, setPolicyFailed] = useState(false);
  const inFlight = useRef(false);
  const previousPlaybackId = useRef<string | null>(null);
  const replacementStartedAt = useRef<number | null>(null);
  const replacementDiscoveryAttempts = useRef(0);
  const lastRefreshVersion = useRef(refreshVersion);
  const lastPolicyFailureVersion = useRef(policyFailureVersion);
  const changedRef = useRef(onChanged);
  const hasPresentation = presentation !== null;
  useEffect(() => { changedRef.current = onChanged; }, [onChanged]);
  useEffect(() => {
    if (lastPolicyFailureVersion.current === policyFailureVersion) return;
    lastPolicyFailureVersion.current = policyFailureVersion;
    setPolicySyncing(false);
    setPolicyFailed(true);
    setShowRecovery(true);
    setErrorMessage(
      "No se pudo completar el cambio de acceso. El estado anterior se conservó.",
    );
  }, [policyFailureVersion]);
  useEffect(() => {
    if (lastRefreshVersion.current === refreshVersion) return;
    lastRefreshVersion.current = refreshVersion;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 60_000;
    setPolicySyncing(true);
    setPolicyFailed(false);
    setPresentation(null);
    setErrorMessage(null);
    setNotice("Actualizando el acceso del video…");
    setShowRecovery(false);

    async function checkPolicy() {
      try {
        const video = await getLessonVideoState(lessonId);
        if (stopped) return;

        if (
          video.status === "ready" &&
          video.policyCoherent === true &&
          !video.replacementPending
        ) {
          setPresentation(video);
          setStatus("ready");
          setPolicySyncing(false);
          setPolicyFailed(false);
          setShowRecovery(false);
          setErrorMessage(null);
          setNotice(null);
          return;
        }
      } catch {
        if (stopped) return;
      }

      if (Date.now() < deadline) {
        timer = setTimeout(checkPolicy, 2500);
      } else {
        setShowRecovery(true);
        setErrorMessage(
          "El acceso del video no terminó de actualizarse automáticamente.",
        );
      }
    }

    void checkPolicy();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [lessonId, refreshVersion]);
  useEffect(() => {
    if (!inFlight.current) setStatus(initialStatus);
  }, [initialStatus]);
  useEffect(() => {
    if (policySyncing) return;
    if (
      status !== "preparing" &&
      !(status === "ready" && !hasPresentation) &&
      replacementStage !== "processing"
    ) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let consecutiveFailures = 0;
    if (replacementStage === "processing" && !replacementStartedAt.current) {
      replacementStartedAt.current = Date.now();
    }
    const deadline = replacementStage === "processing"
      ? (replacementStartedAt.current ?? Date.now()) + 10 * 60 * 1000
      : Date.now() + 10 * 60 * 1000;
    async function check() {
      try {
        const shouldDiscoverReplacement =
          replacementStage === "processing" &&
          !trackedReplacementUploadId &&
          replacementDiscoveryAttempts.current < 3;
        if (shouldDiscoverReplacement) {
          replacementDiscoveryAttempts.current += 1;
        }
        const video = await getLessonVideoState(
          lessonId,
          trackedReplacementUploadId ?? undefined,
          shouldDiscoverReplacement,
        );
        if (stopped) return;
        consecutiveFailures = 0;
        if (
          video.trackedUploadId &&
          video.trackedUploadId !== trackedReplacementUploadId
        ) {
          setTrackedReplacementUploadId(video.trackedUploadId);
        }
        setErrorMessage(null);
        setPresentation(video);
        setShowRecovery(false);
        if (video.replacementFailed) {
          setReplacementStage(null);
          setTrackedReplacementUploadId(null);
          replacementStartedAt.current = null;
          replacementDiscoveryAttempts.current = 0;
          setShowRecovery(true);
          setErrorMessage(
            "El reemplazo no pudo procesarse. El video anterior continúa disponible.",
          );
          return;
        }
        if (
          video.replacementPending &&
          replacementStage !== "processing" &&
          video.status === "ready"
        ) {
          previousPlaybackId.current = video.playbackId ?? null;
          setReplacementStage("processing");
          setNotice("El nuevo video todavía se está procesando. El anterior continúa disponible.");
        }
        if (
          replacementStage === "processing" &&
          video.status === "ready" &&
          video.replacementPending === false &&
          (!previousPlaybackId.current ||
            video.playbackId !== previousPlaybackId.current)
        ) {
          setReplacementStage(null);
          setTrackedReplacementUploadId(null);
          replacementStartedAt.current = null;
          replacementDiscoveryAttempts.current = 0;
          setShowRecovery(false);
          setNotice("El nuevo video está listo.");
          changedRef.current("ready");
          return;
        }
        if (video.status === "ready" || video.status === "errored") {
          setStatus(video.status);
          if (replacementStage !== "processing") {
            setShowRecovery(video.status === "errored");
            setNotice(null);
          }
          if (status === "preparing") changedRef.current(video.status);
          if (replacementStage !== "processing") return;
        }
        if (video.status === "preparing" && status === "ready") {
          setStatus("preparing");
        }
        if (Date.now() < deadline) timer = setTimeout(check, 8000);
        else {
          setShowRecovery(true);
          setNotice("El procesamiento tarda más de lo esperado.");
        }
      } catch {
        if (stopped) return;
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          setShowRecovery(true);
          setErrorMessage("No se pudo consultar el estado del procesamiento. Volveremos a intentarlo.");
        }
        if (Date.now() < deadline) timer = setTimeout(check, 8000);
      }
    }
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [
    hasPresentation,
    lessonId,
    policySyncing,
    replacementStage,
    status,
    trackedReplacementUploadId,
  ]);
  const busy =
    status === "starting" ||
    status === "uploading" ||
    replacementStage !== null ||
    policySyncing;
  const uploadInProgress =
    status === "starting" ||
    status === "uploading" ||
    replacementStage === "starting" ||
    replacementStage === "uploading";
  const canUpload = status === null || status === "errored";

  async function handleFile(file: File | undefined, replacing = false) {
    if (!file || inFlight.current || busy) {
      return;
    }

    if (file.size === 0) {
      setErrorMessage("Selecciona un archivo de video con contenido.");
      return;
    }

    if (file.type && !file.type.startsWith("video/")) {
      setErrorMessage("El archivo seleccionado no parece ser un video.");
      return;
    }

    setErrorMessage(null);
    setNotice(null);
    setShowRecovery(false);
    setProgress(0);
    if (replacing) {
      previousPlaybackId.current = presentation?.playbackId ?? null;
      setTrackedReplacementUploadId(null);
      replacementStartedAt.current = null;
      replacementDiscoveryAttempts.current = 0;
      setReplacementStage("starting");
    } else {
      setStatus("starting");
    }
    inFlight.current = true;
    try {
    const result = await createLessonVideoUpload(lessonId, replacing);

    if (!result.ok) {
      if (replacing) {
        const replacementReserved = "reserved" in result && result.reserved;
        setReplacementStage(replacementReserved ? "processing" : null);
        setShowRecovery(true);
      } else {
        const nextStatus = "reserved" in result && result.reserved ? "preparing" : initialStatus;
        setStatus(nextStatus);
        setShowRecovery(nextStatus === "preparing" || nextStatus === "errored");
      }
      setErrorMessage(result.message);
      resetInput();
      return;
    }

    if (replacing) {
      setTrackedReplacementUploadId(result.uploadId);
      setReplacementStage("uploading");
      onChanged("ready");
    } else {
      setStatus("uploading");
    }

    try {
      await uploadFile(result.uploadUrl, file, setProgress);
      setProgress(100);
      if (replacing) {
        setReplacementStage("processing");
      }
      else setStatus("preparing");
      setErrorMessage(null);
      setNotice(
        replacing
          ? "El nuevo video se está procesando. El anterior continúa disponible."
          : "El video se está procesando.",
      );
      if (!replacing) onChanged("preparing");
    } catch {
      await markLessonVideoUploadFailed(lessonId);
      if (replacing) {
        setReplacementStage("processing");
      }
      else setStatus("preparing");
      setShowRecovery(true);
      setErrorMessage("La conexión se interrumpió. Comprueba el estado antes de reintentar.");
    } finally {
      resetInput();
    }
    } catch {
      if (replacing) {
        setReplacementStage("processing");
      }
      else setStatus("preparing");
      setShowRecovery(true);
      setErrorMessage("No se pudo confirmar la operación. Comprueba el estado antes de volver a subir.");
    } finally { inFlight.current = false; }
  }

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  const statusLabel = status ? STATUS_LABELS[status] : null;
  const statusDescription =
    policySyncing
      ? "Actualizando el acceso del video…"
      : replacementStage === "starting"
      ? "Preparando el reemplazo…"
      : replacementStage === "uploading"
        ? `Subiendo nuevo video… ${progress}%`
        : replacementStage === "processing"
          ? "Procesando nuevo video… El anterior continúa disponible."
    : status === null
      ? `Añade el video de ${quickGuide ? "este paso" : "esta lección"}.`
      : status === "preparing"
        ? "Procesando video…"
        : statusLabel
          ? `Estado: ${statusLabel}${status === "uploading" ? ` ${progress}%` : ""}`
          : null;

  return (
    <section
      aria-labelledby={`video-heading-${lessonId}`}
      className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p
            id={`video-heading-${lessonId}`}
            className="text-sm font-semibold text-white/75"
          >
            {quickGuide ? "Video del paso" : "Video de la lección"}
          </p>
          <p className="mt-1 text-sm text-white/40" aria-live="polite">
            {statusDescription}
          </p>
        </div>

        {!busy && (canUpload ||
          (status === "ready" && presentation?.status === "ready")) && (
          <label
            className={`inline-flex w-fit items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              busy
                ? "cursor-not-allowed text-white/30"
                : status === "errored"
                  ? "cursor-pointer border border-white/15 text-white/70 hover:bg-white/[0.06] hover:text-white focus-within:outline-2 focus-within:outline-white"
                  : "cursor-pointer bg-white text-black hover:bg-white/85 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white"
            }`}
          >
            {status === "ready"
              ? "Reemplazar video"
              : status === "errored"
                ? "Reintentar subida"
                : "Subir video"}
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              disabled={busy}
              className="sr-only"
              onChange={(event) =>
                void handleFile(event.target.files?.[0], status === "ready")
              }
            />
          </label>
        )}
      </div>
      {showRecovery &&
        (status === "preparing" ||
          status === "errored" ||
          replacementStage === "processing" ||
          policySyncing ||
          policyFailed) && (
        <details className="mt-4 w-fit text-xs text-white/40">
          <summary className="cursor-pointer list-none transition hover:text-white/65 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            Problemas con el procesamiento
          </summary>
          <button type="button" disabled={checking || uploadInProgress} className="mt-3 rounded-full border border-white/10 px-4 py-2 text-xs text-white/55 transition hover:border-white/20 hover:text-white disabled:opacity-40" onClick={async () => {
          setChecking(true);
          setErrorMessage(null);
          try {
            const result = await reconcileLessonVideo(lessonId);
            if (!result.ok) {
              if ("video" in result && result.video) {
                setPresentation(result.video);
              }
              if ("replacementFailed" in result && result.replacementFailed) {
                setReplacementStage(null);
                setTrackedReplacementUploadId(null);
                replacementStartedAt.current = null;
                replacementDiscoveryAttempts.current = 0;
              }
              setShowRecovery(true);
              setErrorMessage(result.message);
              return;
            }

            const video = result.video;
            setPresentation(video);
            const nextStatus = normalizeVideoStatus(video);
            setStatus(nextStatus);
            if (video.policyCoherent === true) {
              setPolicySyncing(false);
            }
            const replacementPending =
              "replacementPending" in result && result.replacementPending;
            setReplacementStage(replacementPending ? "processing" : null);
            if (!replacementPending) {
              setTrackedReplacementUploadId(null);
              replacementStartedAt.current = null;
              replacementDiscoveryAttempts.current = 0;
            }
            setShowRecovery(
              nextStatus === "preparing" ||
                nextStatus === "errored" ||
                Boolean(replacementPending) ||
                policyFailed,
            );
            setErrorMessage(null);
            setNotice(result.message);
            onChanged(nextStatus);
          } catch { setErrorMessage("No se pudo consultar el estado del procesamiento."); }
          finally { setChecking(false); }
        }}>{checking ? "Comprobando…" : "Comprobar estado"}</button>
        </details>
      )}
      {presentation?.status === "ready" && <div className="mt-4"><LessonVideoPlayer video={presentation} /></div>}

      {(status === "uploading" || replacementStage === "uploading") && (
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Progreso de subida"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-white transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {notice && (
        <p
          className="mt-4 text-xs leading-5 text-white/45"
          role="status"
        >
          {notice}
        </p>
      )}

      {errorMessage && (
        <p className="mt-4 text-xs leading-5 text-red-200" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}

function normalizeVideoStatus(video: VideoPresentation): VideoStatus {
  if (video.status === "none") return null;
  if (video.status === "unavailable") return "errored";
  return video.status;
}

function uploadFile(
  uploadUrl: string,
  file: File,
  onProgress: (percentage: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error("Mux rechazó la subida."));
      }
    });
    request.addEventListener("error", () => reject(new Error("Error de red.")));
    request.addEventListener("abort", () => reject(new Error("Subida cancelada.")));
    request.send(file);
  });
}
