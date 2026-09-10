"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createLessonVideoUpload,
  markLessonVideoUploadFailed,
} from "./video-actions";

type VideoStatus = "preparing" | "ready" | "errored" | null;
type LocalStatus = VideoStatus | "starting" | "uploading";

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
  quickGuide,
  disabled = false,
}: {
  lessonId: string;
  initialStatus: VideoStatus;
  quickGuide: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<LocalStatus>(initialStatus);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const busy = status === "starting" || status === "uploading";
  const canUpload = status === null || status === "errored";

  async function handleFile(file: File | undefined) {
    if (!file || busy) {
      return;
    }

    if (file.size === 0) {
      setMessage("Selecciona un archivo de video con contenido.");
      return;
    }

    if (file.type && !file.type.startsWith("video/")) {
      setMessage("El archivo seleccionado no parece ser un video.");
      return;
    }

    setMessage(null);
    setProgress(0);
    setStatus("starting");

    const result = await createLessonVideoUpload(lessonId);

    if (!result.ok) {
      setStatus(initialStatus);
      setMessage(result.message);
      resetInput();
      return;
    }

    setStatus("uploading");

    try {
      await uploadFile(result.uploadUrl, file, setProgress);
      setProgress(100);
      setStatus("preparing");
      setMessage("El archivo llegó a Mux y ahora se está procesando.");
      router.refresh();
    } catch {
      await markLessonVideoUploadFailed(lessonId);
      setStatus("errored");
      setMessage("La subida no se completó. Puedes intentarlo de nuevo.");
    } finally {
      resetInput();
    }
  }

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  const statusLabel = status ? STATUS_LABELS[status] : "Sin video";

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
          <p className="mt-1 text-xs text-white/35" aria-live="polite">
            Estado: {statusLabel}
            {status === "uploading" ? ` ${progress}%` : ""}
          </p>
        </div>

        {canUpload && (
          <label
            className={`inline-flex w-fit items-center justify-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition ${
              disabled || busy
                ? "cursor-not-allowed text-white/30"
                : "cursor-pointer text-white/70 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {status === "errored" ? "Reintentar subida" : "Subir video"}
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              disabled={disabled || busy}
              className="sr-only"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {status === "uploading" && (
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

      {message && (
        <p
          className={`mt-4 text-xs leading-5 ${
            status === "errored" ? "text-red-200" : "text-white/45"
          }`}
          role={status === "errored" ? "alert" : "status"}
        >
          {message}
        </p>
      )}

      <p className="mt-4 text-xs leading-5 text-white/25">
        El archivo se envía directamente a Mux y no pasa por los servidores de
        FILMATTA.
      </p>
    </section>
  );
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
