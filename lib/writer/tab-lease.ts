"use client";

export type WriterTabLease = {
  blocked: boolean;
  takeOver: () => void;
  release: () => void;
};

export function startWriterTabLease({
  userId,
  scriptId,
  sessionId,
  onBlocked,
}: {
  userId: string;
  scriptId: string;
  sessionId: string;
  onBlocked: (blocked: boolean) => void;
}): WriterTabLease {
  const storageKey = `filmatta-writer-lease::${userId}::${scriptId}`;
  const channel = new BroadcastChannel(`filmatta-writer::${userId}::${scriptId}`);
  let ownsLease = false;
  let stopped = false;

  const readLease = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
        sessionId?: string;
        at?: number;
      } | null;
      return parsed && typeof parsed.sessionId === "string" && typeof parsed.at === "number"
        ? parsed
        : null;
    } catch {
      return null;
    }
  };
  const writeLease = () => {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId, at: Date.now() }));
  };
  const acquire = (force = false) => {
    const current = readLease();
    const occupied = current && current.sessionId !== sessionId && Date.now() - current.at! < 6_000;
    if (occupied && !force) {
      ownsLease = false;
      onBlocked(true);
      channel.postMessage({ type: "hello", sessionId });
      return;
    }
    ownsLease = true;
    writeLease();
    onBlocked(false);
    channel.postMessage({ type: force ? "takeover" : "active", sessionId });
  };

  channel.onmessage = (event) => {
    const message = event.data as { type?: string; sessionId?: string };
    if (!message || message.sessionId === sessionId) return;
    if (message.type === "takeover") {
      ownsLease = false;
      onBlocked(true);
    } else if (message.type === "hello" && ownsLease) {
      channel.postMessage({ type: "active", sessionId });
    } else if (message.type === "active" && !ownsLease) {
      onBlocked(true);
    }
  };

  const storageListener = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    const current = readLease();
    if (current?.sessionId !== sessionId && Date.now() - current!.at! < 6_000) {
      ownsLease = false;
      onBlocked(true);
    }
  };
  window.addEventListener("storage", storageListener);
  acquire();
  const heartbeat = window.setInterval(() => {
    if (!stopped && ownsLease) writeLease();
  }, 2_000);

  return {
    get blocked() {
      return !ownsLease;
    },
    takeOver() {
      acquire(true);
    },
    release() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(heartbeat);
      window.removeEventListener("storage", storageListener);
      channel.close();
      const current = readLease();
      if (ownsLease && current?.sessionId === sessionId) localStorage.removeItem(storageKey);
    },
  };
}
