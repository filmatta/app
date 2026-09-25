"use client";

import type { WriterSnapshot } from "./document.ts";

const DB_NAME = "filmatta-writer-v1";
const STORE_NAME = "drafts";
const DB_VERSION = 1;

export type LocalWriterDraft = WriterSnapshot & {
  key: string;
  origin: string;
  userId: string;
  scriptId: string;
  sessionId: string;
  baseRevision: number;
  pending: boolean;
  sequence: number;
  updatedAt: number;
};

export function writerDraftKey(
  origin: string,
  userId: string,
  scriptId: string,
  sessionId: string,
) {
  return [origin, userId, scriptId, sessionId].join("::");
}

export async function saveLocalWriterDraft(draft: LocalWriterDraft) {
  const db = await openWriterDb();
  await requestPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(draft));
  db.close();
}

export async function loadLocalWriterDrafts(
  origin: string,
  userId: string,
  scriptId: string,
) {
  const db = await openWriterDb();
  const all = (await requestPromise(
    db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll(),
  )) as LocalWriterDraft[];
  db.close();
  return all
    .filter(
      (draft) =>
        draft.origin === origin &&
        draft.userId === userId &&
        draft.scriptId === scriptId,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteLocalWriterDraft(key: string) {
  const db = await openWriterDb();
  await requestPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key));
  db.close();
}

async function openWriterDb() {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB no está disponible.");
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB está bloqueado por otra pestaña."));
  });
}

function requestPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falló IndexedDB."));
  });
}
