"use client";

import type { StoryboardDocument } from "./types";

const DB_NAME = "filmatta-storyboard-v1";
const STORE_NAME = "drafts";
const DB_VERSION = 1;

export type LocalStoryboardDraft = {
  key: string;
  origin: string;
  userId: string;
  shotlistId: string;
  panelId: string;
  sessionId: string;
  baseRevisionId: string;
  document: StoryboardDocument;
  visualNote: string | null;
  sequence: number;
  updatedAt: number;
};

export function storyboardDraftKey(origin: string, userId: string, panelId: string) {
  return [origin, userId, panelId].join("::");
}

export async function saveLocalStoryboardDraft(draft: LocalStoryboardDraft) {
  const db = await openDb();
  await requestPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(draft));
  db.close();
}

export async function loadLocalStoryboardDraft(origin: string, userId: string, panelId: string) {
  const db = await openDb();
  const draft = await requestPromise(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME)
    .get(storyboardDraftKey(origin, userId, panelId))) as LocalStoryboardDraft | undefined;
  db.close();
  return draft ?? null;
}

export async function deleteLocalStoryboardDraft(origin: string, userId: string, panelId: string) {
  const db = await openDb();
  await requestPromise(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME)
    .delete(storyboardDraftKey(origin, userId, panelId)));
  db.close();
}

async function openDb() {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB no está disponible.");
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la recuperación local."));
    request.onblocked = () => reject(new Error("La recuperación local está bloqueada por otra pestaña."));
  });
}

function requestPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falló la recuperación local."));
  });
}
