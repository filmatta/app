"use client";

import type { WriterSnapshot } from "./document.ts";
import {
  saveLocalWriterDraft,
  type LocalWriterDraft,
} from "./storage.ts";

export const WRITER_LOCAL_DEBOUNCE_MS = 300;
export const WRITER_REMOTE_DEBOUNCE_MS = 1_500;
export const WRITER_REMOTE_MAX_WAIT_MS = 10_000;
export const WRITER_RETRY_MS = 5_000;

export type WriterSaveStatus =
  | "cloud"
  | "saving"
  | "local"
  | "error"
  | "conflict"
  | "sessionExpired"
  | "deleted"
  | "tabBlocked";

export type WriterPersistenceState = {
  status: WriterSaveStatus;
  revision: number;
  localAvailable: boolean;
  message?: string;
};

export type RemoteSaveRequest = WriterSnapshot & {
  scriptId: string;
  operationId: string;
  expectedRevision: number;
  sequence: number;
};

export type RemoteSaveResult =
  | { status: "saved"; revision: number }
  | { status: "conflict"; revision?: number }
  | { status: "unauthorized" }
  | { status: "notFound" }
  | { status: "invalid"; message: string }
  | { status: "retryable"; message?: string };

type ControllerOptions = {
  origin: string;
  userId: string;
  scriptId: string;
  sessionId: string;
  initialSnapshot: WriterSnapshot;
  initialRevision: number;
  initialSequence?: number;
  initialPending?: boolean;
  saveRemote: (request: RemoteSaveRequest) => Promise<RemoteSaveResult>;
  saveLocal?: (draft: LocalWriterDraft) => Promise<void>;
  onState: (state: WriterPersistenceState) => void;
};

export class WriterPersistenceController {
  private readonly options: ControllerOptions;
  private snapshot: WriterSnapshot;
  private baseRevision: number;
  private sequence: number;
  private acknowledgedSequence: number;
  private localTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private retryRequest: RemoteSaveRequest | null = null;
  private destroyed = false;
  private paused = false;
  private localAvailable = true;
  private readonly key: string;

  constructor(options: ControllerOptions) {
    this.options = options;
    this.snapshot = options.initialSnapshot;
    this.baseRevision = options.initialRevision;
    this.sequence = options.initialSequence ?? 0;
    this.acknowledgedSequence = options.initialPending
      ? Math.max(-1, this.sequence - 1)
      : this.sequence;
    this.key = [options.origin, options.userId, options.scriptId, options.sessionId].join("::");
    this.emit("cloud");
  }

  getSnapshot() {
    return this.snapshot;
  }

  getRevision() {
    return this.baseRevision;
  }

  getSequence() {
    return this.sequence;
  }

  markChanged(snapshot: WriterSnapshot) {
    if (this.destroyed) return;
    this.snapshot = snapshot;
    this.sequence += 1;
    this.scheduleLocal();
    if (this.paused) {
      this.emit("tabBlocked");
      return;
    }
    this.emit("local");
    this.scheduleRemote();
  }

  async flush() {
    if (this.destroyed || this.paused || this.inFlight) return;
    this.clearTimer("remote");
    this.clearTimer("max");
    await this.persistLocal();
    if (this.sequence <= this.acknowledgedSequence && !this.retryRequest) {
      this.emit("cloud");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.emit("local", "Sin conexión; sincronizaremos cuando vuelva Internet.");
      return;
    }
    const request =
      this.retryRequest ??
      ({
        ...this.snapshot,
        scriptId: this.options.scriptId,
        operationId: crypto.randomUUID(),
        expectedRevision: this.baseRevision,
        sequence: this.sequence,
      } satisfies RemoteSaveRequest);
    this.retryRequest = request;
    this.inFlight = true;
    this.emit("saving");
    let result: RemoteSaveResult;
    try {
      result = await this.options.saveRemote(request);
    } catch {
      result = { status: "retryable", message: "No se pudo contactar al servidor." };
    }
    this.inFlight = false;
    if (this.destroyed) return;

    if (result.status === "saved") {
      this.baseRevision = result.revision;
      this.acknowledgedSequence = Math.max(this.acknowledgedSequence, request.sequence);
      this.retryRequest = null;
      await this.persistLocal();
      if (this.sequence > this.acknowledgedSequence) {
        this.emit("local");
        void this.flush();
      } else {
        this.emit("cloud");
      }
      return;
    }

    if (result.status === "conflict") {
      this.retryRequest = null;
      this.paused = true;
      this.emit("conflict", "La versión de la nube cambió en otro lugar.");
      return;
    }
    if (result.status === "unauthorized") {
      this.retryRequest = null;
      this.paused = true;
      this.emit("sessionExpired", "Tu sesión terminó. El trabajo permanece en este dispositivo.");
      return;
    }
    if (result.status === "notFound") {
      this.retryRequest = null;
      this.paused = true;
      this.emit("deleted", "El guion ya no existe en la nube. Puedes exportar esta copia.");
      return;
    }
    if (result.status === "invalid") {
      this.retryRequest = null;
      this.paused = true;
      this.emit("error", result.message);
      return;
    }
    this.emit("error", result.message ?? "No se pudo guardar en la nube.");
    this.scheduleRetry();
  }

  pauseForOtherTab() {
    this.paused = true;
    this.emit("tabBlocked", "Este guion se está editando en otra pestaña.");
  }

  resumeFromOtherTab() {
    this.paused = false;
    if (this.sequence > this.acknowledgedSequence) {
      this.emit("local");
      void this.flush();
    } else {
      this.emit("cloud");
    }
  }

  setInitialConflict(message = "La copia local y la nube cambiaron por separado.") {
    this.paused = true;
    this.emit("conflict", message);
  }

  async acceptRemote(snapshot: WriterSnapshot, revision: number) {
    this.snapshot = snapshot;
    this.baseRevision = revision;
    this.sequence += 1;
    this.acknowledgedSequence = this.sequence;
    this.retryRequest = null;
    this.paused = false;
    await this.persistLocal();
    this.emit("cloud");
  }

  overwriteFromCurrent(remoteRevision: number) {
    this.baseRevision = remoteRevision;
    this.retryRequest = null;
    this.paused = false;
    this.emit("local");
    void this.flush();
  }

  async destroy() {
    this.destroyed = true;
    this.clearAllTimers();
    await this.persistLocal();
  }

  private scheduleLocal() {
    this.clearTimer("local");
    this.localTimer = setTimeout(() => void this.persistLocal(), WRITER_LOCAL_DEBOUNCE_MS);
  }

  private scheduleRemote() {
    this.clearTimer("remote");
    this.remoteTimer = setTimeout(() => void this.flush(), WRITER_REMOTE_DEBOUNCE_MS);
    if (!this.maxTimer) {
      this.maxTimer = setTimeout(() => void this.flush(), WRITER_REMOTE_MAX_WAIT_MS);
    }
  }

  private scheduleRetry() {
    this.clearTimer("retry");
    this.retryTimer = setTimeout(() => void this.flush(), WRITER_RETRY_MS);
  }

  private async persistLocal() {
    this.clearTimer("local");
    const draft: LocalWriterDraft = {
      key: this.key,
      origin: this.options.origin,
      userId: this.options.userId,
      scriptId: this.options.scriptId,
      sessionId: this.options.sessionId,
      ...this.snapshot,
      baseRevision: this.baseRevision,
      pending: this.sequence > this.acknowledgedSequence,
      sequence: this.sequence,
      updatedAt: Date.now(),
    };
    try {
      await (this.options.saveLocal ?? saveLocalWriterDraft)(draft);
      this.localAvailable = true;
    } catch {
      this.localAvailable = false;
      this.emit("error", "No se pudo guardar en este dispositivo. Exporta un respaldo manual.");
    }
  }

  private emit(status: WriterSaveStatus, message?: string) {
    this.options.onState({
      status,
      revision: this.baseRevision,
      localAvailable: this.localAvailable,
      message,
    });
  }

  private clearTimer(kind: "local" | "remote" | "max" | "retry") {
    const field = `${kind}Timer` as const;
    const timer = this[field];
    if (timer) clearTimeout(timer);
    this[field] = null;
  }

  private clearAllTimers() {
    this.clearTimer("local");
    this.clearTimer("remote");
    this.clearTimer("max");
    this.clearTimer("retry");
  }
}
