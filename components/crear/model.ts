import type {
  CrearItem,
  CrearItemState,
  CrearItemType,
  CrearMessage,
  CrearReaction,
  CrearSession,
  CrearSessionDetail,
} from "@/lib/crear/types";

export type { CrearItem, CrearItemState, CrearItemType, CrearMessage, CrearReaction, CrearSession, CrearSessionDetail };

export class CrearApiError extends Error {
  constructor(message: string, readonly code: string | null = null) {
    super(message);
    this.name = "CrearApiError";
  }
}

export async function crearJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.userMessage === "string"
      ? payload.userMessage
      : typeof payload.error === "string"
        ? payload.error
        : "No pudimos completar esta acción.";
    throw new CrearApiError(message, typeof payload.code === "string" ? payload.code : null);
  }
  return payload as T;
}

export function sessionsFromPayload(payload: { sessions?: CrearSession[] } | CrearSession[]) {
  return Array.isArray(payload) ? payload : payload.sessions ?? [];
}

export function sessionFromPayload(payload: { session?: CrearSession } | CrearSession): CrearSession | null {
  const wrapped = payload as { session?: CrearSession };
  if (wrapped.session) return wrapped.session;
  return payload as CrearSession;
}

export function itemFromPayload(payload: { item?: CrearItem } | CrearItem): CrearItem | null {
  const wrapped = payload as { item?: CrearItem };
  if (wrapped.item) return wrapped.item;
  return payload as CrearItem;
}

export function formatCrearDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Reciente";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

export function shortText(value: string, maximum = 92) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1)}…` : normalized;
}
