"use client";

import { useEffect, useRef, useState } from "react";
import {
  createLessonVideoUpload,
  markLessonVideoUploadFailed,
  getLessonVideoState,
  reconcileLessonVideo,
} from "./video-actions";
import LessonVideoPlayer, { type VideoPresentation } from "@/components/LessonVideoPlayer";
import PendingState from "@/components/ui/PendingState";
import SectionLoader from "@/components/ui/SectionLoader";

type VideoStatus = "preparing" | "ready" | "errored" | null;
type LocalStatus = VideoStatus | "starting" | "uploading";
type ReplacementStage = "starting" | "uploading" | "processing" | null;
type UploadFailure = "initial" | "replacement" | null;
type ActiveUploadKind = "initial" | "replacement" | null;

class DirectUploadError extends Error {
  constructor(
    message: string,
    readonly kind: "setup" | "http" | "network" | "abort",
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "DirectUploadError";
  }
}

function logUploadStage(
  stage: string,
  details: Record<string, unknown>,
) {
  console.info("Mux Direct Upload client", { stage, ...details });
}

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
  const [trackedUploadId, setTrackedUploadId] =
    useState<string | null>(null);
  const [trackedAttemptId, setTrackedAttemptId] =
    useState<string | null>(null);
  const [activeUploadKind, setActiveUploadKind] =
    useState<ActiveUploadKind>(null);
  const [uploadFailure, setUploadFailure] = useState<UploadFailure>(null);
  const [policySyncing, setPolicySyncing] = useState(false);
  const [policyFailed, setPolicyFailed] = useState(false);
  const inFlight = useRef(false);
  const uploadProcessingStartedAt = useRef<number | null>(null);
  const pollingAttempt = useRef(0);
  const replacementDiscoveryAttempts = useRef(0);
  const authoritativeNoneRef = useRef(false);
  const asyncGenerationRef = useRef(0);
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
      const requestGeneration = asyncGenerationRef.current;
      try {
        const video = await getLessonVideoState(lessonId);
        if (
          stopped ||
          requestGeneration !== asyncGenerationRef.current
        ) return;

        if (video.status === "none") {
          asyncGenerationRef.current += 1;
          authoritativeNoneRef.current = true;
          setPresentation(video);
          setStatus(null);
          setReplacementStage(null);
          setPolicySyncing(false);
          setPolicyFailed(false);
          setShowRecovery(false);
          setErrorMessage(null);
          setNotice(null);
          if (video.orphanRepaired) changedRef.current(null);
          return;
        }

        if (
          video.status === "ready" &&
          video.policyCoherent === true &&
          !video.replacementPending
        ) {
          authoritativeNoneRef.current = false;
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
        if (
          stopped ||
          requestGeneration !== asyncGenerationRef.current
        ) return;
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
    if (!inFlight.current && !authoritativeNoneRef.current) {
      setStatus(initialStatus);
    }
  }, [initialStatus]);
  useEffect(() => {
    if (policySyncing) return;
    if (
      status !== "preparing" &&
      !(status === "ready" && !hasPresentation) &&
      !(status === "errored" && !hasPresentation) &&
      replacementStage !== "processing"
    ) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let consecutiveFailures = 0;
    if (!uploadProcessingStartedAt.current) {
      uploadProcessingStartedAt.current = Date.now();
    }
    const deadline =
      (uploadProcessingStartedAt.current ?? Date.now()) + 10 * 60 * 1000;
    async function check() {
      const requestGeneration = asyncGenerationRef.current;
      try {
        const shouldDiscoverReplacement =
          !trackedUploadId &&
          (replacementStage === "processing" ||
            (status === "ready" && !hasPresentation)) &&
          replacementDiscoveryAttempts.current < 3;
        if (shouldDiscoverReplacement) {
          replacementDiscoveryAttempts.current += 1;
        }
        const video = await getLessonVideoState(
          lessonId,
          trackedUploadId ?? undefined,
          trackedAttemptId ?? undefined,
          shouldDiscoverReplacement,
        );
        if (
          stopped ||
          requestGeneration !== asyncGenerationRef.current
        ) return;
        consecutiveFailures = 0;
        if (
          video.trackedUploadId &&
          video.trackedUploadId !== trackedUploadId
        ) {
          setTrackedUploadId(video.trackedUploadId);
        }
        if (
          video.trackedAttemptId &&
          video.trackedAttemptId !== trackedAttemptId
        ) {
          setTrackedAttemptId(video.trackedAttemptId);
        }
        setPresentation(video);
        setShowRecovery(false);
        if (video.initialUploadFailed) {
          setStatus("errored");
          setTrackedUploadId(null);
          setTrackedAttemptId(null);
          setActiveUploadKind(null);
          uploadProcessingStartedAt.current = null;
          pollingAttempt.current = 0;
          setUploadFailure("initial");
          setShowRecovery(true);
          setNotice(null);
          setErrorMessage("El video no pudo procesarse. Puedes volver a intentarlo.");
          return;
        }
        if (video.replacementFailed) {
          setReplacementStage(null);
          setTrackedUploadId(null);
          setTrackedAttemptId(null);
          setActiveUploadKind(null);
          uploadProcessingStartedAt.current = null;
          pollingAttempt.current = 0;
          replacementDiscoveryAttempts.current = 0;
          setUploadFailure("replacement");
          setShowRecovery(true);
          setErrorMessage(
            "El reemplazo no pudo procesarse. El video anterior continúa disponible.",
          );
          return;
        }
        if (video.status === "none") {
          asyncGenerationRef.current += 1;
          authoritativeNoneRef.current = true;
          setStatus(null);
          setReplacementStage(null);
          setTrackedUploadId(null);
          setTrackedAttemptId(null);
          setActiveUploadKind(null);
          uploadProcessingStartedAt.current = null;
          pollingAttempt.current = 0;
          setUploadFailure(null);
          setNotice(null);
          setErrorMessage(null);
          if (video.orphanRepaired) changedRef.current(null);
          return;
        }
        authoritativeNoneRef.current = false;
        if (
          video.replacementPending &&
          replacementStage !== "processing" &&
          video.status === "ready"
        ) {
          if (
            video.trackedUploadId &&
            video.trackedAttemptId &&
            video.trackedUploadStatus === "asset_created"
          ) {
            setUploadFailure(null);
            setErrorMessage(null);
            setReplacementStage("processing");
            setNotice("El nuevo video todavía se está procesando. El anterior continúa disponible.");
          } else {
            setUploadFailure("replacement");
            setShowRecovery(true);
            setNotice(null);
            setErrorMessage(
              video.trackedUploadStatus === "waiting"
                ? "Mux tiene una sesión pendiente, pero no recibió el archivo. Vuelve a intentar la subida."
                : "No se encontró una subida válida para el reemplazo pendiente.",
            );
          }
          return;
        }
        setErrorMessage(null);
        setUploadFailure(null);
        if (
          activeUploadKind === "initial" &&
          video.trackedUploadResolved === true &&
          video.status === "ready" &&
          video.trackedUploadId === trackedUploadId &&
          video.trackedAttemptId === trackedAttemptId
        ) {
          setStatus("ready");
          setTrackedUploadId(null);
          setTrackedAttemptId(null);
          setActiveUploadKind(null);
          uploadProcessingStartedAt.current = null;
          pollingAttempt.current = 0;
          setShowRecovery(false);
          setNotice("El video está listo.");
          changedRef.current("ready");
          return;
        }
        if (
          replacementStage === "processing" &&
          video.trackedUploadResolved === true &&
          Boolean(video.trackedUploadId) &&
          video.trackedUploadId === trackedUploadId &&
          Boolean(video.trackedAttemptId) &&
          video.trackedAttemptId === trackedAttemptId
        ) {
          setReplacementStage(null);
          setTrackedUploadId(null);
          setTrackedAttemptId(null);
          setActiveUploadKind(null);
          uploadProcessingStartedAt.current = null;
          pollingAttempt.current = 0;
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
        if (Date.now() < deadline) {
          timer = setTimeout(check, nextPollingDelay(pollingAttempt.current++));
        }
        else {
          setShowRecovery(true);
          setNotice("El procesamiento tarda más de lo esperado.");
        }
      } catch {
        if (
          stopped ||
          requestGeneration !== asyncGenerationRef.current
        ) return;
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          setShowRecovery(true);
          setErrorMessage("No se pudo consultar el estado del procesamiento. Volveremos a intentarlo.");
        }
        if (Date.now() < deadline) {
          timer = setTimeout(check, nextPollingDelay(pollingAttempt.current++));
        }
      }
    }
    void check();
    return () => { stopped = true; clearTimeout(timer); };
  }, [
    hasPresentation,
    activeUploadKind,
    lessonId,
    policySyncing,
    replacementStage,
    status,
    trackedAttemptId,
    trackedUploadId,
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

    let authoritativeReplacement = replacing;
    const logContext = { lessonId, replacement: replacing };
    logUploadStage("file-selected", {
      ...logContext,
      bytes: file.size,
      contentType: file.type || "unknown",
    });

    if (file.size === 0) {
      setUploadFailure(replacing ? "replacement" : "initial");
      setErrorMessage("Selecciona un archivo de video con contenido.");
      return;
    }

    if (file.type && !file.type.startsWith("video/")) {
      setUploadFailure(replacing ? "replacement" : "initial");
      setErrorMessage("El archivo seleccionado no parece ser un video.");
      return;
    }

    setErrorMessage(null);
    asyncGenerationRef.current += 1;
    authoritativeNoneRef.current = false;
    setUploadFailure(null);
    setNotice(null);
    setShowRecovery(false);
    setProgress(0);
    if (replacing) {
      setTrackedUploadId(null);
      setTrackedAttemptId(null);
      setActiveUploadKind("replacement");
      uploadProcessingStartedAt.current = null;
      pollingAttempt.current = 0;
      replacementDiscoveryAttempts.current = 0;
      setReplacementStage("starting");
    } else {
      setActiveUploadKind("initial");
      uploadProcessingStartedAt.current = null;
      pollingAttempt.current = 0;
      setStatus("starting");
    }
    inFlight.current = true;
    try {
      logUploadStage("create-upload-started", logContext);
      const result = await createLessonVideoUpload(lessonId, replacing);

      if (!result.ok) {
        logUploadStage("create-upload-failed", logContext);
        setUploadFailure(replacing ? "replacement" : "initial");
        setTrackedUploadId(null);
        setTrackedAttemptId(null);
        setActiveUploadKind(null);
        uploadProcessingStartedAt.current = null;
        pollingAttempt.current = 0;
        replacementDiscoveryAttempts.current = 0;
        setShowRecovery(false);
        if ("orphanRepaired" in result && result.orphanRepaired) {
          authoritativeNoneRef.current = true;
          setReplacementStage(null);
          setPresentation({ status: "none" });
          setStatus(null);
          setUploadFailure("initial");
          onChanged(null);
        } else if (replacing) {
          setReplacementStage(null);
          setStatus(initialStatus);
        } else {
          setStatus(initialStatus);
        }
        setErrorMessage(result.message);
        return;
      }

      let putStarted = false;
      try {
        const isReplacement = result.replacement;
        authoritativeReplacement = isReplacement;
        let parsedUploadUrl: URL;
        try {
          parsedUploadUrl = new URL(result.uploadUrl);
        } catch {
          throw new DirectUploadError(
            "Mux devolvió una URL de subida inválida.",
            "setup",
          );
        }
        if (
          parsedUploadUrl.protocol !== "https:" ||
          !result.uploadId ||
          !result.attemptId
        ) {
          throw new DirectUploadError(
            "Mux devolvió una sesión de subida incompleta.",
            "setup",
          );
        }

        logUploadStage("upload-created", {
          ...logContext,
          uploadId: result.uploadId,
          attemptId: result.attemptId,
        });
        setTrackedUploadId(result.uploadId);
        setTrackedAttemptId(result.attemptId);
        setActiveUploadKind(isReplacement ? "replacement" : "initial");
        if (isReplacement) {
          setReplacementStage("uploading");
        } else {
          setReplacementStage(null);
          setStatus("uploading");
        }

        putStarted = true;
        logUploadStage("put-started", {
          ...logContext,
          uploadId: result.uploadId,
          attemptId: result.attemptId,
        });
        const httpStatus = await uploadFile(result.uploadUrl, file, setProgress);
        logUploadStage("put-completed", {
          ...logContext,
          uploadId: result.uploadId,
          attemptId: result.attemptId,
          httpStatus,
        });
        setProgress(100);
        setUploadFailure(null);
        uploadProcessingStartedAt.current = Date.now();
        pollingAttempt.current = 0;
        if (isReplacement) {
          setReplacementStage("processing");
          onChanged(null);
        } else {
          setStatus("preparing");
          onChanged("preparing");
        }
        setErrorMessage(null);
        setNotice(
          isReplacement
            ? result.previousAssetAvailable
              ? "El nuevo video se está procesando. El anterior continúa disponible."
              : "El nuevo video se está procesando."
            : "El video se está procesando.",
        );
      } catch (error) {
        const uploadError =
          error instanceof DirectUploadError
            ? error
            : new DirectUploadError(
                error instanceof Error
                  ? error.message
                  : "No se pudo completar la subida.",
                "network",
              );
        logUploadStage(putStarted ? "put-failed" : "upload-session-invalid", {
          ...logContext,
          uploadId: result.uploadId,
          attemptId: result.attemptId,
          kind: uploadError.kind,
          httpStatus: uploadError.status,
        });

        let cleanupMessage: string | null = null;
        let cleanupSucceeded = false;
        try {
          const cleanup = await markLessonVideoUploadFailed({
            lessonId,
            uploadId: result.uploadId,
            attemptId: result.attemptId,
          });
          cleanupSucceeded = cleanup.ok;
          if (cleanup.ok) {
            authoritativeNoneRef.current = cleanup.video.status === "none";
            setPresentation(cleanup.video);
            setStatus(normalizeVideoStatus(cleanup.video));
          } else {
            cleanupMessage = cleanup.message;
          }
        } catch {
          cleanupMessage = "No se pudo cerrar de forma segura la subida fallida.";
        }

        setUploadFailure(authoritativeReplacement ? "replacement" : "initial");
        setReplacementStage(null);
        setTrackedUploadId(null);
        setTrackedAttemptId(null);
        setActiveUploadKind(null);
        uploadProcessingStartedAt.current = null;
        pollingAttempt.current = 0;
        replacementDiscoveryAttempts.current = 0;
        if (!cleanupSucceeded) {
          setStatus(authoritativeReplacement ? initialStatus : "errored");
        }
        setShowRecovery(!cleanupSucceeded);
        setNotice(null);
        setErrorMessage(
          cleanupMessage
            ? `${uploadError.message} ${cleanupMessage}`
            : uploadError.message,
        );
      }
    } catch (error) {
      logUploadStage("create-upload-exception", {
        ...logContext,
        type: error instanceof Error ? error.name : "unknown",
      });
      setUploadFailure(authoritativeReplacement ? "replacement" : "initial");
      setTrackedUploadId(null);
      setTrackedAttemptId(null);
      setActiveUploadKind(null);
      uploadProcessingStartedAt.current = null;
      pollingAttempt.current = 0;
      replacementDiscoveryAttempts.current = 0;
      if (authoritativeReplacement) {
        setReplacementStage(null);
        setStatus(initialStatus);
      }
      else setStatus(initialStatus);
      setShowRecovery(true);
      setNotice(null);
      setErrorMessage(
        "No se pudo iniciar la subida. Revisa la conexión e inténtalo de nuevo.",
      );
    } finally {
      inFlight.current = false;
    }
  }

  const statusLabel = status ? STATUS_LABELS[status] : null;
  const validatingVideo =
    !policySyncing &&
    replacementStage === null &&
    uploadFailure === null &&
    !hasPresentation &&
    (status === "ready" || status === "errored");
  const longPendingState = policySyncing
    ? {
        title: "Actualizando el acceso del video…",
        description: "Conservamos el acceso anterior hasta confirmar el cambio.",
      }
    : replacementStage === "processing"
      ? {
          title: "Procesando nuevo video…",
          description: "El video anterior continúa disponible.",
        }
      : status === "preparing"
        ? {
            title: "Procesando video…",
            description: "Esto puede tardar unos segundos.",
          }
        : validatingVideo
          ? {
              title: "Validando video…",
              description: "Comprobando el estado actual antes de continuar.",
            }
          : null;
  const shortPendingTitle =
    replacementStage === "starting"
      ? "Preparando el reemplazo…"
      : status === "starting"
        ? "Preparando subida…"
        : null;
  const statusDescription =
    uploadFailure === "replacement"
      ? "No se completó el reemplazo. El video anterior continúa disponible."
      : uploadFailure === "initial"
        ? `No se pudo subir el video de ${quickGuide ? "este paso" : "esta lección"}.`
    : longPendingState || shortPendingTitle
      ? null
      : replacementStage === "uploading"
        ? `Subiendo nuevo video… ${progress}%`
    : status === null
      ? `Añade el video de ${quickGuide ? "este paso" : "esta lección"}.`
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
          {statusDescription && (
            <p
              className="mt-1 text-sm text-white/40"
              aria-live={
                status === "uploading" || replacementStage === "uploading"
                  ? "off"
                  : "polite"
              }
            >
              {statusDescription}
            </p>
          )}
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
              onClick={() => {
                if (inputRef.current) inputRef.current.value = "";
              }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void handleFile(file, status === "ready");
              }}
            />
          </label>
        )}
      </div>
      {shortPendingTitle && (
        <SectionLoader title={shortPendingTitle} className="mt-4" />
      )}
      {longPendingState && (
        <PendingState
          compact
          title={longPendingState.title}
          description={longPendingState.description}
          className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4"
        />
      )}
      {showRecovery &&
        (status === "preparing" ||
          status === "errored" ||
          replacementStage === "processing" ||
          policySyncing ||
          policyFailed ||
          uploadFailure !== null) && (
        <details className="mt-4 w-fit text-xs text-white/40">
          <summary className="cursor-pointer list-none transition hover:text-white/65 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            Problemas con el procesamiento
          </summary>
          <button type="button" disabled={checking || uploadInProgress} className="mt-3 rounded-full border border-white/10 px-4 py-2 text-xs text-white/55 transition hover:border-white/20 hover:text-white disabled:opacity-40" onClick={async () => {
          setChecking(true);
          setErrorMessage(null);
          try {
            const requestGeneration = ++asyncGenerationRef.current;
            const result = await reconcileLessonVideo(lessonId);
            if (requestGeneration !== asyncGenerationRef.current) return;
            if (!result.ok) {
              if ("video" in result && result.video) {
                setPresentation(result.video);
              }
              if ("replacementFailed" in result && result.replacementFailed) {
                setReplacementStage(null);
                setTrackedUploadId(null);
                setTrackedAttemptId(null);
                setActiveUploadKind(null);
                uploadProcessingStartedAt.current = null;
                pollingAttempt.current = 0;
                replacementDiscoveryAttempts.current = 0;
              }
              setShowRecovery(true);
              setErrorMessage(result.message);
              return;
            }

            const video = result.video;
            if (video.status === "none") {
              asyncGenerationRef.current += 1;
            }
            authoritativeNoneRef.current = video.status === "none";
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
              setTrackedUploadId(null);
              setTrackedAttemptId(null);
              setActiveUploadKind(null);
              uploadProcessingStartedAt.current = null;
              pollingAttempt.current = 0;
              replacementDiscoveryAttempts.current = 0;
            }
            setShowRecovery(
              nextStatus === "preparing" ||
                nextStatus === "errored" ||
                Boolean(replacementPending) ||
                policyFailed,
            );
            setErrorMessage(null);
            setUploadFailure(null);
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

      {notice && !longPendingState && (
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

function nextPollingDelay(attempt: number) {
  // The first check runs immediately. These delays produce checks at roughly
  // 0s, 2s, 4s, 6s, 8s, then progressively back off while processing continues.
  if (attempt < 4) return 2000;
  if (attempt < 7) return 5000;
  return 8000;
}

function uploadFile(
  uploadUrl: string,
  file: File,
  onProgress: (percentage: number) => void
) {
  return new Promise<number>((resolve, reject) => {
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
        resolve(request.status);
      } else {
        reject(
          new DirectUploadError(
            `Mux rechazó la subida (HTTP ${request.status}).`,
            "http",
            request.status,
          ),
        );
      }
    });
    request.addEventListener("error", () =>
      reject(
        new DirectUploadError(
          "No se pudo conectar con Mux. Revisa la conexión o la configuración CORS.",
          "network",
        ),
      ),
    );
    request.addEventListener("abort", () =>
      reject(new DirectUploadError("La subida fue cancelada.", "abort")),
    );
    request.send(file);
  });
}
