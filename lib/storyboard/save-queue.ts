export type StoryboardSaveState = "saved" | "saving" | "error";

export type StoryboardSaveResult = {
  revisionId: string;
  revisionNumber: number;
  noOp: boolean;
};

type Pending<T> = { value: T; sequence: number; operationId: string };

export class StoryboardSaveCoordinator<T> {
  private baseRevisionId: string;
  private readonly save: (input: Pending<T> & { expectedRevisionId: string }) => Promise<StoryboardSaveResult>;
  private readonly onState: (state: StoryboardSaveState, result?: StoryboardSaveResult, error?: unknown) => void;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private pending: Pending<T> | null = null;
  private running: Promise<void> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;

  constructor(
    baseRevisionId: string,
    save: (input: Pending<T> & { expectedRevisionId: string }) => Promise<StoryboardSaveResult>,
    onState: (state: StoryboardSaveState, result?: StoryboardSaveResult, error?: unknown) => void,
    debounceMs = 900,
    maxWaitMs = 5_000,
  ) {
    this.baseRevisionId = baseRevisionId;
    this.save = save;
    this.onState = onState;
    this.debounceMs = debounceMs;
    this.maxWaitMs = maxWaitMs;
  }

  enqueue(value: T) {
    this.sequence += 1;
    this.pending = { value, sequence: this.sequence, operationId: crypto.randomUUID() };
    this.onState("saving");
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => { void this.flush().catch(() => undefined); }, this.debounceMs);
    if (!this.maxTimer) this.maxTimer = setTimeout(() => { void this.flush().catch(() => undefined); }, this.maxWaitMs);
    return this.sequence;
  }

  async flush() {
    this.clearTimers();
    if (this.running) await this.running;
    if (!this.pending) return;
    this.running = this.drain();
    try { await this.running; } finally {
      this.running = null;
      if (!this.pending) this.clearTimers();
    }
  }

  get revisionId() {
    return this.baseRevisionId;
  }

  get hasPending() {
    return this.pending !== null || this.running !== null;
  }

  private async drain() {
    while (this.pending) {
      const job = this.pending;
      this.pending = null;
      try {
        const result = await this.save({ ...job, expectedRevisionId: this.baseRevisionId });
        this.baseRevisionId = result.revisionId;
        this.onState(this.pending ? "saving" : "saved", result);
      } catch (error) {
        const newer = this.pending as Pending<T> | null;
        if (!newer || newer.sequence < job.sequence) this.pending = job;
        this.onState("error", undefined, error);
        throw error;
      }
    }
  }

  private clearTimers() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.debounceTimer = null;
    this.maxTimer = null;
  }
}
