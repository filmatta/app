export class TimelineRefreshCoordinator {
  private active = true;
  private queued = false;
  private running = false;
  private idlePromise: Promise<void> = Promise.resolve();
  private task: () => Promise<void>;
  private readonly onBusy: (busy: boolean) => void;

  constructor(task: () => Promise<void>, onBusy: (busy: boolean) => void = () => undefined) {
    this.task = task;
    this.onBusy = onBusy;
  }

  updateTask(task: () => Promise<void>) {
    this.task = task;
  }

  setActive(active: boolean) {
    this.active = active;
    if (!active) this.queued = false;
  }

  request() {
    if (!this.active) return;
    this.queued = true;
    if (this.running) return;
    this.idlePromise = this.drain();
  }

  whenIdle() {
    return this.idlePromise;
  }

  private async drain() {
    this.running = true;
    this.onBusy(true);
    try {
      while (this.active && this.queued) {
        this.queued = false;
        await this.task();
      }
    } finally {
      this.running = false;
      this.onBusy(false);
      if (this.active && this.queued) {
        this.idlePromise = this.drain();
        await this.idlePromise;
      }
    }
  }
}
