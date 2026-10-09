"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type CoverActionResult = { ok: true; message: string } | { ok: false; message: string };
type CoverRequest = { path: string } | { remove: true };

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPLOAD_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp",
};

/** A small confirmation request; image bytes go browser → Supabase Storage. */
export async function updateWorkspaceProjectCover(
  projectId: string,
  input: CoverRequest,
): Promise<CoverActionResult> {
  if (!PROJECT_ID.test(projectId)) return { ok: false, message: "No encontramos este proyecto." };
  const request = input && typeof input === "object" ? input as { path?: unknown; remove?: unknown } : {};
  const newPath = typeof request.path === "string" ? request.path : null;
  const removeCover = request.remove === true;
  if ((newPath === null && !removeCover) || (newPath !== null && removeCover)) {
    return { ok: false, message: "La solicitud de portada no es válida." };
  }

  const db = await createClient();
  const auth = await db.auth.getUser();
  if (auth.error || !auth.data.user) {
    return { ok: false, message: "Inicia sesión para cambiar la portada." };
  }
  const userId = auth.data.user.id;

  const project = await db.from("projects")
    .select("cover_image_path")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .eq("create_enabled", true)
    .neq("lifecycle_status", "archived")
    .maybeSingle();
  if (project.error || !project.data) {
    return { ok: false, message: "No encontramos este proyecto." };
  }
  const previousPath = project.data.cover_image_path as string | null;

  if (newPath) {
    const parts = newPath.split("/");
    const name = parts[2] ?? "";
    const match = UPLOAD_NAME.exec(name);
    if (parts.length !== 3 || parts[0] !== userId || parts[1] !== projectId || !match) {
      return { ok: false, message: "La ruta de la portada no es válida." };
    }
    if (newPath === previousPath) return { ok: true, message: "La portada ya está guardada." };
    const mime = MIME_BY_EXTENSION[match[1].toLowerCase()];
    if (!(await verifyUploadedCover(db, newPath, mime))) {
      await removeCoverObject(db, newPath);
      return { ok: false, message: "Usa una imagen JPEG, PNG o WebP de hasta 5 MB." };
    }
  }

  let update = db.from("projects")
    .update({ cover_image_path: newPath, cover_source: newPath ? "uploaded" : null })
    .eq("id", projectId)
    .eq("owner_id", userId)
    .eq("create_enabled", true);
  update = previousPath === null
    ? update.is("cover_image_path", null)
    : update.eq("cover_image_path", previousPath);
  const saved = await update.select("id").maybeSingle();
  if (saved.error || !saved.data) {
    if (newPath) await removeCoverObject(db, newPath);
    console.error("Workspace cover association failed", { code: saved.error?.code ?? "stale" });
    return { ok: false, message: "La portada cambió. Actualiza la página e inténtalo de nuevo." };
  }

  if (previousPath && previousPath !== newPath) await removeCoverObject(db, previousPath);
  revalidatePath("/create");
  revalidatePath(`/create/projects/${projectId}`);
  return { ok: true, message: newPath ? "Portada actualizada." : "Portada eliminada." };
}

async function verifyUploadedCover(db: Awaited<ReturnType<typeof createClient>>, path: string, mime: string) {
  const object = await db.storage.from("project-covers").info(path);
  if (object.error || !object.data) {
    console.error("Workspace cover metadata unavailable", { code: object.error?.name ?? "missing" });
    return false;
  }
  const info = object.data as unknown as Record<string, unknown>;
  const metadata = info.metadata && typeof info.metadata === "object" ? info.metadata as Record<string, unknown> : {};
  const size = Number(info.size ?? metadata.size ?? metadata.contentLength);
  const contentType = String(info.contentType ?? info.mimetype ?? metadata.mimetype ?? metadata.contentType ?? "");
  if (!Number.isFinite(size) || size < 1 || size > MAX_COVER_BYTES || contentType !== mime) return false;

  const file = await db.storage.from("project-covers").download(path);
  if (file.error || !file.data || file.data.size !== size) {
    console.error("Workspace cover download unavailable", { code: file.error?.name ?? "size" });
    return false;
  }
  return hasImageSignature(file.data, mime);
}

async function hasImageSignature(file: Blob, mime: string) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    .every((value, index) => bytes[index] === value);
  if (mime === "image/webp") return [0x52, 0x49, 0x46, 0x46].every((value, index) => bytes[index] === value)
    && [0x57, 0x45, 0x42, 0x50].every((value, index) => bytes[index + 8] === value);
  return false;
}

async function removeCoverObject(db: Awaited<ReturnType<typeof createClient>>, path: string) {
  const removed = await db.storage.from("project-covers").remove([path]);
  if (removed.error) console.error("Workspace cover cleanup failed", { code: removed.error.name });
}
