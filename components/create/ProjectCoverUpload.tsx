"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateWorkspaceProjectCover } from "@/app/create/projects/cover-actions";
import { createClient } from "@/lib/supabase/client";

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

export default function ProjectCoverUpload({ projectId, hasCover }: { projectId: string; hasCover: boolean }) {
  const inputId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function run(operation: () => Promise<{ ok: boolean; message: string }>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await operation();
      setFeedback(result);
      if (result.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    } catch {
      setFeedback({ ok: false, message: "No pudimos cambiar la portada. Inténtalo de nuevo." });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function upload(file: File) {
    const extension = EXTENSIONS[file.type];
    if (!extension || file.size < 1 || file.size > MAX_COVER_BYTES) {
      return { ok: false, message: "Usa una imagen JPEG, PNG o WebP de hasta 5 MB." };
    }
    const db = createClient();
    const auth = await db.auth.getUser();
    if (auth.error || !auth.data.user) return { ok: false, message: "Inicia sesión para cambiar la portada." };
    const path = `${auth.data.user.id}/${projectId}/${crypto.randomUUID()}.${extension}`;
    const stored = await db.storage.from("project-covers").upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (stored.error) return { ok: false, message: "No pudimos subir la portada. Inténtalo de nuevo." };
    let linked = false;
    try {
      const result = await updateWorkspaceProjectCover(projectId, { path });
      linked = result.ok;
      return result;
    } finally {
      if (!linked) await db.storage.from("project-covers").remove([path]);
    }
  }

  return <div className="flex flex-wrap items-end gap-2 text-sm">
    <form ref={formRef} onSubmit={(event) => {
      event.preventDefault();
      const file = new FormData(event.currentTarget).get("cover_image");
      if (file instanceof File) void run(() => upload(file));
    }} className="flex flex-wrap items-end gap-2">
      <label htmlFor={inputId} className="grid gap-1 text-white/65">
        <span>Subir imagen</span>
        <input id={inputId} name="cover_image" type="file" accept="image/jpeg,image/png,image/webp" required
          className="max-w-64 text-xs text-white/60 file:mr-3 file:rounded-md file:border file:border-white/20 file:bg-neutral-900 file:px-3 file:py-2 file:text-white" />
      </label>
      <button type="submit" disabled={busy} className="rounded-md border border-white/25 px-3 py-2 text-white transition hover:border-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50">
        {busy ? "Guardando…" : hasCover ? "Cambiar portada" : "Guardar portada"}
      </button>
    </form>
    {hasCover && <button type="button" disabled={busy} onClick={() => { void run(() => updateWorkspaceProjectCover(projectId, { remove: true })); }}
      className="rounded-md px-3 py-2 text-white/60 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50">
      Quitar portada
    </button>}
    {feedback && <p role={feedback.ok ? "status" : "alert"} className={`w-full text-xs ${feedback.ok ? "text-white/60" : "text-red-300"}`}>{feedback.message}</p>}
  </div>;
}
