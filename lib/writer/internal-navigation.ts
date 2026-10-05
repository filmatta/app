export type WriterInternalHistory = {
  entries: string[];
  index: number;
};

export const WRITER_INTERNAL_HISTORY_LIMIT = 24;

export function writerInternalHistoryStorageKey(userId: string) {
  return `filmatta.writer.internal-history.v1:${userId}`;
}

export function sanitizeWriterInternalRoute(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value, "https://filmatta.local");
  } catch {
    return null;
  }
  if (url.origin !== "https://filmatta.local") return null;
  const allowed = /^\/(?:writer(?:\/[0-9a-f-]{36}(?:\/timeline)?)?|shotlists(?:\/[0-9a-f-]{36})?)\/?$/iu;
  if (!allowed.test(url.pathname)) return null;
  const safe = new URLSearchParams();
  const scene = url.searchParams.get("scene");
  if (scene && /^[0-9a-f-]{36}$/iu.test(scene)) safe.set("scene", scene);
  return `${url.pathname}${safe.size ? `?${safe.toString()}` : ""}`;
}

export function parseWriterInternalHistory(value: string | null): WriterInternalHistory {
  if (!value) return { entries: [], index: -1 };
  try {
    const parsed = JSON.parse(value) as Partial<WriterInternalHistory>;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.flatMap((entry) => typeof entry === "string" ? [sanitizeWriterInternalRoute(entry)] : []).filter((entry): entry is string => Boolean(entry)).slice(-WRITER_INTERNAL_HISTORY_LIMIT)
      : [];
    const index = Number.isSafeInteger(parsed.index)
      ? Math.min(Math.max(Number(parsed.index), entries.length ? 0 : -1), entries.length - 1)
      : entries.length - 1;
    return { entries, index };
  } catch {
    return { entries: [], index: -1 };
  }
}

export function recordWriterInternalRoute(history: WriterInternalHistory, rawRoute: string): WriterInternalHistory {
  const route = sanitizeWriterInternalRoute(rawRoute);
  if (!route) return history;
  if (history.entries[history.index] === route) return history;
  const previousIndex = history.index - 1;
  const nextIndex = history.index + 1;
  if (previousIndex >= 0 && history.entries[previousIndex] === route) return { ...history, index: previousIndex };
  if (nextIndex < history.entries.length && history.entries[nextIndex] === route) return { ...history, index: nextIndex };
  const entries = [...history.entries.slice(0, history.index + 1), route].slice(-WRITER_INTERNAL_HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
}

export function stepWriterInternalHistory(history: WriterInternalHistory, direction: -1 | 1) {
  const index = history.index + direction;
  if (index < 0 || index >= history.entries.length) return null;
  return { history: { ...history, index }, route: history.entries[index] };
}
